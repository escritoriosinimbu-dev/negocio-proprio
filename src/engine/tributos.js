import { ANEXOS, HONORARIOS, FATOR_R_MINIMO, SUBLIMITE } from './regras.js';
import { pct } from './formato.js';

// Aliquota efetiva do Simples: (RBT12 x aliquota nominal - parcela a deduzir) / RBT12.
export function aliqEfetiva(anexo, rbt12) {
  const t = ANEXOS[anexo];
  if (rbt12 <= 0) return t[0][1];
  const f = t.find(x => rbt12 <= x[0]) || t[t.length - 1];
  return Math.max(0, (rbt12 * f[1] - f[2]) / rbt12);
}

export function anexoSimples(tipo, fatorR) {
  if (tipo === 'comercio') return 'I';
  if (tipo === 'industria') return 'II';
  return fatorR >= FATOR_R_MINIMO ? 'III' : 'V';
}

// ICMS (estadual) e ISS (municipal) pelas regras normais, fora do Simples.
function tributosLocais(seg, op, det, sufixo = '') {
  let total = 0;
  if (seg.icms) {
    const icms = Math.max(0, op.receita * seg.icms.aliq - (seg.icms.credito ? op.compras * seg.icms.aliq : 0));
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

// Apura os tributos do mes num regime. Nao altera o estado: devolve o prejuizo fiscal novo.
//
// op: { seg, receita, compras, cmv, folha, proLabore, despesas, aluguel, utilidades,
//       depreciacao, juros, rbt12, fatorR }
export function apurar(regime, op, prejuizoAnt) {
  const seg = op.seg;
  const det = [];
  const contador = HONORARIOS[regime];
  const encargos = op.folha * 0.30; // FGTS + provisao de 13o e ferias
  let cpp = 0, anexo = null, aliq = null, tribVenda = 0, prejuizo = prejuizoAnt;

  if (regime === 'simples') {
    anexo = anexoSimples(seg.tipo, op.fatorR);
    aliq = aliqEfetiva(anexo, op.rbt12);
    tribVenda = op.receita * aliq;
    det.push({ nome: `DAS — Anexo ${anexo} (alíquota efetiva ${pct(aliq, 2)})`, valor: tribVenda });
    // Acima do sublimite (6a faixa) a reparticao do DAS nao tem ICMS/ISS: os dois passam a ser
    // recolhidos por fora, pelas regras normais. Sem isso, crescer alem de R$ 3,6 mi baixaria o tributo.
    if (op.rbt12 > SUBLIMITE) tribVenda += tributosLocais(seg, op, det, ' — fora do DAS (sublimite)');
  } else {
    cpp = op.folha * 0.278 * 1.2 + op.proLabore * 0.20;
    const real = regime === 'real';
    let pis = op.receita * (real ? 0.0165 : 0.0065);
    let cofins = op.receita * (real ? 0.076 : 0.03);
    if (real) {
      const base = op.compras + op.aluguel + op.utilidades + op.depreciacao;
      pis = Math.max(0, pis - base * 0.0165);
      cofins = Math.max(0, cofins - base * 0.076);
    }
    det.push({ nome: real ? 'PIS não cumulativo (1,65% − créditos)' : 'PIS cumulativo (0,65%)', valor: pis });
    det.push({ nome: real ? 'COFINS não cumulativa (7,6% − créditos)' : 'COFINS cumulativa (3%)', valor: cofins });
    tribVenda = pis + cofins + tributosLocais(seg, op, det);
    det.push({ nome: 'INSS patronal + RAT + terceiros', valor: cpp });
  }

  const lucroAntesIR = op.receita - tribVenda - op.cmv - op.folha - encargos - cpp - op.proLabore
    - op.despesas - contador - op.depreciacao - op.juros;

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
    lucro: lucroAntesIR - irpj - csll, det, prejuizo, totalTributos: tribVenda + cpp + irpj + csll,
  };
}
