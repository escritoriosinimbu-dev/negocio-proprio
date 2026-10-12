import { SEGMENTOS, POLITICA, SETORES, CAPITAL_REFERENCIA, ENCARGOS_FOLHA } from './regras.js';
import { liquidoProLabore } from './tributos.js';

// Estado da empresa e indicadores derivados. Tudo aqui e funcao pura sobre o estado `s`,
// que e um objeto JSON simples (vai inteiro para o armazenamento do aparelho).

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const soma = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
export const SEG = s => SEGMENTOS[s.segmento];

export const VERSAO_ESTADO = 2;

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
    },
    precoRef: seg.precoRef, custoMat: seg.custoMat,
    equipNivel: 0, espacoNivel: 0, expansoes: [], mercadoMult: 1, aluguelExtra: 0,
    imobilizado: seg.setup, deprecAcum: 0, estoque: 0, valorEstoque: 0,
    A: 10, Q: 50, M: 65, economia: 1, ajusteJuros: 0,
    emprestimos: emprestimo > 0 ? [{ nome: 'Pronampe', saldo: emprestimo, taxa: 0.016, amort: emprestimo / 36 }] : [],
    recebiveis: [], pedidos: [], efeitos: [], extras: 0, salExtra: 0,
    prejuizo: { simples: 0, presumido: 0, real: 0 },
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

export function efeito(s, tipo) {
  return s.efeitos.filter(e => e.tipo === tipo && e.ate > s.mes).reduce((m, e) => m * e.mult, 1);
}

export function capacidades(s, func = s.func) {
  const seg = SEG(s);
  const total = func.producao + func.comercial + func.adm;
  const capAdm = 6 + 12 * func.adm;
  const desorg = func.producao + func.comercial > capAdm;
  const capEspaco = 10 + 10 * s.espacoNivel;
  const apertado = total > capEspaco;
  const moral = 0.7 + 0.45 * s.M / 100;
  const fator = moral * (1 + seg.ganhoEquip * s.equipNivel) * (desorg ? 0.9 : 1) * (apertado ? 0.85 : 1) * efeito(s, 'producao');
  return {
    capacidade: Math.floor(func.producao * seg.prodPorFunc * fator),
    cobertura: Math.floor((seg.capDono + func.comercial * seg.capVenda * moral) * (desorg ? 0.9 : 1)),
    desorg, apertado, capAdm, capEspaco, total,
  };
}

export function demandaEsperada(s, d = s.dec) {
  const seg = SEG(s);
  const atracao = (0.15 + 0.85 * s.A / 100) * (0.7 + 0.6 * s.Q / 100);
  return seg.mercado * s.mercadoMult * Math.pow(s.precoRef / d.preco, seg.elasticidade) * atracao
    * seg.sazonal[s.mes % 12] * s.economia * (d.prazo ? 1.15 : 1) * efeito(s, 'demanda');
}

// Plano automatico da industria: procura prevista + 5% + pedidos especiais - estoque.
export function planoProducaoAuto(s) {
  return Math.max(0, Math.round((demandaEsperada(s) * 1.05 + soma(s.pedidos, p => p.qtd) - s.estoque) / 10) * 10);
}

export function salario(seg, setor, politica) {
  return { producao: seg.salProd, comercial: seg.salCom, adm: seg.salAdm }[setor] * POLITICA[politica].fator;
}

export function folhaPrevista(s, func = s.dec.func, politica = s.dec.politica) {
  const seg = SEG(s);
  return soma(SETORES, setor => func[setor] * salario(seg, setor, politica)) + (func.producao > 0 ? s.salExtra : 0);
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

export function taxaCapitalGiro(s) { return 0.024 + s.ajusteJuros + (patrimonio(s) < 0 ? 0.01 : 0); }
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
    s.prejuizoFiscal = s.regime === 'real' ? s.prejuizo.real : 0;
    s.financiadoMes = s.financiadoMes || 0;
    s.dividendosDonoMes = s.dividendosDonoMes || 0;
    s.irrfDivMes = s.irrfDivMes || 0;
    // Fator R passou a contar 13o, ferias e FGTS (LC 123, art. 18 §24)
    for (const h of s.hist) h.folhaFatorR = h.folha * (1 + ENCARGOS_FOLHA) + h.proLabore;
    s.v = 2;
  }
  return s;
}
