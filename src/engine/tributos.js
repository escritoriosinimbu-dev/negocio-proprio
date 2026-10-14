import {
  ANEXOS, HONORARIOS, FATOR_R_MINIMO, SUBLIMITE, PARTILHA_LOCAL, TETO_ISS_DAS, ENCARGOS_FOLHA, TETO_INSS,
  CPP_FOLHA, INSS_PATRONAL,
} from './regras.js';
import { pct } from './formato.js';

// Aliquota efetiva do Simples: (RBT12 x aliquota nominal - parcela a deduzir) / RBT12.
export function aliqEfetiva(anexo, rbt12) {
  const t = ANEXOS[anexo];
  if (rbt12 <= 0) return t[0][1];
  const f = t.find(x => rbt12 <= x[0]) || t[t.length - 1];
  return Math.max(0, (rbt12 * f[1] - f[2]) / rbt12);
}

// Indice da faixa (0 a 5) em que o RBT12 cai.
export function faixaSimples(anexo, rbt12) {
  const i = ANEXOS[anexo].findIndex(x => rbt12 <= x[0]);
  return i < 0 ? ANEXOS[anexo].length - 1 : i;
}

// anexoFixo: atividade com anexo definido em lei, sem Fator R (ex.: servicos contabeis no III).
export function anexoSimples(tipo, fatorR, anexoFixo = null) {
  if (anexoFixo) return anexoFixo;
  if (tipo === 'comercio') return 'I';
  if (tipo === 'industria') return 'II';
  return fatorR >= FATOR_R_MINIMO ? 'III' : 'V';
}

// Parcela de PIS + COFINS na reparticao do DAS do Anexo I (faixas 1 a 5).
const PARTILHA_PIS_COFINS_I = 0.155;

// ICMS (estadual) e ISS (municipal) pelas regras normais, fora do Simples. O credito de ICMS que
// passa do debito nao se perde: vira saldo credor para os meses seguintes (LC 87/1996, art. 24, III).
function tributosLocais(seg, op, det, saldo, sufixo = '') {
  let total = 0;
  if (seg.icms) {
    const apurado = op.receita * seg.icms.aliq - (seg.icms.credito ? op.compras * seg.icms.aliq : 0) - saldo.icms;
    const icms = Math.max(0, apurado);
    saldo.icms = Math.max(0, -apurado);
    det.push({ nome: seg.icms.nome + sufixo, valor: icms });
    total += icms;
  }
  if (seg.iss) {
    const iss = op.receita * seg.iss;
    det.push({ nome: `ISS (${pct(seg.iss)})` + sufixo, valor: iss });
    total += iss;
  }
  return total;
}

function apurarSimples(seg, op, det, saldo) {
  const anexo = anexoSimples(seg.tipo, op.fatorR, seg.anexoFixo);
  const faixa = Math.min(4, faixaSimples(anexo, op.rbt12));
  const teto = seg.iss ? TETO_ISS_DAS : 1;
  let aliq = aliqEfetiva(anexo, op.rbt12);
  // Receita monofasica ou de aliquota zero sai do PIS/COFINS dentro do DAS (LC 123, art. 18 §4o-A, I).
  if (seg.fracaoTributadaPisCofins && anexo === 'I') aliq -= aliq * PARTILHA_PIS_COFINS_I * (1 - seg.fracaoTributadaPisCofins);
  // Impedida de recolher ICMS/ISS no Simples com RBT12 ate R$ 3,6 mi: tira a parcela local do DAS,
  // que passa a ser paga por fora (na 6a faixa a reparticao ja nao tem ICMS/ISS).
  if (op.impedidoSublimite && op.rbt12 <= SUBLIMITE) aliq -= Math.min(teto, aliq * PARTILHA_LOCAL[anexo][faixa]);
  let total = op.receita * aliq;
  det.push({ nome: `DAS — Anexo ${anexo} (alíquota efetiva ${pct(aliq, 2)})`, valor: total });
  if (op.impedidoSublimite) {
    total += tributosLocais(seg, op, det, saldo, ' — fora do DAS (sublimite)');
  } else if (op.rbt12 > SUBLIMITE) {
    // 6a faixa sem impedimento: ICMS/ISS seguem no DAS calculados pela 5a faixa (Res. CGSN 140, art. 21, III, b).
    const f = ANEXOS[anexo][4];
    const ef5 = (op.rbt12 * f[1] - f[2]) / op.rbt12;
    const local = op.receita * Math.min(teto, ef5 * PARTILHA_LOCAL[anexo][4]);
    det.push({ nome: `${seg.icms ? 'ICMS' : 'ISS'} no DAS (pela 5ª faixa)`, valor: local });
    total += local;
  }
  return { anexo, aliq, tribVenda: total };
}

function apurarPisCofins(regime, seg, op, det, saldo) {
  const naoCumulativo = regime === 'real' && !seg.pisCofinsCumulativo;
  // ICMS destacado fora da base do PIS/COFINS (STF, Tema 69) e da base do credito (Lei 14.592/2023).
  const icmsDestacado = seg.icms && seg.icms.credito ? seg.icms.aliq : 0;
  const tributada = seg.fracaoTributadaPisCofins ?? 1;
  const base = op.receita * (1 - icmsDestacado) * tributada;
  const sobre = icmsDestacado ? ' sobre a receita sem ICMS' : '';
  let pis = base * (naoCumulativo ? 0.0165 : 0.0065);
  let cofins = base * (naoCumulativo ? 0.076 : 0.03);
  if (naoCumulativo) {
    const credito = op.compras * (seg.creditoCompras ?? tributada) * (1 - icmsDestacado) + op.aluguel + op.utilidades + op.depreciacao;
    // credito que passa do debito fica como saldo para os meses seguintes (Lei 10.833/2003, art. 3o §4o)
    const p = pis - credito * 0.0165 - saldo.pis, c = cofins - credito * 0.076 - saldo.cofins;
    pis = Math.max(0, p);
    cofins = Math.max(0, c);
    saldo.pis = Math.max(0, -p);
    saldo.cofins = Math.max(0, -c);
    det.push({ nome: `PIS não cumulativo (1,65%${sobre} − créditos)`, valor: pis });
    det.push({ nome: `COFINS não cumulativa (7,6%${sobre} − créditos)`, valor: cofins });
  } else {
    const nota = regime === 'real' ? ', regime do software' : '';
    det.push({ nome: `PIS cumulativo (0,65%${sobre}${nota})`, valor: pis });
    det.push({ nome: `COFINS cumulativa (3%${sobre}${nota})`, valor: cofins });
  }
  return pis + cofins;
}

// Apura os tributos do mes num regime. Nao altera o estado: devolve o prejuizo fiscal novo.
//
// op: { seg, receita, compras, cmv, folha, proLabore, despesas, aluguel, utilidades,
//       depreciacao, juros, rbt12, fatorR, impedidoSublimite, absorvido, perdas }
// `perdas` sao baixas sem saida de caixa (cliente que nao pagou): reduzem o lucro.
// `absorvido` e a parte da folha da fabrica que foi para o estoque (custeio por absorcao): saiu
// do caixa, mas so vira resultado quando a peca e vendida (e ai esta dentro do cmv).
// `saldoAnt`: saldo credor de ICMS e PIS/COFINS vindo do mes anterior; o novo volta em `saldo`.
export function apurar(regime, op, prejuizoAnt, saldoAnt = null) {
  const seg = op.seg;
  const saldo = { icms: 0, pis: 0, cofins: 0, ...(saldoAnt || {}) };
  const det = [];
  const contador = HONORARIOS[regime] * (op.indice || 1);
  const encargos = op.folha * ENCARGOS_FOLHA;
  let cpp = 0, anexo = null, aliq = null, tribVenda = 0, prejuizo = prejuizoAnt;

  if (regime === 'simples') {
    ({ anexo, aliq, tribVenda } = apurarSimples(seg, op, det, saldo));
  } else {
    cpp = op.folha * CPP_FOLHA + op.proLabore * INSS_PATRONAL;
    tribVenda = apurarPisCofins(regime, seg, op, det, saldo) + tributosLocais(seg, op, det, saldo);
    det.push({ nome: 'INSS patronal + RAT + terceiros', valor: cpp });
  }

  const lucroAntesIR = op.receita - tribVenda - op.cmv - op.folha - encargos - cpp - op.proLabore
    - op.despesas - contador - op.depreciacao - op.juros + (op.absorvido || 0) - (op.perdas || 0);

  let irpj = 0, csll = 0;
  if (regime === 'presumido') {
    const pIR = seg.tipo === 'servico' ? 0.32 : 0.08, pCS = seg.tipo === 'servico' ? 0.32 : 0.12;
    const bIR = op.receita * pIR;
    irpj = bIR * 0.15 + Math.max(0, bIR - 20000) * 0.10;
    csll = op.receita * pCS * 0.09;
    det.push({ nome: `IRPJ (presunção de ${pct(pIR)})`, valor: irpj });
    det.push({ nome: `CSLL (presunção de ${pct(pCS)})`, valor: csll });
  } else if (regime === 'real') {
    let base = lucroAntesIR;
    if (base <= 0) {
      prejuizo += -base;
      base = 0;
    } else {
      const comp = Math.min(prejuizo, 0.3 * base);
      base -= comp;
      prejuizo -= comp;
    }
    irpj = base * 0.15 + Math.max(0, base - 20000) * 0.10;
    csll = base * 0.09;
    det.push({ nome: 'IRPJ sobre o lucro real', valor: irpj });
    det.push({ nome: 'CSLL sobre o lucro real', valor: csll });
  }

  return {
    regime, anexo, aliq, tribVenda, encargos, cpp, irpj, csll, contador, lucroAntesIR,
    lucro: lucroAntesIR - irpj - csll, det, prejuizo, saldo, totalTributos: tribVenda + cpp + irpj + csll,
  };
}

// --- Pessoa fisica do socio ---

// IRRF mensal sobre o pro-labore em 2026: tabela progressiva com desconto simplificado e a
// reducao da Lei 15.270/2025 (isencao ate R$ 5 mil, reducao gradual ate R$ 7.350).
const TABELA_IRRF = [[2428.80, 0, 0], [2826.65, 0.075, 182.16], [3751.05, 0.15, 394.16], [4664.68, 0.225, 675.49], [Infinity, 0.275, 908.73]];

export function inssSocio(bruto) { return Math.min(bruto, TETO_INSS) * 0.11; }

export function irrfProLabore(bruto) {
  const base = bruto - Math.max(inssSocio(bruto), 607.20);
  const [, aliq, parcela] = TABELA_IRRF.find(f => base <= f[0]);
  const reducao = bruto <= 5000 ? 312.89 : bruto <= 7350 ? 978.62 - 0.133145 * bruto : 0;
  return Math.max(0, Math.round((base * aliq - parcela - Math.max(0, reducao)) * 100) / 100);
}

export function liquidoProLabore(bruto) { return bruto - inssSocio(bruto) - irrfProLabore(bruto); }
