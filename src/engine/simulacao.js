import {
  SETORES, REGIMES, POLITICA, LIMITE_SIMPLES, SUBLIMITE, TOLERANCIA_EXCESSO, ENCARGOS_FOLHA, DURACAO,
  ALIQ_RETENCAO_DIVIDENDOS, RENDA_MINIMA_IRPFM,
} from './regras.js';
import {
  SEG, clamp, soma, capacidades, demandaEsperada, salario, limiteCheque, politicaPermitida, planoProducaoAuto,
} from './empresa.js';
import { apurar, irrfProLabore } from './tributos.js';
import { sortearEvento } from './eventos.js';
import { brl, num } from './formato.js';

const anoDe = mes => Math.floor(mes / 12);

// O jogo acabou de vez: quebrou, ou chegou ao fim sem o jogador pedir para continuar.
export function jogoEncerrado(s) {
  return s.fim === 'falencia' || (s.fim === 'concluido' && !s.modoLivre);
}

// Fecha o mes corrente: aplica as decisoes em s.dec, vende, apura tributos, movimenta o
// caixa, atualiza reputacao/qualidade/moral, sorteia o acontecimento do mes seguinte e
// devolve o registro do mes (que tambem vai para s.hist).
//
// `rnd` e injetavel para os testes rodarem com semente fixa.
export function fecharMes(s, rnd = Math.random) {
  const seg = SEG(s), d = s.dec, nots = [];
  // caixa no fim do mes anterior: desfaz as acoes feitas durante este mes
  const caixaIni = s.caixa - s.captadoMes + s.investidoMes + s.distribuidoMes + s.quitadoMes;

  // 1. pessoas
  // Irredutibilidade salarial (CF, art. 7o, VI): depois do primeiro mes, a politica so sobe.
  if (!politicaPermitida(s, d.politica)) d.politica = s.politicaPaga;
  s.politicaPaga = d.politica;
  let contratacao = 0, rescisao = 0, demitidos = 0, contratados = 0;
  for (const setor of SETORES) {
    const delta = d.func[setor] - s.func[setor], sal = salario(seg, setor, d.politica);
    if (delta > 0) { contratacao += delta * sal * 0.5; contratados += delta; }
    if (delta < 0) { rescisao += -delta * sal * 1.3; demitidos += -delta; }
    s.func[setor] = d.func[setor];
  }
  if (contratados) nots.push(['', `${contratados} contratação(ões): recrutamento e exames custaram ${brl(contratacao)}.`]);
  if (demitidos) nots.push(['ruim', `${demitidos} demissão(ões): rescisões de ${brl(rescisao)} e a moral da equipe caiu.`]);
  const pSair = Math.max(0, (50 - s.M) / 250);
  let sairam = 0;
  for (const setor of SETORES) {
    for (let i = s.func[setor]; i > 0; i--) {
      if (setor === 'producao' && s.func.producao <= 1) break;
      if (rnd() < pSair) { s.func[setor]--; sairam++; }
    }
  }
  if (sairam) {
    d.func = { ...s.func };
    nots.push(['ruim', `Com a moral baixa, ${sairam} funcionário(s) pediram demissão.`]);
  }

  // 2. operacao
  const cap = capacidades(s);
  const demanda = Math.round(demandaEsperada(s) * (0.9 + 0.2 * rnd()));
  let produzido = 0, oferta;
  if (seg.estocavel && d.producaoAuto) d.producao = planoProducaoAuto(s);
  if (seg.estocavel) {
    produzido = Math.max(0, Math.min(d.producao, cap.capacidade));
    oferta = s.estoque + produzido;
  } else {
    oferta = cap.capacidade;
  }
  let vendEsp = 0, recEsp = 0;
  for (const p of s.pedidos) {
    const q = Math.max(0, Math.min(p.qtd, oferta - vendEsp));
    vendEsp += q;
    recEsp += q * p.preco;
    if (q > 0) s.recebiveis.push({ mes: s.mes + p.prazo, valor: q * p.preco });
    if (q < p.qtd) nots.push(['ruim', `Pedido especial entregue só em parte: ${num(q)} de ${num(p.qtd)}.`]);
    else nots.push(['bom', `Pedido especial de ${num(q)} ${seg.unidades} entregue.`]);
  }
  s.pedidos = [];
  const disp = Math.max(0, oferta - vendEsp);
  const vendidosN = Math.max(0, Math.min(demanda, disp, cap.cobertura));
  // Cada falta e medida contra a procura inteira: quanto faltaria mesmo com o outro recurso sobrando.
  const faltaProduto = Math.max(0, demanda - disp);
  const faltaAtend = Math.max(0, demanda - cap.cobertura);
  const vendidos = vendidosN + vendEsp;
  const recNormal = vendidosN * d.preco;
  const receita = recNormal + recEsp;

  // 3. custos
  const fs = POLITICA[d.politica].fator;
  const folhaProd = s.func.producao * seg.salProd * fs + (s.func.producao > 0 ? s.salExtra : 0);
  const folha = folhaProd + (s.func.comercial * seg.salCom + s.func.adm * seg.salAdm) * fs;

  let compras, cmv, absorvido = 0;
  if (seg.estocavel) {
    compras = produzido * s.custoMat;
    // Custeio por absorcao: a mao de obra da fabrica usada na producao entra no custo da peca
    // (DL 1.598/77, art. 13; CPC 16). A capacidade ociosa continua como despesa do mes.
    absorvido = cap.capacidade > 0 ? folhaProd * (1 + ENCARGOS_FOLHA) * Math.min(1, produzido / cap.capacidade) : 0;
    const qtd = s.estoque + produzido;
    const medio = qtd > 0 ? (s.valorEstoque + compras + absorvido) / qtd : s.custoMat;
    cmv = vendidos * medio;
    s.estoque = qtd - vendidos;
    s.valorEstoque = s.estoque * medio;
  } else {
    produzido = vendidos;
    compras = vendidos * s.custoMat * (seg.tipo === 'comercio' ? 1.06 : 1);
    cmv = compras;
  }

  const aluguel = seg.aluguel * (1 + 0.7 * s.espacoNivel) + s.aluguelExtra;
  const utilidades = 600 + 0.025 * receita;
  const armazenagem = seg.estocavel ? s.valorEstoque * 0.015 : 0;
  const extras = s.extras;
  s.extras = 0;
  const despesas = aluguel + utilidades + d.marketing + d.qualidade + armazenagem + contratacao + rescisao + extras;
  const depreciacao = Math.max(0, Math.min(s.imobilizado / 120, s.imobilizado - s.deprecAcum));
  s.deprecAcum += depreciacao;
  const jurosCheque = s.caixa < 0 ? -s.caixa * 0.08 : 0;
  let juros = jurosCheque, amort = 0;
  for (const e of s.emprestimos) {
    const a = Math.min(e.saldo, e.amort);
    juros += e.saldo * e.taxa;
    amort += a;
    e.saldo -= a;
  }
  s.emprestimos = s.emprestimos.filter(e => e.saldo > 0.5);
  if (jurosCheque) nots.push(['ruim', `Cheque especial: ${brl(jurosCheque)} de juros sobre o saldo negativo.`]);

  // 4. tributos
  const ant = s.hist.slice(-12), n = ant.length;
  // Fator R: salarios, 13o, ferias e FGTS pagos, mais o pro-labore, que nao tem FGTS (LC 123, art. 18 §24)
  const folhaMes = folha * (1 + ENCARGOS_FOLHA) + d.proLabore;
  const rbt12 = n === 0 ? receita * 12 : soma(ant, h => h.receita) / n * 12;
  const folha12 = n === 0 ? folhaMes * 12 : soma(ant, h => h.folhaFatorR) / n * 12;
  const fatorR = rbt12 > 0 ? folha12 / rbt12 : 1;
  // Limite e sublimite se medem pela receita do ano-calendario; o RBT12 so define a aliquota.
  const ano = anoDe(s.mes);
  const rbaAntes = soma(s.hist.filter(h => anoDe(h.mes) === ano), h => h.receita);
  const rbaAnoAnterior = soma(s.hist.filter(h => anoDe(h.mes) === ano - 1), h => h.receita);
  const impedidoSublimite = rbaAnoAnterior > SUBLIMITE || rbaAntes > SUBLIMITE * (1 + TOLERANCIA_EXCESSO);
  const op = {
    seg, receita, compras, cmv, folha, proLabore: d.proLabore, despesas, aluguel, utilidades, depreciacao, juros,
    rbt12, fatorR, impedidoSublimite, absorvido,
  };
  const comp = {};
  for (const r of REGIMES) comp[r] = r === 'simples' && s.excluidoSimples ? null : apurar(r, op, s.prejuizo[r]);
  const ap = comp[s.regime];
  for (const r of REGIMES) if (comp[r]) s.prejuizo[r] = comp[r].prejuizo;
  if (s.regime === 'real') s.prejuizoFiscal = ap.prejuizo;
  // O mes do excesso ainda e do Simples; acima de 20% do limite, a exclusao vale a partir do mes seguinte.
  if (!s.excluidoSimples && rbaAntes + receita > LIMITE_SIMPLES * (1 + TOLERANCIA_EXCESSO)) {
    s.excluidoSimples = true;
    if (s.regime === 'simples') {
      s.regime = 'presumido';
      nots.push(['aviso', 'A receita do ano passou de R$ 5,76 milhões (limite de R$ 4,8 mi + 20%): a empresa sai do Simples a partir do mês que vem.']);
    }
  }

  // 5. caixa
  const aVista = d.prazo ? recNormal * 0.4 : recNormal;
  if (d.prazo && recNormal > 0) s.recebiveis.push({ mes: s.mes + 1, valor: recNormal * 0.6 });
  const recebidos = soma(s.recebiveis.filter(r => r.mes === s.mes), r => r.valor);
  s.recebiveis = s.recebiveis.filter(r => r.mes > s.mes);
  const entradas = aVista + recebidos;
  const tributos = ap.tribVenda + ap.cpp + ap.irpj + ap.csll;
  const saidas = compras + folha + ap.encargos + d.proLabore + despesas + ap.contador + juros + amort + tributos;
  s.caixa += entradas - saidas;
  s.lucroAcum += ap.lucro;
  s.proLaboreAcum += d.proLabore;

  // 6. mercado, qualidade e moral
  const fracFalta = demanda > 0 ? (demanda - vendidosN) / demanda : 0;
  const alvoA = 8 + 80 * (1 - Math.exp(-d.marketing / seg.mkEscala)) + 15 * (s.Q - 50) / 50 - 30 * fracFalta;
  s.A = clamp(s.A + (alvoA - s.A) * 0.25, 0, 100);
  const alvoQ = 35 + 60 * (1 - Math.exp(-d.qualidade / seg.qEscala)) + 3 * s.equipNivel;
  s.Q = clamp(s.Q + (alvoQ - s.Q) * 0.2, 0, 100);
  const alvoM = POLITICA[d.politica].moral - (cap.desorg ? 8 : 0) - (cap.apertado ? 6 : 0) + (ap.lucro > 0 ? 3 : -3);
  s.M = clamp(s.M + (alvoM - s.M) * 0.3 - Math.min(25, demitidos * 5), 0, 100);
  const econAnt = s.economia;
  s.economia = clamp(s.economia + (1 - s.economia) * 0.15 + (rnd() - 0.5) * 0.06, 0.8, 1.2);
  if (s.economia < 0.9 && econAnt >= 0.9) nots.push(['ruim', 'A economia esfriou: os clientes estão comprando menos.']);
  if (s.economia > 1.1 && econAnt <= 1.1) nots.push(['bom', 'A economia aqueceu: o mercado está comprando mais.']);
  s.custoMat *= 1.004;
  s.precoRef *= 1.004;

  // A parte da folha da fabrica que foi para o estoque sai das linhas de pessoal do DRE e volta,
  // quando a peca e vendida, dentro do custo dos produtos vendidos.
  const absorvidoSal = absorvido / (1 + ENCARGOS_FOLHA);
  const reg = {
    mes: s.mes, receita, tribVenda: ap.tribVenda, cmv, folha: folha - absorvidoSal,
    encargos: ap.encargos - (absorvido - absorvidoSal) + ap.cpp, proLabore: d.proLabore,
    despesas: despesas + ap.contador, aluguel, marketing: d.marketing, qualidade: d.qualidade, contador: ap.contador,
    depreciacao, juros, irpj: ap.irpj + ap.csll, lucro: ap.lucro, lucroAntesIR: ap.lucroAntesIR, caixa: s.caixa, caixaIni,
    vendidos, demanda, faltaProduto, faltaAtend, produzido, capacidade: cap.capacidade, cobertura: cap.cobertura,
    desorg: cap.desorg, apertado: cap.apertado, det: ap.det, regime: ap.regime, anexo: ap.anexo, aliq: ap.aliq,
    fatorR, rbt12, rba: rbaAntes + receita, folhaFatorR: folhaMes, compras, absorvido, entradas, saidas, amort,
    investido: s.investidoMes, captado: s.captadoMes, distribuido: s.distribuidoMes, quitado: s.quitadoMes,
    financiado: s.financiadoMes || 0, dividendosDono: s.dividendosDonoMes || 0, irrfDividendos: s.irrfDivMes || 0,
    comp: Object.fromEntries(REGIMES.map(r => [r, comp[r] ? comp[r].totalTributos : null])),
    tributos, estoque: s.estoque, preco: d.preco, A: s.A, Q: s.Q, M: s.M,
  };
  s.hist.push(reg);
  s.investidoMes = s.captadoMes = s.distribuidoMes = s.quitadoMes = s.financiadoMes = 0;
  s.dividendosDonoMes = s.irrfDivMes = 0;
  s.efeitos = s.efeitos.filter(e => e.ate > s.mes + 1);

  if (faltaProduto > demanda * 0.08) nots.push(['ruim', `Faltou ${seg.estocavel ? 'produto' : 'capacidade'}: ${num(faltaProduto)} ${seg.unidades} da procura não tinham ${seg.estocavel ? 'produto' : 'quem fizesse'}.`]);
  if (faltaAtend > demanda * 0.08) nots.push(['ruim', `Faltou gente ${seg.noSetorCom}: ${num(faltaAtend)} ${seg.unidades} de procura não tinham quem atendesse.`]);
  if (s.caixa < 0) nots.push(['ruim', 'Caixa negativo. Três meses seguidos no vermelho e o banco fecha a conta.']);

  // 7. virada de mes
  s.negativos = s.caixa < 0 ? s.negativos + 1 : 0;
  s.mes++;
  if (s.mes % 12 === 0) viradaDeAno(s, nots);
  if (s.caixa < -limiteCheque(s) || s.negativos >= 3) s.fim = 'falencia';
  else if (s.mes === DURACAO && !s.modoLivre) s.fim = 'concluido';
  s.evento = null;
  if (!jogoEncerrado(s) && s.mes >= 2 && rnd() < 0.4) s.evento = sortearEvento(s, rnd);
  if (seg.estocavel && !d.producaoAuto) d.producao = Math.min(d.producao, capacidades(s, d.func).capacidade);
  reg.noticias = nots;
  return reg;
}

function viradaDeAno(s, nots) {
  const anoH = s.hist.slice(-12);
  // Opcao pelo Simples: vedada se a receita do ano anterior passou de R$ 4,8 mi (LC 123, art. 3o II);
  // a empresa excluida por excesso pode voltar em qualquer janeiro seguinte (art. 16).
  const receitaAno = soma(anoH, h => h.receita);
  const jaExcluida = s.excluidoSimples;
  s.excluidoSimples = receitaAno > LIMITE_SIMPLES;
  if (s.excluidoSimples && s.regime === 'simples') {
    s.regime = 'presumido';
    if (!jaExcluida) nots.push(['aviso', 'O faturamento do ano passou de R$ 4,8 milhões: a empresa sai do Simples e começa o ano no Lucro Presumido.']);
  }
  // Ajuste anual do socio (Lei 15.270/2025): a retencao sobre lucros e antecipacao do imposto minimo
  // (IRPFM), que so existe para renda acima de R$ 600 mil no ano e desconta o IR ja pago no pro-labore.
  const irrfAno = soma(anoH, h => h.irrfDividendos || 0);
  if (irrfAno > 0) {
    const renda = soma(anoH, h => (h.dividendosDono || 0) + h.proLabore);
    const aliq = renda <= RENDA_MINIMA_IRPFM ? 0 : Math.min(ALIQ_RETENCAO_DIVIDENDOS, renda / 6e6 - 0.10);
    const irpfm = Math.max(0, aliq * renda - soma(anoH, h => irrfProLabore(h.proLabore)));
    const restituir = Math.max(0, irrfAno - irpfm);
    if (restituir > 0) {
      s.retirado += restituir;
      s.irrfDiv -= restituir;
      nots.push(['bom', `Ajuste anual do IR: ${brl(restituir)} retidos sobre os lucros voltaram para você. A retenção é antecipação do imposto mínimo, que só alcança renda acima de R$ 600 mil no ano.`]);
    }
  }
  nots.push(['aviso', `Começou o ano ${s.mes / 12 + 1}. Janeiro é o único mês para trocar de regime tributário — veja a aba Impostos.`]);
}

// Tributos acumulados no ano de cada regime, para o comparativo. null = regime nao se aplica.
export function comparativoDoAno(s, ano) {
  const meses = s.hist.filter(x => anoDe(x.mes) === ano);
  const tot = {};
  for (const r of REGIMES) tot[r] = meses.length && !meses.some(x => x.comp[r] === null) ? soma(meses, x => x.comp[r]) : null;
  const validos = REGIMES.filter(r => tot[r] !== null).sort((a, b) => tot[a] - tot[b]);
  return { tot, melhor: validos[0] || null, meses: meses.length };
}

export function podeTrocarRegime(s) { return s.mes % 12 === 0; }

export function trocarRegime(s, regime) {
  if (!podeTrocarRegime(s)) return { ok: false, msg: 'A troca de regime só é permitida em janeiro.' };
  if (regime === 'simples' && s.excluidoSimples) return { ok: false, msg: 'A receita do ano anterior passou de R$ 4,8 milhões: o Simples fica fechado neste ano.' };
  if (!REGIMES.includes(regime)) return { ok: false, msg: 'Regime desconhecido.' };
  // So o prejuizo apurado em meses no Lucro Real e compensavel (Lei 9.065/1995, art. 15); o do
  // comparativo, simulado com a empresa em outro regime, nunca existiu.
  if (regime === 'real' && s.regime !== 'real') s.prejuizo.real = s.prejuizoFiscal || 0;
  s.regime = regime;
  return { ok: true, msg: 'Regime alterado.' };
}
