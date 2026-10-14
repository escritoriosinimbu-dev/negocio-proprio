import {
  SEGMENTOS, POLITICA, SETORES, CAPITAL_REFERENCIA, ENCARGOS_FOLHA, SALARIO_MINIMO, LIMITE_SIMPLES, TOLERANCIA_EXCESSO,
  LIMITE_ISENCAO_DIVIDENDOS, ALIQ_RETENCAO_DIVIDENDOS, HONORARIOS, SELIC_INICIAL, SPREAD_GIRO, SPREAD_PRONAMPE,
  CPP_FOLHA, INSS_PATRONAL,
} from './regras.js';
import { liquidoProLabore, apurar } from './tributos.js';

// Estado da empresa e indicadores derivados. Tudo aqui e funcao pura sobre o estado `s`,
// que e um objeto JSON simples (vai inteiro para o armazenamento do aparelho).

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const soma = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
export const SEG = s => SEGMENTOS[s.segmento];

export const VERSAO_ESTADO = 3;

export function novoJogo({ nome, segmento, capital, emprestimo, regime }) {
  const seg = SEGMENTOS[segmento];
  const s = {
    v: VERSAO_ESTADO, nome, segmento, mes: 0, regime, participacao: 1, capitalInicial: capital,
    caixa: capital - seg.setup + emprestimo,
    func: { ...seg.funcInicial },
    dec: {
      preco: seg.precoRef, marketing: Math.round(seg.mkEscala * 0.5 / 100) * 100,
      qualidade: Math.round(seg.qEscala * 0.4 / 100) * 100, producao: 0, producaoAuto: true, proLabore: 3000,
      politica: 'mercado', prazo: false, func: { ...seg.funcInicial },
      emprestimo: 0, distribuir: 0,
      // preco fixo ou recalculado todo mes pela margem de contribuicao desejada
      modoPreco: 'preco', margemAlvo: 0.4, seguro: false,
    },
    precoRef: seg.precoRef, custoMat: seg.custoMat,
    equipNivel: 0, espacoNivel: 0, expansoes: [], mercadoMult: 1, aluguelExtra: 0,
    imobilizado: seg.setup, deprecAcum: 0, estoque: 0, valorEstoque: 0,
    A: 10, Q: 50, M: 65, economia: 1, selic: SELIC_INICIAL, selicTendencia: 0, indice: 1,
    // fatia da procura tomada por concorrentes que entraram no mercado (cresce com o sucesso)
    concorrencia: 0,
    // clientes da carteira (ramos recorrentes)
    carteira: seg.carteiraInicial || 0,
    // contrato de fornecimento com preco travado: { ate, minimo }
    contratoFornecedor: null,
    // contrato de fornecimento para um grande cliente: { qtd, preco, ate }
    contratoCliente: null,
    // fornecedor alternativo mais barato, com risco de falhar a entrega
    fornecedorArriscado: false,
    emprestimos: emprestimo > 0 ? [{ nome: 'Pronampe', saldo: emprestimo, taxa: taxaPronampe(SELIC_INICIAL), amort: emprestimo / 36, posFixado: true }] : [],
    recebiveis: [], pedidos: [], efeitos: [], extras: 0, salExtra: 0,
    prejuizo: { simples: 0, presumido: 0, real: 0 },
    // saldo credor de ICMS e PIS/COFINS por regime (o comparativo simula os tres)
    saldoCredor: {},
    hist: [], negativos: 0, fim: null, evento: null, modoLivre: false,
    excluidoSimples: false, investidorUsado: false, creditoUsado: false,
    investidoMes: 0, captadoMes: 0, distribuidoMes: 0, quitadoMes: 0, financiadoMes: 0,
    dividendosDonoMes: 0, irrfDivMes: 0,
    lucroAcum: 0, distribuido: 0, retirado: 0, irrfDiv: 0, proLaboreAcum: 0,
    // saldo de prejuizo fiscal de verdade (Lalur): so nasce em meses apurados no Lucro Real
    prejuizoFiscal: 0,
    // politica salarial ja praticada: salario de quem esta empregado nao pode cair (CF, art. 7o, VI)
    politicaPaga: 'mercado',
  };
  s.dec.producao = Math.min(capacidades(s, s.dec.func).capacidade, Math.round(demandaEsperada(s) * 1.1 / 10) * 10);
  return s;
}

// Efeitos temporarios: valem do mes `de` (inclusive; ausente = ja vale) ate antes de `ate`.
export function efeito(s, tipo, mes = s.mes) {
  return s.efeitos.filter(e => e.tipo === tipo && e.ate > mes && (e.de ?? -Infinity) <= mes).reduce((m, e) => m * e.mult, 1);
}

// Preco medio cobrado pelo mercado (guerras de preco o derrubam por um tempo).
export function precoMercado(s) { return s.precoRef * efeito(s, 'precoMercado'); }

// Preco que o cliente acha justo pelo que recebe: qualidade e reputacao deixam cobrar mais.
// Com qualidade e reputacao 50, e o preco de mercado.
export function precoJusto(s) {
  return precoMercado(s) * (0.85 + 0.3 * s.Q / 100) * (0.94 + 0.12 * s.A / 100);
}

// Depois do nivel 5, cada nivel de equipamento rende metade.
export function nivelEfetivo(n) { return Math.min(n, 5) + 0.5 * Math.max(0, n - 5); }

export function capacidades(s, func = s.func) {
  const seg = SEG(s);
  const total = func.producao + func.comercial + func.adm;
  const capAdm = 6 + 12 * func.adm;
  const desorg = func.producao + func.comercial > capAdm;
  const capEspaco = 10 + 10 * s.espacoNivel;
  const apertado = total > capEspaco;
  const moral = 0.7 + 0.45 * s.M / 100;
  const fator = moral * (1 + seg.ganhoEquip * nivelEfetivo(s.equipNivel)) * (desorg ? 0.9 : 1) * (apertado ? 0.85 : 1) * efeito(s, 'producao');
  return {
    capacidade: Math.floor(func.producao * seg.prodPorFunc * fator),
    cobertura: Math.floor((seg.capDono + func.comercial * seg.capVenda * moral) * (desorg ? 0.9 : 1)),
    desorg, apertado, capAdm, capEspaco, total,
  };
}

// Procura que o mercado oferece neste mes. O preco e comparado com o preco justo (qualidade e
// reputacao); a reputacao tambem decide quanta gente conhece a marca.
export function procuraDoMercado(s, d = s.dec) {
  const seg = SEG(s);
  const conhecem = 0.15 + 0.85 * s.A / 100;
  return seg.mercado * s.mercadoMult * Math.pow(precoJusto(s) / d.preco, seg.elasticidade) * conhecem
    * seg.sazonal[s.mes % 12] * s.economia * (d.prazo ? 1.15 : 1) * efeito(s, 'demanda') * (1 - s.concorrencia);
}

// Procura esperada do mes. Nos ramos de carteira (recorrente), quem ja e cliente fica e a procura
// anda so uma parte do caminho ate a do mercado: ganhar e perder clientes leva meses.
export function demandaEsperada(s, d = s.dec) {
  const alvo = procuraDoMercado(s, d), r = SEG(s).recorrente;
  return r ? s.carteira + (alvo - s.carteira) * r : alvo;
}

// Plano automatico da industria: procura prevista + 5% + pedidos especiais - estoque.
export function planoProducaoAuto(s) {
  const contrato = s.contratoCliente && s.mes < s.contratoCliente.ate ? s.contratoCliente.qtd : 0;
  return Math.max(0, Math.round((demandaEsperada(s) * 1.05 + soma(s.pedidos, p => p.qtd) + contrato - s.estoque) / 10) * 10);
}

// Indice de reajuste acumulado (salarios, aluguel, honorarios): sobe todo janeiro.
export const indice = s => s.indice || 1;

export function salario(seg, setor, politica, idx = 1) {
  return { producao: seg.salProd, comercial: seg.salCom, adm: seg.salAdm }[setor] * POLITICA[politica].fator * idx;
}

export function aluguelMes(s) {
  const seg = SEG(s);
  return (seg.aluguel * (1 + 0.7 * s.espacoNivel) + s.aluguelExtra) * indice(s);
}

export function folhaPrevista(s, func = s.dec.func, politica = s.dec.politica) {
  const seg = SEG(s);
  return soma(SETORES, setor => func[setor] * salario(seg, setor, politica, indice(s))) + (func.producao > 0 ? s.salExtra : 0);
}

// --- Margem e ponto de equilibrio (estimativas para a tela de preco) ---

// Tributo sobre a venda como fracao da receita: o do ultimo mes, ou uma estimativa antes dele.
export function aliqVendaEstimada(s) {
  const h = s.hist.at(-1);
  if (h && h.receita > 0) return h.tribVenda / h.receita;
  // antes do primeiro mes: apura um mes tipico com a procura e o preco atuais
  const seg = SEG(s), qtd = Math.max(1, procuraDoMercado(s)), receita = qtd * s.dec.preco, compras = qtd * s.custoMat;
  const op = {
    seg, receita, compras, cmv: compras, folha: 0, proLabore: s.dec.proLabore, despesas: 0, aluguel: 0, utilidades: 0,
    depreciacao: 0, juros: 0, rbt12: receita * 12, fatorR: 0.3, impedidoSublimite: false,
  };
  return apurar(s.regime, op, 0).tribVenda / receita;
}
// Parte variavel de "outras despesas": energia, gas e taxas de cartao (2,5% da receita).
export const DESPESA_VARIAVEL = 0.025;

// Custo do insumo por unidade vendida. A perda de estoque (mercadinho) e a do estoque que ja existe,
// rateada pelas vendas previstas: a mesma regra do fechamento.
export function custoInsumoUnit(s) {
  const seg = SEG(s);
  const perda = seg.perecivel && s.estoque > 0 ? s.valorEstoque * seg.perecivel / Math.max(1, demandaEsperada(s)) : 0;
  return s.custoMat * (seg.tipo === 'comercio' && !seg.estocavel ? 1.06 : 1) + perda;
}

// Quanto sobra de cada unidade vendida para pagar os custos fixos e dar lucro.
export function margemContribuicao(s, preco = s.dec.preco) {
  return preco * (1 - aliqVendaEstimada(s) - DESPESA_VARIAVEL) - custoInsumoUnit(s);
}

// Maior margem que da para pedir: o resto do preco ainda precisa cobrir tributos e despesas variaveis.
export function margemMaxima(s) {
  return Math.floor((1 - aliqVendaEstimada(s) - DESPESA_VARIAVEL - 0.02) * 100) / 100;
}

// Preco que da a margem de contribuicao desejada (fracao do preco), dentro da mesma faixa do preco
// manual (60% a 160% do mercado).
export function precoPelaMargem(s, margem = s.dec.margemAlvo) {
  const livre = 1 - Math.min(margem, margemMaxima(s)) - aliqVendaEstimada(s) - DESPESA_VARIAVEL;
  const preco = custoInsumoUnit(s) / Math.max(0.01, livre);
  return Math.round(clamp(preco, 0.6 * precoMercado(s), 1.6 * precoMercado(s)) * 100) / 100;
}

export function premioSeguro(s) {
  return Math.round((150 + 0.003 * (s.imobilizado - s.deprecAcum + s.valorEstoque)) / 10) * 10;
}

// Custos que nao dependem do volume vendido, num mes tipico com as decisoes atuais.
export function custosFixos(s) {
  const d = s.dec, folha = folhaPrevista(s);
  // fora do Simples, a contribuicao patronal (INSS, RAT e terceiros) sai por fora do DAS
  const cpp = s.regime === 'simples' ? 0 : folha * CPP_FOLHA + d.proLabore * INSS_PATRONAL;
  return folha * (1 + ENCARGOS_FOLHA) + cpp + d.proLabore + aluguelMes(s)
    + d.marketing + d.qualidade + (HONORARIOS[s.regime] + 600) * indice(s) + (d.seguro ? premioSeguro(s) : 0)
    + soma(s.emprestimos, e => e.saldo * e.taxa) + s.imobilizado / 120;
}

export function pontoEquilibrio(s, preco = s.dec.preco) {
  const mc = margemContribuicao(s, preco);
  return mc > 0 ? custosFixos(s) / mc : Infinity;
}

export function dividaTotal(s) { return soma(s.emprestimos, e => e.saldo); }
export function totalReceber(s) { return soma(s.recebiveis, r => r.valor); }

export function patrimonio(s) {
  return s.caixa + totalReceber(s) + s.valorEstoque + (s.imobilizado - s.deprecAcum) - dividaTotal(s);
}

export function lucro12(s) { return soma(s.hist.slice(-12), h => h.lucro); }
// Patrimonio liquido, trocando o imobilizado pelo valor do lucro que ele gera quando este e maior:
// caixa + recebiveis + estoque - divida + max(imobilizado liquido, 3x o lucro de 12 meses).
// Somar PL + 3x lucro contava duas vezes os equipamentos que produzem esse lucro.
export function valorEmpresa(s) {
  const imob = s.imobilizado - s.deprecAcum;
  return Math.max(0, patrimonio(s) + Math.max(0, 3 * Math.max(0, lucro12(s)) - imob));
}

export function mediaReceita(s, n = 3) {
  const h = s.hist.slice(-n);
  return h.length ? soma(h, x => x.receita) / h.length : 0;
}

export function limiteCredito(s) {
  return Math.max(0, Math.floor((30000 + 1.5 * mediaReceita(s) - dividaTotal(s)) / 1000) * 1000);
}

export const selicMensal = selic => Math.pow(1 + selic, 1 / 12) - 1;
// Capital de giro: prefixado na contratacao pela Selic do dia + spread.
export function taxaCapitalGiro(s) { return selicMensal(s.selic) + SPREAD_GIRO + (patrimonio(s) < 0 ? 0.01 : 0); }
// Pronampe: Selic + 6% ao ano, recalculado todo mes.
export function taxaPronampe(selic) { return selicMensal(selic + SPREAD_PRONAMPE); }
export function limiteCheque(s) { return 20000 + 0.5 * mediaReceita(s); }

// O que o dono levou: pro-labore liquido de INSS e IRRF, lucros recebidos (liquidos de retencao)
// e a parte dele no valor da empresa.
export function riquezaDono(s) {
  return s.retirado + soma(s.hist, h => liquidoProLabore(h.proLabore)) + s.participacao * valorEmpresa(s);
}

// Fator salarial mais baixo permitido: depois do primeiro mes, a politica so sobe.
export function politicaPermitida(s, politica) {
  return s.mes === 0 || POLITICA[politica].fator >= POLITICA[s.politicaPaga].fator;
}

export function lucroDisponivel(s) { return Math.max(0, s.lucroAcum - s.distribuido); }

// Multiplo da nota: 1 + ganho / capital de referencia (igual a riqueza/capital quando o capital e o normal).
export function multiploNota(s) {
  return 1 + (riquezaDono(s) - s.capitalInicial) / CAPITAL_REFERENCIA;
}

export function notaFinal(s) {
  if (s.fim === 'falencia') return 'F';
  const mult = multiploNota(s);
  return mult >= 4 ? 'A' : mult >= 2.5 ? 'B' : mult >= 1.5 ? 'C' : mult >= 1 ? 'D' : 'E';
}

// Atualiza um jogo salvo por uma versao anterior. Devolve o mesmo objeto.
export function migrarEstado(s) {
  if ((s.v || 1) < 2) {
    s.dec.producaoAuto = true; // v1 travava a producao no valor do mes 0
    s.politicaPaga = s.dec.politica;
    s.financiadoMes = s.financiadoMes || 0;
    s.dec.proLabore = Math.max(SALARIO_MINIMO, s.dec.proLabore);
    // Campos novos do historico, reconstruidos pela regra da v1 (o dono recebia 100% e a retencao
    // era 10% do total do mes acima de R$ 50 mil): sem eles, o ajuste anual nao devolveria o IR retido.
    const retV1 = v => (v > LIMITE_ISENCAO_DIVIDENDOS ? v * ALIQ_RETENCAO_DIVIDENDOS : 0);
    const anoDe = m => Math.floor(m / 12), rbaAno = {};
    let lalur = 0;
    for (const h of s.hist) {
      // Fator R passou a contar 13o, ferias e FGTS (LC 123, art. 18 §24)
      h.folhaFatorR = h.folha * (1 + ENCARGOS_FOLHA) + h.proLabore;
      h.dividendosDono ??= h.distribuido || 0;
      h.irrfDividendos ??= retV1(h.distribuido || 0);
      rbaAno[anoDe(h.mes)] = (rbaAno[anoDe(h.mes)] || 0) + h.receita;
      h.rba ??= rbaAno[anoDe(h.mes)];
      // Lalur refeito so com os meses apurados no Real (a v1 misturava o prejuizo simulado)
      if (h.regime === 'real') lalur = h.lucroAntesIR <= 0 ? lalur - h.lucroAntesIR : lalur - Math.min(lalur, 0.3 * h.lucroAntesIR);
    }
    s.dividendosDonoMes = s.distribuidoMes || 0;
    s.irrfDivMes = retV1(s.distribuidoMes || 0);
    s.prejuizoFiscal = lalur;
    if (s.regime === 'real') s.prejuizo.real = lalur;
    // A v1 nunca desligava a exclusao do Simples; a v2 a recalcula pelo ano-calendario.
    if (s.excluidoSimples) {
      const receitaDoAno = a => soma(s.hist.filter(h => anoDe(h.mes) === a), h => h.receita);
      const ano = anoDe(s.mes);
      s.excluidoSimples = receitaDoAno(ano - 1) > LIMITE_SIMPLES || receitaDoAno(ano) > LIMITE_SIMPLES * (1 + TOLERANCIA_EXCESSO);
    }
    s.v = 2;
  }
  if (s.v < 3) {
    // v3: Selic variavel (a v2 tinha um ajuste fixo de juros), concorrencia, carteira, contratos e seguro
    // o ajuste da v2 era somado a taxa mensal do capital de giro: x12 vira pontos ao ano
    s.selic = clamp(Math.round((SELIC_INICIAL + (s.ajusteJuros || 0) * 12) * 400) / 400, 0.065, 0.2);
    s.selicTendencia = 0;
    delete s.ajusteJuros;
    s.indice = 1;
    s.saldoCredor = {};
    s.concorrencia = 0;
    s.carteira = 0;
    s.contratoFornecedor = null;
    s.contratoCliente = null;
    s.fornecedorArriscado = false;
    s.dec.modoPreco = 'preco';
    s.dec.margemAlvo = 0.4;
    s.dec.seguro = false;
    // o Pronampe passou a ser pos-fixado (Selic + 6% ao ano)
    for (const e of s.emprestimos) if (e.nome === 'Pronampe') e.posFixado = true;
    // o acontecimento "juros" deixou de existir: a Selic agora anda sozinha
    if (s.evento && s.evento.id === 'juros') s.evento = null;
    s.v = 3;
  }
  return s;
}
