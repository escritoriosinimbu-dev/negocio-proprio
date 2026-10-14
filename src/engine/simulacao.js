import {
  SETORES, REGIMES, POLITICA, LIMITE_SIMPLES, SUBLIMITE, TOLERANCIA_EXCESSO, ENCARGOS_FOLHA, DURACAO,
  ALIQ_RETENCAO_DIVIDENDOS, RENDA_MINIMA_IRPFM, NOME_REGIME, HONORARIOS, JUROS_CHEQUE, SELIC_MIN, SELIC_MAX,
  CONCORRENCIA_MAX, REAJUSTE_ANUAL,
} from './regras.js';
import {
  SEG, clamp, soma, capacidades, demandaEsperada, salario, limiteCheque, politicaPermitida, planoProducaoAuto,
  precoPelaMargem, premioSeguro, taxaPronampe, nivelEfetivo, indice, aluguelMes, precoJusto,
} from './empresa.js';
import { apurar, irrfProLabore } from './tributos.js';
import { sortearEvento, sortearCrise, eventoRegime } from './eventos.js';
import { brl, num, pct } from './formato.js';

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
    const delta = d.func[setor] - s.func[setor], sal = salario(seg, setor, d.politica, indice(s));
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
  // preco pela margem: recalculado com o custo de hoje (o reajuste do fornecedor passa sozinho para o preco)
  if (d.modoPreco === 'margem') d.preco = precoPelaMargem(s);
  if (s.fornecedorArriscado && rnd() < 0.2) {
    s.efeitos.push({ tipo: 'producao', mult: 0.6, ate: s.mes + 1 });
    nots.push(['ruim', `O fornecedor novo atrasou a entrega de ${seg.insumo}: a produção do mês caiu 40%.`]);
  }
  // contrato com grande cliente: o pedido do mes entra antes dos clientes normais, com multa se faltar
  if (s.contratoCliente && s.mes < s.contratoCliente.ate) {
    const c = s.contratoCliente;
    s.pedidos.push({ qtd: c.qtd, preco: c.preco, prazo: 1, multa: 0.3, contrato: true });
  }
  const cap = capacidades(s);
  // carteira: a procura varia pouco de um mes para o outro; no resto, +-10%
  const ruido = seg.recorrente ? 0.97 + 0.06 * rnd() : 0.9 + 0.2 * rnd();
  const demanda = Math.round(demandaEsperada(s) * ruido);
  // estoque que estragou (validade, avaria): sai do estoque e entra no custo do mes
  let perdaEstoque = 0;
  if (seg.perecivel && s.estoque > 0) {
    perdaEstoque = s.valorEstoque * seg.perecivel;
    s.estoque = Math.round(s.estoque * (1 - seg.perecivel));
    s.valorEstoque -= perdaEstoque;
  }
  let produzido = 0, oferta;
  if (seg.estocavel && d.producaoAuto) d.producao = planoProducaoAuto(s);
  if (seg.estocavel) {
    produzido = Math.max(0, Math.min(d.producao, cap.capacidade));
    oferta = s.estoque + produzido;
  } else {
    oferta = cap.capacidade;
  }
  let vendEsp = 0, recEsp = 0, multaContrato = 0;
  for (const p of s.pedidos) {
    const q = Math.max(0, Math.min(p.qtd, oferta - vendEsp));
    vendEsp += q;
    recEsp += q * p.preco;
    if (q > 0) s.recebiveis.push({ mes: s.mes + p.prazo, valor: q * p.preco });
    const nome = p.contrato ? 'Contrato do grande cliente' : 'Pedido especial';
    if (q < p.qtd && p.multa) {
      const multa = (p.qtd - q) * p.preco * p.multa;
      multaContrato += multa;
      nots.push(['ruim', `${nome}: entregues ${num(q)} de ${num(p.qtd)}. Multa contratual de ${brl(multa)}.`]);
    } else if (q < p.qtd) nots.push(['ruim', `${nome} entregue só em parte: ${num(q)} de ${num(p.qtd)}.`]);
    else if (!p.contrato) nots.push(['bom', `${nome} de ${num(q)} ${seg.unidades} entregue.`]);
  }
  s.pedidos = [];
  const disp = Math.max(0, oferta - vendEsp);
  const vendidosN = Math.max(0, Math.min(demanda, disp, cap.cobertura));
  // Cada falta e medida contra a procura inteira: quanto faltaria mesmo com o outro recurso sobrando.
  const faltaProduto = Math.max(0, demanda - disp);
  const faltaAtend = Math.max(0, demanda - cap.cobertura);
  const vendidos = vendidosN + vendEsp;
  if (seg.recorrente) s.carteira = vendidosN;
  const recNormal = vendidosN * d.preco;
  const receita = recNormal + recEsp;

  // 3. custos
  const fs = POLITICA[d.politica].fator * indice(s);
  const folhaProd = s.func.producao * seg.salProd * fs + (s.func.producao > 0 ? s.salExtra : 0);
  const folha = folhaProd + (s.func.comercial * seg.salCom + s.func.adm * seg.salAdm) * fs;

  let compras, cmv, absorvido = 0;
  if (seg.estocavel) {
    compras = produzido * s.custoMat;
    // Custeio por absorcao: a mao de obra da fabrica usada na producao entra no custo da peca
    // (DL 1.598/77, art. 13; CPC 16). A capacidade ociosa continua como despesa do mes. Na revenda
    // nao ha producao: o salario da reposicao e despesa.
    absorvido = !seg.revenda && cap.capacidade > 0 ? folhaProd * (1 + ENCARGOS_FOLHA) * Math.min(1, produzido / cap.capacidade) : 0;
    const qtd = s.estoque + produzido;
    const medio = qtd > 0 ? (s.valorEstoque + compras + absorvido) / qtd : s.custoMat;
    cmv = vendidos * medio + perdaEstoque;
    s.estoque = qtd - vendidos;
    s.valorEstoque = s.estoque * medio;
  } else {
    produzido = vendidos;
    compras = vendidos * s.custoMat * (seg.tipo === 'comercio' ? 1.06 : 1);
    cmv = compras;
  }

  const aluguel = aluguelMes(s);
  const utilidades = 600 * indice(s) + 0.025 * receita;
  const armazenagem = seg.estocavel ? s.valorEstoque * 0.015 : 0;
  const extras = s.extras;
  s.extras = 0;
  const seguro = d.seguro ? premioSeguro(s) : 0;
  // contrato com o fornecedor: compra minima por mes; o que faltar paga 30% do valor
  let multaFornecedor = 0;
  if (s.contratoFornecedor && s.mes < s.contratoFornecedor.ate) {
    const faltou = Math.max(0, s.contratoFornecedor.minimo - produzido);
    if (faltou > 0) {
      multaFornecedor = faltou * s.custoMat * 0.3;
      nots.push(['ruim', `Compra abaixo do mínimo do contrato com o fornecedor: multa de ${brl(multaFornecedor)}.`]);
    }
  }
  const despesas = aluguel + utilidades + d.marketing + d.qualidade + armazenagem + contratacao + rescisao + extras
    + seguro + multaContrato + multaFornecedor;
  // baixa de recebiveis de cliente que nao vai pagar (sem saida de caixa)
  let perdas = 0;
  if (s.perdasMes) {
    let falta = s.perdasMes;
    for (const r of s.recebiveis.sort((a, b) => a.mes - b.mes)) {
      const b = Math.min(r.valor, falta);
      r.valor -= b;
      falta -= b;
      perdas += b;
    }
    s.recebiveis = s.recebiveis.filter(r => r.valor > 0.005);
    s.perdasMes = 0;
  }
  const depreciacao = Math.max(0, Math.min(s.imobilizado / 120, s.imobilizado - s.deprecAcum));
  s.deprecAcum += depreciacao;
  const jurosCheque = s.caixa < 0 ? -s.caixa * JUROS_CHEQUE : 0;
  let juros = jurosCheque, amort = 0;
  for (const e of s.emprestimos) {
    if (e.posFixado) e.taxa = taxaPronampe(s.selic);
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
    rbt12, fatorR, impedidoSublimite, absorvido, perdas, indice: indice(s),
  };
  const comp = {};
  s.saldoCredor ??= {};
  for (const r of REGIMES) comp[r] = r === 'simples' && s.excluidoSimples ? null : apurar(r, op, s.prejuizo[r], s.saldoCredor[r]);
  const ap = comp[s.regime];
  for (const r of REGIMES) if (comp[r]) { s.prejuizo[r] = comp[r].prejuizo; s.saldoCredor[r] = comp[r].saldo; }
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
  // cobrar bem acima do preco justo gera fama de caro: a reputacao cai aos poucos
  const abuso = Math.max(0, d.preco / precoJusto(s) - 1.1);
  const alvoA = 8 + 80 * (1 - Math.exp(-d.marketing / seg.mkEscala)) + 15 * (s.Q - 50) / 50 - 30 * fracFalta - 100 * abuso;
  s.A = clamp(s.A + (alvoA - s.A) * 0.25, 0, 100);
  const alvoQ = 35 + 60 * (1 - Math.exp(-d.qualidade / seg.qEscala)) + 3 * nivelEfetivo(s.equipNivel);
  s.Q = clamp(s.Q + (alvoQ - s.Q) * 0.2, 0, 100);
  const alvoM = POLITICA[d.politica].moral - (cap.desorg ? 8 : 0) - (cap.apertado ? 6 : 0) + (ap.lucro > 0 ? 3 : -3);
  s.M = clamp(s.M + (alvoM - s.M) * 0.3 - Math.min(25, demitidos * 5), 0, 100);
  // Copom: a Selic anda em passos de 0,25 ponto, com tendencia, e puxa de volta para ~11%.
  if (rnd() < 0.6) {
    s.selicTendencia = clamp(s.selicTendencia * 0.8 + (rnd() - 0.5) * 0.8 + (0.11 - s.selic) * 6, -1, 1);
    const passo = Math.round((s.selicTendencia * 0.006 + (rnd() - 0.5) * 0.004) / 0.0025) * 0.0025;
    const antes = s.selic;
    s.selic = clamp(Math.round((s.selic + passo) * 10000) / 10000, SELIC_MIN, SELIC_MAX);
    if (s.selic !== antes) {
      nots.push([s.selic > antes ? 'ruim' : 'bom', `Copom ${s.selic > antes ? 'subiu' : 'cortou'} a Selic para ${pct(s.selic, 2)} ao ano. ${s.selic > antes ? 'Crédito mais caro e consumo mais fraco.' : 'Crédito mais barato e consumo mais forte.'}`]);
    }
  }
  // Juro alto esfria o consumo: a economia tende a 1 com a Selic em 11%.
  const econAnt = s.economia;
  const alvoEcon = 1 - (s.selic - 0.11) * 1.2;
  s.economia = clamp(s.economia + (alvoEcon - s.economia) * 0.15 + (rnd() - 0.5) * 0.06, 0.8, 1.2);
  if (s.economia < 0.9 && econAnt >= 0.9) nots.push(['ruim', 'A economia esfriou: os clientes estão comprando menos.']);
  if (s.economia > 1.1 && econAnt <= 1.1) nots.push(['bom', 'A economia aqueceu: o mercado está comprando mais.']);
  // Concorrencia: lucro alto atrai gente nova para o mercado; quem nao se sustenta vai embora aos poucos.
  const ult12 = s.hist.slice(-11).concat([{ receita, lucro: ap.lucro }]);
  const rec12 = soma(ult12, x => x.receita), margem12 = rec12 > 0 ? soma(ult12, x => x.lucro) / rec12 : 0;
  const concAnt = s.concorrencia;
  s.concorrencia = clamp(s.concorrencia * 0.985 + (s.mes >= 12 && margem12 > 0.12 ? 0.007 : 0), 0, CONCORRENCIA_MAX);
  if (s.concorrencia >= 0.15 && concAnt < 0.15) nots.push(['aviso', 'Seu lucro chamou atenção: concorrentes novos estão disputando os seus clientes.']);
  // Inflacao de 0,4% ao mes. Com contrato, o fornecedor segura o preco e o reajuste acumulado
  // chega de uma vez quando o contrato acaba.
  const cf = s.contratoFornecedor;
  if (cf && s.mes < cf.ate) s.custoContratoAdiado = (s.custoContratoAdiado || 1) * 1.004;
  else s.custoMat *= 1.004;
  s.precoRef *= 1.004;
  if (cf && s.mes + 1 >= cf.ate) {
    // volta ao preco de mercado: desfaz o desconto do contrato e aplica os reajustes acumulados
    const salto = (s.custoContratoAdiado || 1) / (cf.desconto || 1);
    s.custoMat *= salto;
    s.contratoFornecedor = null;
    s.custoContratoAdiado = 1;
    nots.push(['aviso', `O contrato com o fornecedor acabou: o custo de ${seg.insumo} volta ao preço de mercado (${salto > 1.001 ? '+' + pct(salto - 1, 1) : 'sem reajuste'}).`]);
  }
  if (s.contratoCliente && s.mes + 1 >= s.contratoCliente.ate) {
    s.contratoCliente = null;
    nots.push(['aviso', 'O contrato com a rede terminou.']);
  }

  // A parte da folha da fabrica que foi para o estoque sai das linhas de pessoal do DRE e volta,
  // quando a peca e vendida, dentro do custo dos produtos vendidos.
  const absorvidoSal = absorvido / (1 + ENCARGOS_FOLHA);
  const reg = {
    mes: s.mes, receita, tribVenda: ap.tribVenda, cmv, folha: folha - absorvidoSal,
    encargos: ap.encargos - (absorvido - absorvidoSal) + ap.cpp, proLabore: d.proLabore,
    despesas: despesas + ap.contador + perdas, aluguel, marketing: d.marketing, qualidade: d.qualidade, contador: ap.contador,
    depreciacao, juros, irpj: ap.irpj + ap.csll, lucro: ap.lucro, lucroAntesIR: ap.lucroAntesIR, caixa: s.caixa, caixaIni,
    vendidos, demanda, faltaProduto, faltaAtend, produzido, capacidade: cap.capacidade, cobertura: cap.cobertura,
    desorg: cap.desorg, apertado: cap.apertado, det: ap.det, regime: ap.regime, anexo: ap.anexo, aliq: ap.aliq,
    fatorR, rbt12, rba: rbaAntes + receita, folhaFatorR: folhaMes, compras, absorvido, entradas, saidas, amort,
    investido: s.investidoMes, captado: s.captadoMes, distribuido: s.distribuidoMes, quitado: s.quitadoMes,
    financiado: s.financiadoMes || 0, dividendosDono: s.dividendosDonoMes || 0, irrfDividendos: s.irrfDivMes || 0,
    comp: Object.fromEntries(REGIMES.map(r => [r, comp[r] ? comp[r].totalTributos : null])),
    tributos, estoque: s.estoque, preco: d.preco, A: s.A, Q: s.Q, M: s.M,
    perdas, seguro, selic: s.selic, concorrencia: s.concorrencia, carteira: s.carteira,
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
  if (!jogoEncerrado(s)) {
    // janeiro: a decisao do regime vem antes de qualquer acontecimento
    if (s.mes % 12 === 0) s.evento = eventoRegime(s);
    else if (s.mes >= 4 && rnd() < 0.07) s.evento = sortearCrise(s, rnd);
    else if (s.mes >= 2 && rnd() < 0.4) s.evento = sortearEvento(s, rnd);
  }
  if (seg.estocavel && !d.producaoAuto) d.producao = Math.min(d.producao, capacidades(s, d.func).capacidade);
  reg.noticias = nots;
  return reg;
}

function viradaDeAno(s, nots) {
  const anoH = s.hist.slice(-12);
  // Dissidio, reajuste do aluguel e dos honorarios: os custos fixos acompanham a inflacao.
  s.indice = indice(s) * (1 + REAJUSTE_ANUAL);
  nots.push(['aviso', `Reajustes de janeiro: salários (dissídio), aluguel e honorários sobem ${pct(REAJUSTE_ANUAL)}. Confira se o preço acompanhou.`]);
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
  nots.push(['aviso', `Começou o ano ${s.mes / 12 + 1}. Janeiro é o único mês para trocar de regime tributário.`]);
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
  // O saldo credor de ICMS e da empresa e segue com ela; o de PIS/COFINS so existe no nao cumulativo.
  if (regime !== s.regime) {
    s.saldoCredor ??= {};
    const icms = (s.saldoCredor[s.regime] || {}).icms || 0;
    s.saldoCredor[regime] = { icms, pis: 0, cofins: 0 };
  }
  if (regime === s.regime) return { ok: true, msg: `Regime mantido: ${NOME_REGIME[regime]}.` };
  s.regime = regime;
  return { ok: true, msg: 'Regime alterado.' };
}
