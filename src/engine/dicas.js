import { NOME_REGIME } from './regras.js';
import { SEG, capacidades } from './empresa.js';
import { comparativoDoAno } from './simulacao.js';
import { brl, num, pct } from './formato.js';

// "O que o contador diria": diagnostico do ultimo mes e das decisoes em aberto.
// Devolve [tipo, texto], tipo em '', 'bom', 'ruim', 'aviso'.
export function dicas(s) {
  const seg = SEG(s), h = s.hist.at(-1), out = [];
  const c = capacidades(s, s.dec.func);
  if (s.caixa < 0) out.push(['ruim', `O caixa está negativo há ${s.negativos} mês(es). Corte custos, pegue capital de giro na aba Finanças ou aumente as vendas.`]);
  if (h) {
    if (h.faltaProduto > h.demanda * 0.08) {
      out.push(['ruim', seg.estocavel
        ? 'Faltou produto. Produza mais, contrate na fábrica ou compre equipamento.'
        : `Faltou capacidade ${seg.noSetorProd}. Contrate ou invista em equipamento.`]);
    }
    if (h.faltaAtend > h.demanda * 0.08) out.push(['ruim', `Faltou gente ${seg.noSetorCom}: havia cliente, mas ninguém para atender. Contrate ${seg.umCargoCom}.`]);
    const usado = seg.estocavel ? h.produzido : h.vendidos;
    if (h.capacidade > 0 && usado < h.capacidade * 0.6 && h.faltaAtend < h.demanda * 0.05) {
      out.push(['aviso', `Capacidade ociosa: a equipe ${seg.noSetorProd} pode fazer ${num(h.capacidade)} e foram usadas ${num(usado)}. Mais marketing, preço menor ou equipe menor.`]);
    }
    if (seg.estocavel && s.estoque > h.vendidos * 1.5 && s.estoque > 300) out.push(['aviso', `Estoque de ${num(s.estoque)} ${seg.unidades} parado. Estoque é dinheiro empatado e custa armazenagem.`]);
    if (s.regime === 'simples' && h.anexo === 'V') out.push(['aviso', `Fator R em ${pct(h.fatorR)}: abaixo de 28% o serviço cai no Anexo V do Simples. Um pró-labore maior pode levar a empresa ao Anexo III.`]);
    const { tot, melhor } = comparativoDoAno(s, Math.floor(h.mes / 12));
    if (melhor && melhor !== s.regime && tot[s.regime] !== null && tot[s.regime] - tot[melhor] > Math.max(3000, tot[s.regime] * 0.1)) {
      out.push(['aviso', `No acumulado do ano, o ${NOME_REGIME[melhor]} teria custado ${brl(tot[s.regime] - tot[melhor])} a menos em tributos. A troca só é possível em janeiro.`]);
    }
  }
  if (c.desorg) out.push(['ruim', `A administração não dá conta de ${c.total} pessoas (limite ${c.capAdm}). Produtividade cai e o risco de multa sobe. Contrate no administrativo.`]);
  if (c.apertado) out.push(['ruim', `${c.total} pessoas num espaço para ${c.capEspaco}. Amplie as instalações na aba ${seg.setorProd}.`]);
  if (s.M < 45) out.push(['ruim', 'Moral baixa: a produtividade cai e as pessoas começam a pedir demissão.']);
  if (s.A < 25 && s.dec.marketing < seg.mkEscala * 0.4) out.push(['aviso', 'Pouca gente conhece a marca. Sem marketing, a reputação não sobe.']);
  return out;
}
