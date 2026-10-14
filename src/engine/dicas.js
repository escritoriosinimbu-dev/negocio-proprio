import { NOME_REGIME, REGIMES } from './regras.js';
import {
  SEG, capacidades, margemContribuicao, pontoEquilibrio, precoJusto, dividaTotal, procuraDoMercado,
} from './empresa.js';
import { comparativoDoAno } from './simulacao.js';
import { brl, brl2, num, pct } from './formato.js';

// "O que o contador diria": diagnostico do ultimo mes e das decisoes em aberto.
// Devolve [tipo, texto], tipo em '', 'bom', 'ruim', 'aviso'.
export function dicas(s) {
  const seg = SEG(s), h = s.hist.at(-1), out = [];
  const c = capacidades(s, s.dec.func);
  if (s.caixa < 0) out.push(['ruim', `O caixa está negativo há ${s.negativos} mês(es). Corte custos, pegue capital de giro na aba Finanças ou aumente as vendas.`]);
  if (h) {
    if (h.faltaProduto > h.demanda * 0.08) {
      out.push(['ruim', seg.revenda
        ? 'Faltou mercadoria. Aumente o plano de compras ou contrate na reposição.'
        : seg.estocavel
        ? 'Faltou produto. Produza mais, contrate na fábrica ou compre equipamento.'
        : `Faltou capacidade ${seg.noSetorProd}. Contrate ou invista em equipamento.`]);
    }
    if (h.faltaAtend > h.demanda * 0.08) out.push(['ruim', `Faltou gente ${seg.noSetorCom}: havia cliente, mas ninguém para atender. Contrate ${seg.umCargoCom}.`]);
    const usado = seg.estocavel ? h.produzido : h.vendidos;
    // na carteira, a procura ainda esta subindo nos primeiros meses: equipe sobrando e investimento
    const carteiraCrescendo = seg.recorrente && s.carteira < procuraDoMercado(s) * 0.95;
    if (h.capacidade > 0 && usado < h.capacidade * 0.6 && h.faltaAtend < h.demanda * 0.05 && !carteiraCrescendo) {
      out.push(['aviso', `Capacidade ociosa: a equipe ${seg.noSetorProd} pode fazer ${num(h.capacidade)} e foram usadas ${num(usado)}. Mais marketing, preço menor ou equipe menor.`]);
    }
    if (seg.estocavel && s.estoque > h.vendidos * 1.5 && s.estoque > 300) out.push(['aviso', `Estoque de ${num(s.estoque)} ${seg.unidades} parado. Estoque é dinheiro empatado e custa armazenagem.`]);
    if (s.regime === 'simples' && h.anexo === 'V') out.push(['aviso', `Fator R em ${pct(h.fatorR)}: abaixo de 28% o serviço cai no Anexo V do Simples. Um pró-labore maior pode levar a empresa ao Anexo III.`]);
    const { tot } = comparativoDoAno(s, Math.floor(h.mes / 12));
    // so recomenda regime que ainda pode ser adotado (o Simples pode estar fechado em janeiro)
    const melhor = REGIMES.filter(r => tot[r] !== null && !(r === 'simples' && s.excluidoSimples))
      .sort((a, b) => tot[a] - tot[b])[0];
    if (melhor && melhor !== s.regime && tot[s.regime] !== null && tot[s.regime] - tot[melhor] > Math.max(3000, tot[s.regime] * 0.1)) {
      out.push(['aviso', `No acumulado do ano, o ${NOME_REGIME[melhor]} teria custado ${brl(tot[s.regime] - tot[melhor])} a menos em tributos. A troca só é possível em janeiro.`]);
    }
  }
  const mc = margemContribuicao(s);
  if (mc <= 0) out.push(['ruim', `Cada ${seg.unidade} vendida dá prejuízo: o preço não cobre o custo direto e os tributos. Suba o preço ou defina-o pela margem na aba Comercial.`]);
  else if (h) {
    const pe = pontoEquilibrio(s);
    if (h.vendidos < pe * 0.95) out.push(['aviso', `Ponto de equilíbrio: cerca de ${num(pe)} ${seg.unidades} por mês. Você vendeu ${num(h.vendidos)}. Abaixo dele, o mês fecha no vermelho.`]);
  }
  const justo = precoJusto(s);
  if (s.dec.preco > justo * 1.15) out.push(['aviso', `Seu preço está ${pct(s.dec.preco / justo - 1)} acima do que o cliente acha justo pela sua qualidade e reputação (${brl2(justo)}). Preço alto pede qualidade e marca à altura.`]);
  if (s.concorrencia >= 0.15) out.push(['aviso', `A concorrência já leva ${pct(s.concorrencia)} da sua procura. Qualidade e reputação seguram cliente; preço baixo demais só troca margem por volume.`]);
  if (s.selic >= 0.14 && s.emprestimos.some(e => e.posFixado) && s.caixa > dividaTotal(s) * 1.5) out.push(['aviso', `Selic em ${pct(s.selic, 2)}: o Pronampe é pós-fixado e ficou mais caro. Com o caixa folgado, quitar pode valer a pena.`]);
  if (s.contratoFornecedor && s.contratoFornecedor.ate - s.mes === 1) out.push(['aviso', 'O contrato com o fornecedor acaba no fim deste mês: o custo volta ao preço de mercado, com os reajustes acumulados.']);
  if (!s.dec.seguro && s.imobilizado - s.deprecAcum > 80000) out.push(['', 'Sem seguro empresarial: uma enchente ou uma quebra grande sai inteira do caixa. Veja a aba Finanças.']);
  if (c.desorg) out.push(['ruim', `A administração não dá conta de ${c.total} pessoas (limite ${c.capAdm}). Produtividade cai e o risco de multa sobe. Contrate no administrativo.`]);
  if (c.apertado) out.push(['ruim', `${c.total} pessoas num espaço para ${c.capEspaco}. Amplie as instalações na aba ${seg.setorProd}.`]);
  if (s.M < 45) out.push(['ruim', 'Moral baixa: a produtividade cai e as pessoas começam a pedir demissão.']);
  if (s.A < 25 && s.dec.marketing < seg.mkEscala * 0.4) out.push(['aviso', 'Pouca gente conhece a marca. Sem marketing, a reputação não sobe.']);
  return out;
}
