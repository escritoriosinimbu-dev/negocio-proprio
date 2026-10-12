import { SEG, limiteCredito, taxaCapitalGiro, lucroDisponivel } from './empresa.js';

// Acoes imediatas do jogador (fora do fechamento do mes). Cada uma valida e devolve
// { ok, msg }; nenhuma deixa o caixa negativo por conta propria.

export const NIVEL_MAX_EQUIP = 5;
export const NIVEL_MAX_ESPACO = 4;
export const LIMITE_ISENCAO_DIVIDENDOS = 50000;

export function custoEquip(s) { return Math.round(SEG(s).equipCusto * (1 + 0.6 * s.equipNivel)); }
export function custoEspaco(s) { return 15000 * (1 + s.espacoNivel); }

function investir(s, custo) {
  s.caixa -= custo;
  s.imobilizado += custo;
  s.investidoMes += custo;
}

export function custoDaCompra(s, id) {
  if (id === 'equip') return custoEquip(s);
  if (id === 'espaco') return custoEspaco(s);
  if (id.startsWith('exp:')) {
    const e = SEG(s).expansoes.find(x => x.id === id.slice(4));
    return e ? e.custo : null;
  }
  return null;
}

export function comprar(s, id) {
  const custo = custoDaCompra(s, id);
  if (custo === null) return { ok: false, msg: 'Compra desconhecida.' };
  if (s.caixa < custo) return { ok: false, msg: 'Caixa insuficiente.' };
  if (id === 'equip') {
    if (s.equipNivel >= NIVEL_MAX_EQUIP) return { ok: false, msg: 'Equipamento no nível máximo.' };
    investir(s, custo);
    s.equipNivel++;
  } else if (id === 'espaco') {
    if (s.espacoNivel >= NIVEL_MAX_ESPACO) return { ok: false, msg: 'Instalações no tamanho máximo.' };
    investir(s, custo);
    s.espacoNivel++;
  } else {
    const e = SEG(s).expansoes.find(x => x.id === id.slice(4));
    if (s.expansoes.includes(e.id)) return { ok: false, msg: 'Expansão já feita.' };
    investir(s, custo);
    s.expansoes.push(e.id);
    s.mercadoMult *= 1 + e.mult;
    s.aluguelExtra += e.aluguel;
  }
  return { ok: true, msg: 'Investimento feito.' };
}

export function contratarEmprestimo(s, valor) {
  if (!(valor >= 1000)) return { ok: false, msg: 'Valor mínimo de R$ 1.000.' };
  if (valor > limiteCredito(s)) return { ok: false, msg: 'Acima do limite de crédito.' };
  s.emprestimos.push({ nome: 'Capital de giro', saldo: valor, taxa: taxaCapitalGiro(s), amort: valor / 24 });
  s.caixa += valor;
  s.captadoMes += valor;
  return { ok: true, msg: 'Empréstimo contratado.' };
}

export function quitarEmprestimo(s, i) {
  const e = s.emprestimos[i];
  if (!e) return { ok: false, msg: 'Empréstimo não encontrado.' };
  if (s.caixa < e.saldo) return { ok: false, msg: 'Caixa insuficiente para quitar.' };
  s.caixa -= e.saldo;
  s.quitadoMes += e.saldo;
  s.emprestimos.splice(i, 1);
  return { ok: true, msg: 'Empréstimo quitado.' };
}

// Lei 15.270/2025 (simplificada): retencao de 10% quando a distribuicao a mesma pessoa
// passa de R$ 50 mil no mes. O jogo soma o que ja foi distribuido no mes corrente.
export function distribuirLucros(s, valor) {
  if (!(valor >= 1000)) return { ok: false, msg: 'Valor mínimo de R$ 1.000.' };
  if (valor > lucroDisponivel(s)) return { ok: false, msg: 'Não há lucro acumulado suficiente.' };
  if (valor > s.caixa) return { ok: false, msg: 'Caixa insuficiente.' };
  const noMes = s.distribuidoMes + valor;
  const irrfAntes = s.distribuidoMes > LIMITE_ISENCAO_DIVIDENDOS ? s.distribuidoMes * 0.10 : 0;
  const irrfDepois = noMes > LIMITE_ISENCAO_DIVIDENDOS ? noMes * 0.10 : 0;
  const irrf = irrfDepois - irrfAntes;
  s.caixa -= valor;
  s.distribuido += valor;
  s.distribuidoMes += valor;
  s.retirado += valor - irrf;
  s.irrfDiv += irrf;
  return { ok: true, irrf, liquido: valor - irrf, msg: 'Lucros distribuídos.' };
}
