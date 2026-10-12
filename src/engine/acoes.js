import { SEG, limiteCredito, taxaCapitalGiro, lucroDisponivel } from './empresa.js';
import { LIMITE_ISENCAO_DIVIDENDOS, ALIQ_RETENCAO_DIVIDENDOS } from './regras.js';

// Acoes imediatas do jogador (fora do fechamento do mes). Cada uma valida e devolve
// { ok, msg }; nenhuma deixa o caixa negativo por conta propria.

export const NIVEL_MAX_EQUIP = 5;
export const NIVEL_MAX_ESPACO = 4;

// O equipamento atende a equipe inteira: o preco cresce com o numero de pessoas na producao
// (equipCusto equipa 3 pessoas). Sem isso, +20% de produtividade custava o mesmo para 3 ou 30.
export function custoEquip(s) {
  return Math.round(SEG(s).equipCusto * (1 + 0.6 * s.equipNivel) * Math.max(1, s.func.producao / 3) / 100) * 100;
}
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

// Retencao na fonte sobre lucros (Lei 15.270/2025): 10% sobre o total que a mesma pessoa recebe no
// mes quando ele passa de R$ 50 mil. O dividendo e pago pro rata a participacao: so a parte do dono
// conta para o limite dele. Devolve a retencao incremental desta parcela (pode ser maior que ela:
// ao cruzar o limite, os 10% passam a valer tambem sobre o que ja foi pago no mes).
export function irrfDaDistribuicao(s, valor) {
  const ret = v => (v > LIMITE_ISENCAO_DIVIDENDOS ? v * ALIQ_RETENCAO_DIVIDENDOS : 0);
  const antes = s.distribuidoMes * s.participacao, depois = (s.distribuidoMes + valor) * s.participacao;
  return ret(depois) - ret(antes);
}

export function distribuirLucros(s, valor) {
  if (!(valor >= 1000)) return { ok: false, msg: 'Valor mínimo de R$ 1.000.' };
  if (valor > lucroDisponivel(s)) return { ok: false, msg: 'Não há lucro acumulado suficiente.' };
  if (valor > s.caixa) return { ok: false, msg: 'Caixa insuficiente.' };
  const irrf = irrfDaDistribuicao(s, valor);
  const parteDono = valor * s.participacao;
  s.caixa -= valor;
  s.distribuido += valor;
  s.distribuidoMes += valor;
  s.retirado += parteDono - irrf;
  s.irrfDiv += irrf;
  s.dividendosDonoMes = (s.dividendosDonoMes || 0) + parteDono;
  s.irrfDivMes = (s.irrfDivMes || 0) + irrf;
  return { ok: true, irrf, liquido: parteDono - irrf, investidor: valor - parteDono, msg: 'Lucros distribuídos.' };
}
