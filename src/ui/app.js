import {
  SEGMENTOS, REGIMES, NOME_REGIME, HONORARIOS, POLITICA, MESES, DURACAO, SALARIO_MINIMO, TETO_INSS,
  LIMITE_ISENCAO_DIVIDENDOS,
  brl, brl2, num, pct, brlK,
  SEG, clamp, soma, novoJogo, capacidades, demandaEsperada, salario, folhaPrevista,
  dividaTotal, totalReceber, patrimonio, valorEmpresa, limiteCredito, taxaCapitalGiro, limiteCheque,
  riquezaDono, lucroDisponivel, notaFinal, multiploNota, CAPITAL_REFERENCIA, politicaPermitida, planoProducaoAuto,
  migrarEstado, liquidoProLabore, irrfDaDistribuicao, jogoEncerrado,
  precoJusto, precoMercado, margemContribuicao, precoPelaMargem, pontoEquilibrio, custosFixos, aliqVendaEstimada,
  custoInsumoUnit, DESPESA_VARIAVEL, premioSeguro, indice, aluguelMes, CONCORRENCIA_MAX, efeito,
  custoEquip, custoEspaco, comprar, contratarEmprestimo, quitarEmprestimo, distribuirLucros,
  NIVEL_MAX_EQUIP, NIVEL_MAX_ESPACO,
  fecharMes, comparativoDoAno, podeTrocarRegime, trocarRegime, resolverEvento, dicas,
} from '../engine/index.js';
import { salvarJogo, carregarJogo, apagarJogo } from './armazenamento.js';

// Interface: um unico render() reconstroi a tela a partir do estado `S`. Sliders atualizam
// so os trechos afetados (para nao perder o arraste); o resto re-renderiza inteiro.

let S = null;
let aba = 'painel';
let pendente = null;   // compra aguardando confirmacao
let modal = null;      // { tipo, ... }
let setup = { nome: 'Minha Empresa', segmento: 'hamburgueria', capital: 150000, emprestimo: 0, regime: 'simples' };
let app = null;
let veu = null;

// O rodape fixo muda de altura com a escala de fonte do Android (a WebView aplica a do sistema):
// a reserva no fim da pagina acompanha a altura medida.
const medirRodape = typeof ResizeObserver === 'function'
  ? new ResizeObserver(([e]) => document.documentElement.style.setProperty('--rodape-h', Math.ceil(e.target.getBoundingClientRect().height) + 'px'))
  : null;

const REGUA = 'A a partir de 4×, B de 2,5×, C de 1,5×, D de 1×';
const ABAS = ['painel', 'producao', 'comercial', 'pessoas', 'financas', 'impostos', 'relatorios'];

function salvar() { salvarJogo({ S, aba }); }

function anoMes(m) { return { ano: Math.floor(m / 12) + 1, mes: MESES[m % 12], mm: String(m % 12 + 1).padStart(2, '0') }; }
function sinal(v) { return v < 0 ? 'neg' : v > 0 ? 'pos' : ''; }
function esc(t) { return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function render() {
  if (!S) {
    // a abertura nao tem rodape: sem isso o observer gravaria a altura 0 do rodape removido
    if (medirRodape) medirRodape.disconnect();
    document.documentElement.style.removeProperty('--rodape-h');
    app.innerHTML = telaAbertura();
    renderModal();
    return;
  }
  const seg = SEG(S), am = anoMes(S.mes), h = S.hist.at(-1);
  app.innerHTML = `
    <div class="topo">
      <div class="marca">${esc(S.nome)}<small>${seg.nome} · ${NOME_REGIME[S.regime]}${S.participacao < 1 ? ' · sua parte: ' + pct(S.participacao) : ''}</small></div>
      <div class="carimbo" title="Mês que está sendo decidido">Competência<b>${am.mm}/ano ${am.ano}</b></div>
    </div>
    <section class="placar">
      <div class="caixa">
        <span class="rot">Caixa</span>
        <span class="valor ${S.caixa < 0 ? 'neg' : ''}">${brl(S.caixa)}</span>
        <span class="sub">${h ? `lucro de ${MESES[h.mes % 12].toLowerCase()}: ${brl(h.lucro)}` : 'antes do primeiro mês'}</span>
      </div>
      <div class="medidores">
        ${medidor('Reputação', S.A)}${medidor('Qualidade', S.Q)}${medidor('Moral', S.M)}${medidor('Economia', (S.economia - 0.8) / 0.4 * 100)}
      </div>
    </section>
    <nav class="abas" role="tablist">
      ${[['painel', 'Painel'], ['producao', seg.setorProd], ['comercial', 'Comercial'], ['pessoas', 'Pessoas'], ['financas', 'Finanças'], ['impostos', 'Impostos'], ['relatorios', 'Relatórios']]
        .map(([id, r]) => `<button role="tab" data-aba="${id}" aria-selected="${aba === id}">${r}</button>`).join('')}
    </nav>
    <div id="aba">${renderAba()}</div>
    <div class="rodape"><div class="dentro">
      <div class="previsao" id="previsao">${textoPrevisao()}</div>
      <button class="fechar" data-acao="fechar" ${jogoEncerrado(S) ? 'disabled' : ''}>Fechar ${MESES[S.mes % 12].toLowerCase()} →</button>
    </div></div>`;
  const rod = app.querySelector('.rodape');
  if (medirRodape && rod) { medirRodape.disconnect(); medirRodape.observe(rod); }
  const sel = app.querySelector('.abas [aria-selected="true"]');
  if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  renderModal();
}

function medidor(nome, v) {
  v = clamp(v, 0, 100);
  return `<div class="medidor"><span>${nome}</span><span class="barra"><i style="width:${v}%" class="${v < 35 ? 'baixo' : ''}"></i></span><span class="num">${Math.round(v)}</span></div>`;
}

// Fecha o mes numa copia do estado, sem sorte nem azar (rnd = 0,5 nao sorteia acontecimento nem
// saida de funcionario), para mostrar o caixa provavel antes de o jogador decidir.
function caixaPrevisto() {
  try {
    // o fechamento nunca le mais de 24 meses de historico: nao clona o resto a cada passo do slider
    return fecharMes(structuredClone({ ...S, hist: S.hist.slice(-24) }), () => 0.5).caixa;
  } catch (e) {
    return null;
  }
}

function textoPrevisao() {
  const seg = SEG(S), c = capacidades(S, S.dec.func), dem = Math.round(demandaEsperada(S));
  const plano = seg.estocavel ? Math.min(S.dec.producaoAuto ? planoProducaoAuto(S) : S.dec.producao, c.capacidade) : 0;
  const oferta = (seg.estocavel ? plano + S.estoque : c.capacidade) - soma(S.pedidos, p => p.qtd);
  const gargalo = c.cobertura < Math.min(dem, oferta) ? 'atendimento' : oferta < dem ? (seg.estocavel ? 'produção' : 'capacidade') : null;
  const cap = seg.estocavel ? `produção <b>${num(plano)}</b> + estoque <b>${num(S.estoque)}</b>` : `capacidade <b>${num(c.capacidade)}</b>`;
  const cx = jogoEncerrado(S) ? null : caixaPrevisto();
  const caixa = cx === null ? '' : ` · caixa previsto <b class="${cx < 0 ? 'neg' : ''}">${brl(cx)}</b>`;
  return `Procura estimada <b>${num(dem)}</b> ${seg.unidades} · ${cap} · atendimento <b>${num(c.cobertura)}</b>${caixa}${gargalo ? ` <span class="chip alerta">gargalo: ${gargalo}</span>` : ''}${cx !== null && cx < 0 ? ' <span class="chip alerta">caixa negativo</span>' : ''}`;
}

function renderAba() {
  switch (aba) {
    case 'producao': return abaProducao();
    case 'comercial': return abaComercial();
    case 'pessoas': return abaPessoas();
    case 'financas': return abaFinancas();
    case 'impostos': return abaImpostos();
    case 'relatorios': return abaRelatorios();
    default: return abaPainel();
  }
}

/* ---- Painel ---- */
function abaPainel() {
  const seg = SEG(S), h = S.hist.at(-1);
  const reiniciar = '<div class="row"><button class="btn perigo" data-acao="reiniciar">Começar outra empresa</button></div>';
  if (!h) {
    return `<div class="stack">
      <div class="bloco"><h2>Primeiro mês de ${esc(S.nome)}</h2>
        <p class="ajuda">Você investiu ${brl(seg.setup)} em equipamentos e reforma e começa com ${brl(S.caixa)} em caixa.
        Ninguém conhece a marca ainda: a reputação começa em 10, e as vendas dos primeiros meses devem ser baixas. Planeje o caixa para aguentar até a marca pegar.</p>
        <ul class="noticias">
          <li>Em cada aba você toma as decisões de um setor: equipe, preço, marketing, compras, crédito e regime tributário.</li>
          <li>Quando estiver pronto, toque em <b>Fechar o mês</b>. O jogo calcula vendas, custos, tributos e caixa e mostra o resultado.</li>
          <li>Três meses seguidos com o caixa negativo e a empresa quebra. No fim do ano ${DURACAO / 12}, a nota mede o seu ganho: o que você levou (pró-labore líquido, lucros recebidos e sua parte no valor da empresa) menos o capital que colocou. Múltiplo = 1 + ganho ÷ ${brl(CAPITAL_REFERENCIA)}: ${REGUA}.</li>
        </ul>
      </div>
      ${blocoDicas()}
      ${reiniciar}
    </div>`;
  }
  return `<div class="stack">
    <div class="kpis">
      ${kpi('Receita', brl(h.receita))}${kpi('Lucro líquido', brl(h.lucro), sinal(h.lucro))}
      ${kpi('Vendidas', num(h.vendidos) + ' <span class="muted small">de ' + num(h.demanda) + '</span>')}${kpi('Tributos', brl(h.tributos))}
    </div>
    <div class="bloco grafico"><header><h3>Receita e caixa</h3>
      <div class="legenda"><span><i class="leg-receita"></i>Receita</span><span><i class="leg-caixa"></i>Caixa</span><span><i class="leg-lucro"></i>Lucro</span></div></header>
      ${grafico()}</div>
    <div class="kpis">${kpi('Nota se acabasse hoje', notaFinal(S))}${kpi('Múltiplo', fmtMultiplo(multiploNota(S)))}${kpi('Valor da empresa', brlK(valorEmpresa(S)))}${kpi('Meses restantes', S.modoLivre ? '—' : Math.max(0, DURACAO - S.mes))}</div>
    <p class="ajuda">Régua da nota: ${REGUA}.</p>
    ${blocoDicas()}
    ${blocoCenario()}
    <div class="bloco"><h3>Acontecimentos de ${MESES[h.mes % 12].toLowerCase()}</h3>${listaNoticias(h.noticias)}</div>
    ${reiniciar}
  </div>`;
}

// truncado para baixo: o numero mostrado nunca alcanca um corte de nota que o jogador nao alcancou
function fmtMultiplo(m) { return (Math.floor(m * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '×'; }

// Cenario externo: juros, economia, concorrencia, crises em curso e contratos.
function blocoCenario() {
  const seg = SEG(S), itens = [];
  const dem = efeito(S, 'demanda'), prod = efeito(S, 'producao'), pm = efeito(S, 'precoMercado');
  if (dem < 1) itens.push(['ruim', `Procura a ${pct(dem)} do normal neste mês (crise ou obra em curso).`]);
  const futura = S.efeitos.find(e => e.tipo === 'demanda' && (e.de ?? -1) > S.mes);
  if (futura) itens.push(['aviso', `Recessão prevista a partir de ${MESES[futura.de % 12].toLowerCase()} do ano ${Math.floor(futura.de / 12) + 1}.`]);
  if (prod < 1) itens.push(['ruim', `Produção a ${pct(prod)} neste mês.`]);
  if (pm < 1) itens.push(['aviso', `Guerra de preços: o mercado aceita ${pct(1 - pm)} a menos.`]);
  if (S.contratoFornecedor) itens.push(['', `Contrato com o fornecedor até ${MESES[S.contratoFornecedor.ate % 12].toLowerCase()} do ano ${Math.floor(S.contratoFornecedor.ate / 12) + 1}: custo travado, compra mínima de ${num(S.contratoFornecedor.minimo)} ${seg.unidades}/mês.`]);
  if (S.contratoCliente) itens.push(['', `Contrato com a rede: ${num(S.contratoCliente.qtd)} ${seg.unidades}/mês a ${brl2(S.contratoCliente.preco)} até ${MESES[S.contratoCliente.ate % 12].toLowerCase()} do ano ${Math.floor(S.contratoCliente.ate / 12) + 1}.`]);
  if (S.fornecedorArriscado) itens.push(['', 'Fornecedor novo, mais barato: pode atrasar entregas.']);
  return `<div class="bloco"><h3>Cenário</h3>
    <div class="kpis">${kpi('Selic', pct(S.selic, 2))}${kpi('Economia', S.economia >= 1.05 ? 'aquecida' : S.economia <= 0.95 ? 'fraca' : 'normal')}${kpi('Concorrência', pct(S.concorrencia), S.concorrencia >= 0.15 ? 'neg' : '')}${kpi('Reajuste acumulado', pct(indice(S) - 1))}</div>
    ${itens.length ? listaNoticias(itens) : ''}
    <p class="ajuda">A Selic muda o custo dos empréstimos pós-fixados e o ânimo do consumidor. Concorrência é a fatia da procura que outras empresas levam: lucro alto atrai gente nova.</p>
  </div>`;
}

function kpi(r, v, cls = '') { return `<div class="kpi"><div class="rot">${r}</div><div class="v ${cls}">${v}</div></div>`; }

function listaNoticias(ns) {
  if (!ns || !ns.length) return '<p class="muted small">Mês tranquilo.</p>';
  return `<ul class="noticias">${ns.map(([t, x]) => `<li class="${t}">${x}</li>`).join('')}</ul>`;
}

function blocoDicas() {
  const d = dicas(S);
  if (!d.length) return '';
  return `<div class="bloco"><header><h3>O que o contador diria</h3><span class="chip ouro">${d.length} ponto${d.length > 1 ? 's' : ''}</span></header>${listaNoticias(d)}</div>`;
}

function grafico() {
  const hs = S.hist.slice(-24);
  const W = 600, H = 220, L = 58, R = 10, T = 12, B = 26;
  const vals = hs.flatMap(h => [h.receita, h.caixa, h.lucro, 0]);
  let max = Math.max(...vals), min = Math.min(...vals);
  const passo = escalaPasso((max - min) / 4 || 1000);
  max = Math.ceil(max / passo) * passo;
  min = Math.floor(min / passo) * passo;
  if (max === min) max = min + passo;
  const y = v => T + (max - v) / (max - min) * (H - T - B);
  const bw = (W - L - R) / Math.max(hs.length, 6);
  const x = i => L + i * bw + bw / 2;
  let g = '';
  for (let v = min; v <= max + 1e-6; v += passo) {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="${v === 0 ? 1.5 : 1}"/>`;
    g += `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono, monospace">${brlK(v).replace('R$ ', '')}</text>`;
  }
  hs.forEach((h, i) => {
    g += `<rect x="${x(i) - bw * 0.35}" y="${y(Math.max(0, h.receita))}" width="${bw * 0.7}" height="${Math.abs(y(h.receita) - y(0))}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1"/>`;
    if (i % Math.ceil(hs.length / 8) === 0 || i === hs.length - 1) {
      const am = anoMes(h.mes);
      g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${am.mes.slice(0, 3).toLowerCase()}/${am.ano}</text>`;
    }
  });
  const linha = (f, cor, w) => {
    const pts = hs.map((h, i) => `${x(i)},${y(f(h))}`).join(' ');
    const u = hs.length - 1;
    return `<polyline points="${pts}" fill="none" stroke="${cor}" stroke-width="${w}" stroke-linejoin="round"/>
      <circle cx="${x(u)}" cy="${y(f(hs[u]))}" r="4" fill="${cor}"/>`;
  };
  g += linha(h => h.lucro, 'var(--gold)', 2) + linha(h => h.caixa, 'var(--ink)', 2.5);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Receita, lucro e caixa por mês">${g}</svg>`;
}

function escalaPasso(bruto) {
  const p = Math.pow(10, Math.floor(Math.log10(bruto)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= bruto) return m * p;
  return 10 * p;
}

/* ---- controles ---- */
function slider(campo, rotulo, valor, min, max, step, fmt, ajuda = '') {
  return `<div class="campo"><div class="topo-campo"><label for="c-${campo}">${rotulo}</label><output data-ver="${campo}">${fmt(valor)}</output></div>
    <input type="range" id="c-${campo}" data-campo="${campo}" min="${min}" max="${max}" step="${step}" value="${valor}">
    ${ajuda ? `<p class="ajuda" data-ajuda="${campo}">${ajuda}</p>` : ''}</div>`;
}

function linhaFunc(setor, titulo, cargo) {
  const seg = SEG(S), alvo = S.dec.func[setor], atual = S.func[setor], sal = salario(seg, setor, S.dec.politica, indice(S));
  const delta = alvo - atual;
  return `<div class="linha-func"><div class="info"><b>${titulo}</b>
      <div class="small muted">${cargo} · salário ${brl(sal)} + encargos</div>
      ${delta ? `<span class="delta ${delta > 0 ? 'mais' : 'menos'}">${delta > 0 ? 'contratar ' + delta + ' · ' + brl(delta * sal * 0.5) : 'demitir ' + -delta + ' · rescisão ' + brl(-delta * sal * 1.3)}</span>` : ''}</div>
    <div class="stepper" data-setor="${setor}"><button data-passo="-1" aria-label="Menos ${titulo}">−</button><output>${alvo}</output><button data-passo="1" aria-label="Mais ${titulo}">+</button></div></div>`;
}

function botaoCompra(id, rotulo, custo) {
  const falta = S.caixa < custo;
  if (pendente === id) return `<div class="row"><button class="btn prim" data-acao="confirmar" data-id="${id}">Confirmar ${brl(custo)}</button><button class="btn" data-acao="cancelar">Cancelar</button></div>`;
  return `<div class="row"><button class="btn" data-acao="comprar" data-id="${id}" ${falta ? 'disabled' : ''}>${rotulo} · ${brl(custo)}</button>${falta ? '<span class="small muted">caixa insuficiente</span>' : ''}</div>`;
}

/* ---- Producao ---- */
const maiuscula = x => x.charAt(0).toUpperCase() + x.slice(1);

function abaProducao() {
  const seg = SEG(S), c = capacidades(S, S.dec.func);
  const insumo = `${maiuscula(seg.insumo)}: ${brl2(S.custoMat)} por ${seg.unidade}`;
  const planoNome = seg.planoNome || 'Plano de produção';
  const verbo = seg.revenda ? 'Comprar' : 'Produzir';
  const perda = seg.perecivel ? ` Todo mês ${pct(seg.perecivel)} do estoque se perde (validade e avaria).` : '';
  let sobDemanda;
  if (seg.recorrente) sobDemanda = `<div class="bloco"><h3>Carteira de clientes</h3><p class="ajuda">A equipe atende até ${num(c.capacidade)} ${seg.unidades} por mês; hoje a carteira tem ${num(S.carteira)}. Cliente atendido fica: a carteira cresce e encolhe devagar, cerca de 30% do caminho por mês até a procura do mercado. Cliente que não cabe na equipe vai embora. Custo direto de ${brl2(S.custoMat)} por cliente (${seg.insumo}).</p></div>`;
  else if (seg.tipo === 'servico') sobDemanda = `<div class="bloco"><h3>Produção sob demanda</h3><p class="ajuda">Serviço não se estoca: a equipe entrega até ${num(c.capacidade)} ${seg.unidades} por mês. Custo direto de ${brl2(S.custoMat)} por ${seg.unidade} (${seg.insumo}).</p></div>`;
  else sobDemanda = `<div class="bloco"><h3>Produção sob demanda</h3><p class="ajuda">A cozinha prepara conforme o pedido, até ${num(c.capacidade)} ${seg.unidades} por mês. ${insumo}, mais 6% de desperdício.</p></div>`;
  return `<div class="stack">
    <div class="bloco"><header><h3>Equipe de ${seg.setorProd.toLowerCase()}</h3><span class="chip">capacidade ${num(c.capacidade)} ${seg.unidades}/mês</span></header>
      ${linhaFunc('producao', seg.setorProd, seg.cargoProd)}
      <p class="ajuda">Cada ${seg.cargoProd} dá conta de cerca de ${num(seg.prodPorFunc)} ${seg.unidades} por mês. Moral, equipamento, espaço e organização mudam esse número.</p>
    </div>
    ${seg.estocavel ? `<div class="bloco"><header><h3>${planoNome}</h3><span class="chip">estoque: ${num(S.estoque)}</span></header>
      <div class="opcoes">
        <label class="opcao"><input type="radio" name="producaoAuto" value="1" ${S.dec.producaoAuto ? 'checked' : ''}><b>Automático</b><span>${verbo} a procura prevista + 5%, descontado o estoque.</span></label>
        <label class="opcao"><input type="radio" name="producaoAuto" value="0" ${!S.dec.producaoAuto ? 'checked' : ''}><b>Manual</b><span>Você decide. Útil para formar estoque antes do Natal.</span></label>
      </div>
      ${S.dec.producaoAuto
        ? `<p class="ajuda">Plano deste mês: cerca de ${num(Math.min(c.capacidade, planoProducaoAuto(S)))} ${seg.unidades} (capacidade ${num(c.capacidade)}). ${insumo}.${perda}</p>`
        : slider('producao', `${verbo} neste mês`, Math.min(S.dec.producao, c.capacidade), 0, Math.max(c.capacidade, 1), 10, v => num(v) + ' ' + seg.unidades,
          `${insumo}. O que não vender fica em estoque (armazenagem de 1,5% ao mês).${perda}`)}
    </div>` : sobDemanda}
    <div class="bloco"><header><h3>Fornecedor</h3>${S.contratoFornecedor ? '<span class="chip ok">contrato ativo</span>' : S.fornecedorArriscado ? '<span class="chip alerta">fornecedor novo</span>' : ''}</header>
      <p class="ajuda">${insumo}. Sobe com a inflação (cerca de 0,4% ao mês) e com os reajustes do mercado.${S.contratoFornecedor ? ` Contrato até ${MESES[S.contratoFornecedor.ate % 12].toLowerCase()} do ano ${Math.floor(S.contratoFornecedor.ate / 12) + 1}: preço travado e compra mínima de ${num(S.contratoFornecedor.minimo)} ${seg.unidades} por mês (o que faltar paga 30% de multa). No fim, o custo volta ao preço de mercado de uma vez.` : ''}${S.fornecedorArriscado ? ' O fornecedor atual é mais barato, mas atrasa a entrega em cerca de 1 mês a cada 8.' : ''} Propostas de fornecedores chegam como acontecimentos.</p>
    </div>
    <div class="bloco"><header><h3>Equipamentos</h3><span class="chip ${S.equipNivel ? 'ok' : ''}">nível ${S.equipNivel} de ${NIVEL_MAX_EQUIP}</span></header>
      <p class="ajuda">Cada nível aumenta a produtividade em ${pct(seg.ganhoEquip)} e a qualidade em 3 pontos; do 6º em diante, a metade disso. O valor vai para o imobilizado e é depreciado em 10 anos.</p>
      ${S.equipNivel < NIVEL_MAX_EQUIP ? botaoCompra('equip', 'Comprar nível ' + (S.equipNivel + 1), custoEquip(S)) : '<p class="small muted">Nível máximo.</p>'}
    </div>
    <div class="bloco"><header><h3>Instalações</h3><span class="chip ${c.apertado ? 'alerta' : ''}">${c.total} de ${c.capEspaco} pessoas</span></header>
      <p class="ajuda">Aluguel atual: ${brl(aluguelMes(S))}/mês. Ampliar abre vaga para mais 10 pessoas e aumenta o aluguel em ${brl(seg.aluguel * 0.7 * indice(S))}. Gente demais no espaço derruba a produtividade em 15%.</p>
      ${S.espacoNivel < NIVEL_MAX_ESPACO ? botaoCompra('espaco', 'Ampliar', custoEspaco(S)) : '<p class="small muted">Tamanho máximo.</p>'}
    </div>
    <div class="bloco"><header><h3>Qualidade</h3><span class="chip">qualidade ${Math.round(S.Q)}</span></header>
      ${slider('qualidade', 'Investimento mensal em qualidade', S.dec.qualidade, 0, seg.qEscala * 3, 100, brl, 'Treinamento, controle e insumos melhores. Qualidade alta aumenta o preço que o cliente aceita pagar e a reputação; baixa gera reclamações.')}
    </div>
  </div>`;
}

/* ---- Comercial ---- */
function faixaPreco() {
  const seg = SEG(S), ref = S.precoRef, passo = seg.precoRef >= 100 ? 1 : 0.5;
  return { passo, min: Math.ceil(ref * 0.6 / passo) * passo, max: Math.floor(ref * 1.6 / passo) * passo };
}

function abaComercial() {
  const seg = SEG(S), c = capacidades(S, S.dec.func);
  const { passo, min, max } = faixaPreco();
  const porMargem = S.dec.modoPreco === 'margem';
  if (porMargem) S.dec.preco = precoPelaMargem(S);
  return `<div class="stack">
    <div class="bloco"><header><h3>Preço</h3><span class="chip">mercado: ${brl2(precoMercado(S))}</span></header>
      <div class="opcoes">
        <label class="opcao"><input type="radio" name="modoPreco" value="preco" ${!porMargem ? 'checked' : ''}><b>Definir o preço</b><span>Você escolhe o valor. Custos que sobem comem a margem até você reajustar.</span></label>
        <label class="opcao"><input type="radio" name="modoPreco" value="margem" ${porMargem ? 'checked' : ''}><b>Definir pela margem</b><span>Você escolhe a margem de contribuição; o preço é recalculado todo mês com o custo do dia.</span></label>
      </div>
      ${porMargem
        ? slider('margemAlvo', 'Margem de contribuição desejada', S.dec.margemAlvo, 0.05, 0.75, 0.01, v => pct(v), textoPreco())
        : slider('preco', `Preço por ${seg.unidade}`, clamp(S.dec.preco, min, max), min, max, passo, brl2, textoPreco())}
    </div>
    <div class="bloco" id="bloco-margem">${blocoMargem()}</div>
    <div class="bloco"><header><h3>Marketing</h3><span class="chip">reputação ${Math.round(S.A)}</span></header>
      ${slider('marketing', 'Verba mensal de marketing', S.dec.marketing, 0, seg.mkEscala * 4, 100, brl, 'A reputação sobe aos poucos, e cada real a mais rende menos que o anterior. Ela decide quanta gente conhece a marca e quanto aceita pagar. Cortar a verba faz a marca ser esquecida.')}
      ${S.concorrencia >= 0.01 ? `<p class="small ${S.concorrencia >= 0.15 ? 'war' : 'muted'}">Concorrentes levam ${pct(S.concorrencia)} da sua procura. Eles chegam atraídos pelo lucro e vão embora aos poucos.</p>` : ''}
    </div>
    <div class="bloco"><header><h3>${seg.setorCom}</h3><span class="chip">atendimento ${num(c.cobertura)} ${seg.unidades}/mês</span></header>
      ${linhaFunc('comercial', seg.setorCom, seg.cargoCom)}
      <p class="ajuda">Você mesmo atende cerca de ${num(seg.capDono)} ${seg.unidades} por mês. Cada ${seg.cargoCom} acrescenta uns ${num(seg.capVenda)}.</p>
    </div>
    <div class="bloco"><h3>Condição de pagamento</h3>
      <div class="opcoes">
        <label class="opcao"><input type="radio" name="prazo" value="0" ${!S.dec.prazo ? 'checked' : ''}><b>Só à vista</b><span>Dinheiro entra no mês da venda.</span></label>
        <label class="opcao"><input type="radio" name="prazo" value="1" ${S.dec.prazo ? 'checked' : ''}><b>Aceitar a prazo</b><span>+15% de procura, mas 60% da venda só entra no mês seguinte, e cliente a prazo às vezes não paga.</span></label>
      </div>
    </div>
    ${S.contratoCliente ? `<div class="bloco"><header><h3>Contrato com a rede</h3><span class="chip ok">ativo</span></header><p class="ajuda">${num(S.contratoCliente.qtd)} ${seg.unidades} por mês a ${brl2(S.contratoCliente.preco)}, atendidos antes dos clientes normais, até ${MESES[S.contratoCliente.ate % 12].toLowerCase()} do ano ${Math.floor(S.contratoCliente.ate / 12) + 1}. O que faltar paga 30% do preço de multa.</p></div>` : ''}
    <div class="bloco"><h3>Novos mercados</h3>
      ${seg.expansoes.map(e => S.expansoes.includes(e.id)
        ? `<div><b>${e.nome}</b> <span class="chip ok">ativo</span><p class="small muted">${e.desc}</p></div>`
        : `<div class="stack apertada"><div><b>${e.nome}</b><p class="small muted">${e.desc}</p></div>${botaoCompra('exp:' + e.id, 'Investir', e.custo)}</div>`).join('')}
    </div>
  </div>`;
}

function textoPreco() {
  const seg = SEG(S), p = S.dec.preco, justo = precoJusto(S);
  const procura = Math.pow(justo / p, seg.elasticidade);
  const prefixo = S.dec.modoPreco === 'margem' ? `Preço resultante: ${brl2(p)}. ` : '';
  return `${prefixo}Preço justo para a sua qualidade e reputação: ${brl2(justo)}. Com ${brl2(p)}, a procura fica em ${pct(procura)} da que você teria cobrando o justo.`;
}

// Margem de contribuicao e ponto de equilibrio com as decisoes atuais.
function blocoMargem() {
  const seg = SEG(S), p = S.dec.preco, aliq = aliqVendaEstimada(S);
  const insumo = custoInsumoUnit(S), trib = p * aliq, varia = p * DESPESA_VARIAVEL;
  const mc = margemContribuicao(S), fixos = custosFixos(S), pe = pontoEquilibrio(S);
  const dem = Math.round(demandaEsperada(S));
  return `<header><h3>Margem e ponto de equilíbrio</h3><span class="chip ${mc <= 0 ? 'alerta' : ''}">margem ${p > 0 ? pct(mc / p) : '—'}</span></header>
    <div class="tab-wrap"><table>
      <tr><td>Preço por ${seg.unidade}</td><td>${brl2(p)}</td></tr>
      <tr><td>(−) ${maiuscula(seg.insumo)}${seg.perecivel ? ', com a perda de estoque' : seg.tipo === 'comercio' && !seg.estocavel ? ', com 6% de desperdício' : ''}</td><td>${brl2(-insumo)}</td></tr>
      <tr><td>(−) Tributos sobre a venda (${pct(aliq, 1)}${S.hist.length ? ', do último mês' : ', estimado'})</td><td>${brl2(-trib)}</td></tr>
      <tr><td>(−) Despesas variáveis (energia, taxas de cartão: ${pct(DESPESA_VARIAVEL, 1)})</td><td>${brl2(-varia)}</td></tr>
      <tr class="total"><td>= Margem de contribuição</td><td class="${sinal(mc)}">${brl2(mc)}</td></tr>
      <tr><td>Custos fixos do mês (folha, aluguel, marketing, contador…)</td><td>${brl(fixos)}</td></tr>
      <tr class="total"><td>Ponto de equilíbrio</td><td>${Number.isFinite(pe) ? num(pe) + ' ' + seg.unidades : 'não há'}</td></tr>
      <tr class="sub"><td>Procura estimada para este mês</td><td>${num(dem)} ${seg.unidades}</td></tr>
    </table></div>
    <p class="ajuda">Margem de contribuição é o que cada venda deixa para pagar os custos fixos. Abaixo do ponto de equilíbrio, o mês fecha no vermelho; acima dele, cada venda a mais vira lucro.</p>`;
}

/* ---- Pessoas ---- */
function abaPessoas() {
  const seg = SEG(S), c = capacidades(S, S.dec.func);
  return `<div class="stack">
    <div class="bloco"><header><h3>Quadro de pessoal</h3><span class="chip">${c.total} pessoas · folha ${brl(folhaPrevista(S))}</span></header>
      ${linhaFunc('producao', seg.setorProd, seg.cargoProd)}
      ${linhaFunc('comercial', seg.setorCom, seg.cargoCom)}
      ${linhaFunc('adm', 'Administrativo', 'financeiro, RH e fiscal')}
      <p class="ajuda">Você cuida sozinho da parte administrativa de até 6 pessoas; cada administrativo dá conta de mais 12. Contratar custa meio salário; demitir custa 1,3 salário (aviso prévio e multa do FGTS) e derruba a moral.</p>
      ${c.desorg ? '<p class="small neg">A administração não dá conta: produtividade −10% e risco de multa.</p>' : ''}
    </div>
    <div class="bloco"><header><h3>Política salarial</h3><span class="chip">moral ${Math.round(S.M)}</span></header>
      <div class="opcoes">${Object.entries(POLITICA).map(([k, p]) => `<label class="opcao"><input type="radio" name="politica" value="${k}" ${S.dec.politica === k ? 'checked' : ''} ${politicaPermitida(S, k) ? '' : 'disabled'}><b>${p.nome}</b><span>salários × ${p.fator.toLocaleString('pt-BR')}</span></label>`).join('')}</div>
      <p class="ajuda">Moral alta aumenta a produtividade. Abaixo de 50, as pessoas começam a pedir demissão. ${S.mes > 0 ? 'Salário de quem já está na empresa não pode ser reduzido (CF, art. 7º, VI): a política só sobe. Para cortar folha, só demitindo, e isso custa 1,3 salário.' : 'Depois do primeiro mês, a política só pode subir: salário não se reduz.'}</p>
    </div>
    <div class="bloco"><h3>Encargos sobre a folha</h3>
      <p class="ajuda">FGTS e provisões de 13º e férias somam cerca de 30% em qualquer regime. Fora do Simples entram ainda INSS patronal, RAT e terceiros (≈ 33%) e 20% sobre o pró-labore. No Simples, essa contribuição já está dentro do DAS.</p>
    </div>
  </div>`;
}

/* ---- Financas ---- */
function abaFinancas() {
  const lim = limiteCredito(S), taxa = taxaCapitalGiro(S);
  const disp = lucroDisponivel(S);
  const maxDist = Math.floor(Math.max(0, Math.min(disp, S.caixa)) / 1000) * 1000;
  S.dec.emprestimo = clamp(S.dec.emprestimo || 0, 0, lim);
  S.dec.distribuir = clamp(S.dec.distribuir || 0, 0, maxDist);
  const imob = S.imobilizado - S.deprecAcum;
  return `<div class="stack">
    <div class="bloco"><h3>Balanço patrimonial</h3>
      <div class="tab-wrap"><table>
        <tr><th>Ativo</th><th></th></tr>
        <tr><td>Caixa</td><td class="${sinal(S.caixa)}">${brl(S.caixa)}</td></tr>
        <tr><td>Contas a receber</td><td>${brl(totalReceber(S))}</td></tr>
        <tr><td>Estoque</td><td>${brl(S.valorEstoque)}</td></tr>
        <tr><td>Imobilizado (líquido de depreciação)</td><td>${brl(imob)}</td></tr>
        <tr><th>Passivo</th><th></th></tr>
        <tr><td>Empréstimos</td><td>${brl(dividaTotal(S))}</td></tr>
        <tr class="total"><td>Patrimônio líquido</td><td class="${sinal(patrimonio(S))}">${brl(patrimonio(S))}</td></tr>
      </table></div>
    </div>
    <div class="bloco"><header><h3>Empréstimos</h3><span class="chip">Selic ${pct(S.selic, 2)} a.a.</span></header>
      ${S.emprestimos.length ? `<div class="tab-wrap"><table><tr><th>Linha</th><th>Saldo</th><th>Juros</th><th>Parcela</th><th></th></tr>
        ${S.emprestimos.map((e, i) => `<tr><td>${e.nome}</td><td>${brl(e.saldo)}</td><td>${pct(e.taxa, 2)} a.m.${e.posFixado ? ' <span class="chip">pós</span>' : ''}</td><td>${brl(e.amort + e.saldo * e.taxa)}</td>
          <td><button class="btn" data-acao="quitar" data-i="${i}" ${S.caixa < e.saldo ? 'disabled' : ''}>Quitar</button></td></tr>`).join('')}</table></div>`
        : '<p class="small muted">Nenhum empréstimo.</p>'}
      <p class="small muted">Limite disponível: ${brl(lim)}.</p>
      ${lim >= 5000 ? `${slider('emprestimo', `Capital de giro (${pct(taxa, 2)} ao mês prefixado, 24 meses)`, S.dec.emprestimo, 0, lim, 1000, brl)}
        <div class="row"><button class="btn prim" data-acao="emprestar" ${S.dec.emprestimo < 1000 ? 'disabled' : ''}>Contratar ${brl(S.dec.emprestimo)}</button></div>`
        : '<p class="small muted">Sem limite de crédito no momento.</p>'}
      <p class="ajuda">O capital de giro é prefixado: a taxa do dia da contratação (Selic + spread do banco) vale até o fim. O Pronampe é pós-fixado (Selic + 6% ao ano): a parcela de juros muda quando o Copom mexe na Selic. Se o caixa fechar o mês negativo, o banco cobre com cheque especial a 8% ao mês. Limite do cheque especial: ${brl(limiteCheque(S))}.</p>
    </div>
    <div class="bloco"><header><h3>Seguro empresarial</h3>${S.dec.seguro ? '<span class="chip ok">ativo</span>' : ''}</header>
      <div class="opcoes">
        <label class="opcao"><input type="radio" name="seguro" value="0" ${!S.dec.seguro ? 'checked' : ''}><b>Sem seguro</b><span>Enchente e quebra de equipamento saem inteiras do caixa.</span></label>
        <label class="opcao"><input type="radio" name="seguro" value="1" ${S.dec.seguro ? 'checked' : ''}><b>Com seguro (${brl(premioSeguro(S))}/mês)</b><span>Cobre 80% de enchente e quebra de equipamento. O prêmio acompanha o valor do imobilizado e do estoque.</span></label>
      </div>
    </div>
    <div class="bloco"><h3>Remuneração do sócio</h3>
      ${slider('proLabore', 'Pró-labore mensal', S.dec.proLabore, 1600, 30000, 100, brl, textoProLabore())}
      <div class="campo"><p><b>Distribuir lucros</b> <span class="small muted">· lucro acumulado disponível: ${brl(disp)}</span></p>
        ${maxDist >= 1000 ? `${slider('distribuir', 'Valor a distribuir', S.dec.distribuir, 0, maxDist, 1000, brl, textoDistribuir())}
          <div class="row"><button class="btn" data-acao="distribuir" ${S.dec.distribuir < 1000 ? 'disabled' : ''}>Distribuir ${brl(S.dec.distribuir)}</button></div>`
          : '<p class="small muted">Só é possível distribuir lucro que já existe e cabe no caixa.</p>'}
      </div>
      <div class="kpis">${kpi('Pró-labore recebido', brl(S.proLaboreAcum))}${kpi('Lucros recebidos', brl(S.retirado))}${kpi('Sua parte', pct(S.participacao))}${kpi('Valor da empresa', brlK(valorEmpresa(S)))}</div>
    </div>
  </div>`;
}

function textoProLabore() {
  const b = S.dec.proLabore;
  return `Líquido para você: cerca de ${brl(liquidoProLabore(b))} (INSS de 11% até o teto de ${brl2(TETO_INSS)} e IR na fonte pela tabela; até R$ 5 mil o IR é zero). Fora do Simples a empresa paga ainda 20% de INSS sobre ele. Entra no Fator R do Simples.`;
}

function textoDistribuir() {
  const v = S.dec.distribuir || 0, ret = irrfDaDistribuicao(S, v);
  const parte = S.participacao < 1 ? ` Você recebe ${pct(S.participacao)}; o resto vai para o investidor.` : '';
  const ja = S.distribuidoMes ? ` Já distribuído neste mês: ${brl(S.distribuidoMes)}.` : '';
  return `Retenção prevista: ${brl(ret)}.${ja} Acima de ${brl(LIMITE_ISENCAO_DIVIDENDOS)} no mês para a mesma pessoa, a empresa retém 10% sobre tudo o que foi pago no mês (Lei 15.270/2025). É antecipação: no ajuste anual, quem tem renda abaixo de R$ 600 mil no ano recebe de volta.${parte}`;
}

/* ---- Impostos ---- */
function abaImpostos() {
  const seg = SEG(S), h = S.hist.at(-1), janeiro = podeTrocarRegime(S);
  const anoAtual = h ? Math.floor(h.mes / 12) : 0;
  const { tot, melhor } = comparativoDoAno(S, anoAtual);
  const descr = {
    simples: seg.anexoFixo
      ? `Guia única (DAS), Anexo ${seg.anexoFixo}: serviços contábeis ficam nele sem depender do Fator R.`
      : seg.tipo === 'servico' ? 'Guia única (DAS). Anexo III ou V conforme o Fator R.' : `Guia única (DAS), Anexo ${seg.tipo === 'comercio' ? 'I' : 'II'}. Limite de R$ 4,8 mi por ano.`,
    presumido: `IRPJ e CSLL sobre uma margem presumida de ${seg.tipo === 'servico' ? '32%' : '8% e 12%'}. PIS/COFINS cumulativos.`,
    real: seg.pisCofinsCumulativo
      ? 'IRPJ e CSLL sobre o lucro de verdade. Desenvolvimento de software fica no PIS/COFINS cumulativo (3,65%) mesmo no Real. Contabilidade mais cara.'
      : 'IRPJ e CSLL sobre o lucro de verdade. PIS/COFINS não cumulativos, com créditos. Contabilidade mais cara.',
  };
  return `<div class="stack">
    <div class="bloco"><header><h3>Regime tributário</h3>${janeiro ? '<span class="chip ok">janeiro: pode trocar</span>' : '<span class="chip">troca só em janeiro</span>'}</header>
      <div class="opcoes">${REGIMES.map(r => {
        const bloqueado = !janeiro || (r === 'simples' && S.excluidoSimples);
        return `<label class="opcao"><input type="radio" name="regime" value="${r}" ${S.regime === r ? 'checked' : ''} ${bloqueado ? 'disabled' : ''}>
          <b>${NOME_REGIME[r]}</b><span>${descr[r]} Contador: ${brl(HONORARIOS[r] * indice(S))}/mês.</span></label>`;
      }).join('')}</div>
      ${S.excluidoSimples ? '<p class="small war">A receita do ano passou do limite de R$ 4,8 milhões: o Simples fica fechado até um janeiro depois de um ano dentro do limite.</p>' : ''}
    </div>
    ${h ? `<div class="bloco"><header><h3>Tributos de ${MESES[h.mes % 12].toLowerCase()}</h3><span class="chip">${NOME_REGIME[h.regime]}</span></header>
      <div class="tab-wrap"><table>
        ${h.det.map(d => `<tr><td>${d.nome}</td><td>${brl(d.valor)}</td></tr>`).join('')}
        <tr class="total"><td>Total</td><td>${brl(h.tributos)}</td></tr>
        <tr class="sub"><td>Sobre a receita de ${brl(h.receita)}</td><td>${h.receita ? pct(h.tributos / h.receita, 1) : '—'}</td></tr>
      </table></div>
      <div class="kpis">${kpi('RBT12', brlK(h.rbt12))}${kpi('Fator R', pct(h.fatorR))}${kpi('Anexo', h.anexo || '—')}${kpi('Prejuízo fiscal a compensar', brl(S.prejuizoFiscal || 0))}</div>
      <p class="ajuda">RBT12 é a receita dos 12 meses anteriores e define a faixa (alíquota) do Simples. No 1º mês usa-se a receita do próprio mês × 12; do 2º ao 12º, a média dos meses anteriores × 12. O limite de R$ 4,8 milhões e o sublimite de R$ 3,6 milhões se medem pela receita do ano (janeiro a dezembro), que até agora soma ${brlK(soma(S.hist.filter(x => Math.floor(x.mes / 12) === anoAtual), x => x.receita))}.</p>
      ${seg.tipo === 'servico' && !seg.anexoFixo ? '<p class="ajuda">Fator R = salários, 13º, férias, FGTS e pró-labore dos 12 meses anteriores ÷ RBT12. Com 28% ou mais, o serviço vai para o Anexo III; abaixo, para o Anexo V.</p>' : ''}
      <p class="ajuda">Prejuízo fiscal só nasce em meses apurados no Lucro Real e compensa até 30% do lucro de cada mês seguinte. O prejuízo que o comparativo simula para o Real, com a empresa em outro regime, não é compensável.</p>
    </div>
    <div class="bloco"><header><h3>Comparativo do ano ${anoAtual + 1}</h3><span class="chip ouro">mesma operação, três regimes</span></header>
      <div class="tab-wrap"><table>
        <tr><th>Regime</th><th>Tributos no ano</th><th>vs. atual</th></tr>
        ${REGIMES.map(r => `<tr class="${r === melhor ? 'destaque' : ''}"><td>${NOME_REGIME[r]}${r === S.regime ? ' <span class="chip">atual</span>' : ''}${r === melhor ? ' <span class="chip ok">menor</span>' : ''}</td>
          <td>${tot[r] === null ? 'não se aplica' : brl(tot[r])}</td><td>${tot[r] === null || tot[S.regime] === null || r === S.regime ? '—' : `<span class="${tot[r] < tot[S.regime] ? 'pos' : 'neg'}">${brl(tot[r] - tot[S.regime])}</span>`}</td></tr>`).join('')}
      </table></div>
      <p class="ajuda">Inclui a contribuição patronal sobre a folha, que muda de um regime para outro. Não inclui a diferença de honorários do contador. Todo janeiro o jogo abre a decisão do regime com este comparativo, já somando os honorários.</p>
    </div>` : '<div class="bloco"><p class="ajuda">Feche o primeiro mês para ver os tributos apurados e o comparativo entre regimes.</p></div>'}
    <div class="bloco"><h3>Regras do jogo</h3><p class="ajuda">Alíquotas do Simples pelas tabelas da LC 123/2006 (Anexos I, II, III e V). Se a receita do ano passar do sublimite de R$ 3,6 milhões, ICMS e ISS saem do DAS e passam a ser pagos por fora: no ano seguinte, ou já no mês seguinte se passar de R$ 4,32 milhões. Na 6ª faixa (RBT12 acima de R$ 3,6 mi), enquanto a empresa não está impedida, ICMS e ISS seguem no DAS calculados pela 5ª faixa. Acima do limite de R$ 4,8 milhões no ano a empresa sai do Simples em janeiro, ou no mês seguinte se passar de R$ 5,76 milhões. PIS/COFINS da indústria sem o ICMS na base (Tema 69 do STF). ICMS, ISS e IRPJ/CSLL simplificados: apuração mensal, sem substituição tributária e sem IPI. A transição para IBS e CBS da reforma tributária ainda não está no jogo.</p></div>
  </div>`;
}

/* ---- Relatorios ---- */
function abaRelatorios() {
  const h = S.hist.at(-1);
  if (!h) return '<div class="bloco"><p class="ajuda">Os relatórios aparecem depois do primeiro mês fechado.</p></div>';
  const anoAtual = Math.floor(h.mes / 12);
  const ano = S.hist.filter(x => Math.floor(x.mes / 12) === anoAtual);
  const linha = (nome, f, cls = '', neg = true) => {
    const a = f(h), b = soma(ano, f);
    const fmt = v => (neg && v ? brl(-v) : brl(v));
    return `<tr class="${cls}"><td>${nome}</td><td>${fmt(a)}</td><td>${fmt(b)}</td></tr>`;
  };
  const am = anoMes(h.mes);
  return `<div class="stack">
    <div class="bloco"><h3>Demonstração do resultado</h3>
      <div class="tab-wrap"><table>
        <tr><th></th><th>${am.mes.slice(0, 3)}/${am.ano}</th><th>Ano ${anoAtual + 1}</th></tr>
        ${linha('Receita bruta de vendas', x => x.receita, '', false)}
        ${linha('(−) Tributos sobre vendas', x => x.tribVenda)}
        ${linha('= Receita líquida', x => x.receita - x.tribVenda, 'total', false)}
        ${linha(SEG(S).estocavel ? '(−) Custo dos produtos vendidos' : SEG(S).tipo === 'servico' ? '(−) Custo direto dos serviços' : '(−) Custo das mercadorias vendidas', x => x.cmv)}
        ${linha('= Lucro bruto', x => x.receita - x.tribVenda - x.cmv, 'total', false)}
        ${linha('(−) Salários', x => x.folha)}
        ${linha('(−) Encargos sobre a folha', x => x.encargos)}
        ${linha('(−) Pró-labore', x => x.proLabore)}
        ${linha('(−) Aluguel', x => x.aluguel)}
        ${linha('(−) Marketing', x => x.marketing)}
        ${linha('(−) Qualidade', x => x.qualidade)}
        ${linha('(−) Contabilidade', x => x.contador)}
        ${linha('(−) Seguro', x => x.seguro || 0)}
        ${linha('(−) Perdas com clientes', x => x.perdas || 0)}
        ${linha('(−) Outras despesas', x => x.despesas - x.aluguel - x.marketing - x.qualidade - x.contador - (x.seguro || 0) - (x.perdas || 0))}
        ${linha('(−) Depreciação', x => x.depreciacao)}
        ${linha('(−) Juros', x => x.juros)}
        ${linha('= Lucro antes do IR', x => x.lucroAntesIR, 'total', false)}
        ${linha('(−) IRPJ e CSLL', x => x.irpj)}
        ${linha('= Lucro líquido', x => x.lucro, 'total', false)}
      </table></div>
    </div>
    <div class="bloco"><h3>Fluxo de caixa de ${am.mes.toLowerCase()}</h3>
      <div class="tab-wrap"><table>
        <tr><td>Caixa no início do mês</td><td class="${sinal(iniDFC(h))}">${brl(iniDFC(h))}</td></tr>
        <tr><td>Recebimentos de clientes</td><td class="pos">${brl(h.entradas)}</td></tr>
        <tr><td>Pagamentos da operação, tributos e juros</td><td class="neg">${brl(-(h.saidas - h.amort))}</td></tr>
        <tr><td>Amortização de empréstimos</td><td>${brl(-h.amort - h.quitado)}</td></tr>
        <tr><td>Investimentos</td><td>${brl(-h.investido)}</td></tr>
        <tr><td>Empréstimos e aportes recebidos</td><td>${brl(h.captado)}</td></tr>
        <tr><td>Lucros distribuídos</td><td>${brl(-h.distribuido)}</td></tr>
        <tr class="total"><td>Caixa no fim do mês</td><td class="${sinal(h.caixa)}">${brl(h.caixa)}</td></tr>
      </table></div>
      ${h.financiado ? `<p class="ajuda">Equipamento financiado direto ao fornecedor: ${brl(h.financiado)}. Não passou pelo caixa: entrou no imobilizado e na dívida ao mesmo tempo.</p>` : ''}
      <p class="ajuda">Lucro e caixa são coisas diferentes: venda a prazo vira lucro hoje e dinheiro depois; equipamento sai do caixa hoje e vira despesa aos poucos, pela depreciação.${SEG(S).estocavel ? ' Na confecção, o salário da fábrica entra no custo de cada peça e só vai para o resultado quando ela é vendida (custeio por absorção): a folha sai do caixa no mês, mas parte dela fica no estoque.' : ''}</p>
    </div>
    <div class="bloco"><h3>Histórico</h3>
      <div class="tab-wrap"><table>
        <tr><th>Mês</th><th>Vendas</th><th>Receita</th><th>Lucro</th><th>Caixa</th></tr>
        ${S.hist.slice(-12).reverse().map(x => { const a = anoMes(x.mes); return `<tr><td>${a.mm}/${a.ano}</td><td>${num(x.vendidos)}</td><td>${brl(x.receita)}</td><td class="${sinal(x.lucro)}">${brl(x.lucro)}</td><td class="${sinal(x.caixa)}">${brl(x.caixa)}</td></tr>`; }).join('')}
      </table></div>
    </div>
  </div>`;
}

// Jogos salvos antes da linha de caixa inicial: reconstroi pelo proprio mes.
function iniDFC(h) {
  return h.caixaIni ?? h.caixa - (h.entradas - h.saidas - h.quitado - h.investido + h.captado - h.distribuido);
}

/* ---- abertura ---- */
function telaAbertura() {
  const seg = SEGMENTOS[setup.segmento];
  const inicial = setup.capital - seg.setup + setup.emprestimo;
  const fixo = custoFixoInicial(), folego = inicial / fixo;
  return `<div class="stack abertura">
    <div class="topo"><div><p class="rot">Jogo de gestão</p><h1>Negócio Próprio</h1></div><div class="carimbo">Abertura<b>CNPJ novo</b></div></div>
    <p class="lead">Abra uma empresa, decida preço, equipe, produção, marketing, crédito e regime tributário, e veja o resultado no DRE e no caixa a cada mês. São ${DURACAO} meses para fazer o negócio dar certo, ou quebrar tentando.</p>
    <div class="bloco"><label for="nome-empresa"><b>Nome da empresa</b></label>
      <input type="text" id="nome-empresa" maxlength="40" value="${esc(setup.nome)}" autocomplete="off"></div>
    <div class="bloco"><h3>Ramo</h3><div class="opcoes">
      ${Object.entries(SEGMENTOS).map(([k, s]) => `<label class="opcao"><input type="radio" name="segmento" value="${k}" ${setup.segmento === k ? 'checked' : ''}><b>${s.nome}</b><span>${s.desc} Investimento inicial: ${brl(s.setup)}.</span></label>`).join('')}
    </div></div>
    <div class="bloco"><h3>Capital próprio</h3><div class="opcoes">
      ${[[80000, 'Difícil'], [150000, 'Normal'], [300000, 'Folgado']].map(([v, r]) => `<label class="opcao"><input type="radio" name="capital" value="${v}" ${setup.capital === v ? 'checked' : ''}><b>${brl(v)}</b><span>${r}</span></label>`).join('')}
    </div></div>
    <div class="bloco"><h3>Empréstimo inicial (Pronampe)</h3><div class="opcoes">
      ${[[0, 'Sem dívida'], [50000, 'Selic + 6% ao ano (pós-fixado), 36 parcelas'], [100000, 'Selic + 6% ao ano (pós-fixado), 36 parcelas']].map(([v, r]) => `<label class="opcao"><input type="radio" name="emprestimo" value="${v}" ${setup.emprestimo === v ? 'checked' : ''}><b>${v ? brl(v) : 'Nenhum'}</b><span>${r}</span></label>`).join('')}
    </div></div>
    <div class="bloco"><h3>Regime tributário do primeiro ano</h3><div class="opcoes">
      ${REGIMES.map(r => `<label class="opcao"><input type="radio" name="regime" value="${r}" ${setup.regime === r ? 'checked' : ''}><b>${NOME_REGIME[r]}</b><span>Contador: ${brl(HONORARIOS[r])}/mês</span></label>`).join('')}
    </div><p class="ajuda">Dá para trocar todo mês de janeiro. A aba Impostos mostra quanto você pagaria em cada regime.</p></div>
    <div class="bloco"><div class="row between"><div><span class="rot">Caixa inicial</span><div class="grande ${inicial < 0 ? 'neg' : ''}">${brl(inicial)}</div></div>
      <button class="fechar" data-acao="iniciar" ${folego < 1 ? 'disabled' : ''}>Abrir a empresa →</button></div>
      <p class="small ${folego < 1 ? 'neg' : 'muted'}">Custos fixos do primeiro mês: cerca de ${brl(fixo)}. ${folego < 1 ? 'O caixa não paga nem um mês: escolha mais capital ou um empréstimo.' : `O caixa cobre ${folego.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mês(es) sem vender nada.`}</p></div>
  </div>`;
}

// Quanto o caixa cai no primeiro mes sem nenhuma venda, pelo proprio motor: entram folha, encargos,
// CPP fora do Simples, honorarios do regime escolhido e a parcela e os juros do Pronampe.
function custoFixoInicial() {
  const s = novoJogo({ ...setup });
  s.mercadoMult = 0;
  const antes = s.caixa;
  fecharMes(s, () => 0.5);
  return antes - s.caixa;
}

/* ---- modal ---- */
function renderModal() {
  if (veu) { veu.remove(); veu = null; }
  if (!modal) return;
  veu = document.createElement('div');
  veu.className = 'veu';
  veu.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${conteudoModal()}</div>`;
  document.body.appendChild(veu);
  const b = veu.querySelector('button');
  if (b) b.focus();
}

function conteudoModal() {
  if (modal.tipo === 'resultado') {
    const h = modal.reg, am = anoMes(h.mes);
    return `<p class="rot">Fechamento de ${am.mes.toLowerCase()} · ano ${am.ano}</p>
      <h2>${h.lucro >= 0 ? 'Mês no azul' : 'Mês no vermelho'}</h2>
      <div class="kpis">${kpi('Receita', brl(h.receita))}${kpi('Lucro', brl(h.lucro), sinal(h.lucro))}${kpi('Vendidas', num(h.vendidos))}${kpi('Caixa', brl(h.caixa), sinal(h.caixa))}</div>
      ${listaNoticias(h.noticias)}
      <button class="btn prim" data-acao="ok-resultado">${S.evento ? 'Continuar' : 'Decidir ' + MESES[S.mes % 12].toLowerCase()}</button>`;
  }
  if (modal.tipo === 'evento') {
    const e = S.evento;
    const rot = e.id === 'regime' ? 'Decisão de janeiro' : e.crise ? 'Crise' : 'Acontecimento';
    return `<p class="rot">${rot}</p><h2>${e.titulo}</h2><div class="texto-evento">${e.texto}</div>
      <div class="stack apertada">${e.opcoes.map((o, i) => `<button class="btn ${i === 0 ? 'prim' : ''}" data-acao="evento" data-i="${i}">${o}</button>`).join('')}</div>`;
  }
  if (modal.tipo === 'aviso') {
    return `<h2>${modal.titulo}</h2><p>${modal.texto}</p><button class="btn prim" data-acao="ok-aviso">Ok</button>`;
  }
  if (modal.tipo === 'fim') {
    const quebrou = S.fim === 'falencia';
    const rq = riquezaDono(S), mult = multiploNota(S);
    const tributos = soma(S.hist, x => x.tributos);
    return `<p class="rot">${quebrou ? 'Fim de jogo' : `Fim do ano ${DURACAO / 12}`}</p>
      <h2>${quebrou ? `${esc(S.nome)} fechou as portas` : `${esc(S.nome)} chegou ao fim do ano ${DURACAO / 12}`}</h2>
      <p>${quebrou ? `O caixa ficou negativo além do que o banco aceitava. A empresa durou ${S.mes} meses.` : `Você colocou ${brl(S.capitalInicial)} no negócio e saiu com ${brl(rq)}, somando pró-labore líquido, lucros recebidos e a sua parte no valor da empresa: ganho de ${brl(rq - S.capitalInicial)}.`}</p>
      <div class="row"><span class="carimbo nota">Nota<b>${notaFinal(S)}</b></span>
        <div class="small muted">${quebrou ? '' : `${fmtMultiplo(mult)} (1 + ganho ÷ ${brl(CAPITAL_REFERENCIA)}; ${REGUA})`}</div></div>
      <div class="kpis">${kpi('Receita total', brlK(soma(S.hist, x => x.receita)))}${kpi('Lucro acumulado', brlK(S.lucroAcum), sinal(S.lucroAcum))}${kpi('Tributos pagos', brlK(tributos))}${kpi('Empregos', S.func.producao + S.func.comercial + S.func.adm)}</div>
      <div class="stack apertada">
        ${quebrou ? '' : '<button class="btn prim" data-acao="continuar">Continuar jogando</button>'}
        <button class="btn ${quebrou ? 'prim' : ''}" data-acao="novo">Começar outra empresa</button></div>`;
  }
  if (modal.tipo === 'reiniciar') {
    return `<h2>Começar outra empresa?</h2><p>O jogo atual será apagado deste aparelho.</p>
      <div class="row"><button class="btn perigo" data-acao="novo">Apagar e começar</button><button class="btn" data-acao="fechar-modal">Voltar</button></div>`;
  }
  return '';
}

function posFechamento() {
  if (S.evento) modal = { tipo: 'evento' };
  else if (jogoEncerrado(S)) modal = { tipo: 'fim' };
  else modal = null;
}

function aviso(titulo, texto) { modal = { tipo: 'aviso', titulo, texto }; }

/* ---- eventos de interface ---- */
function fmtCampo(campo, v) {
  if (campo === 'preco') return brl2(v);
  if (campo === 'margemAlvo') return pct(v);
  if (campo === 'producao') return num(v) + ' ' + SEG(S).unidades;
  return brl(v);
}

function aoDigitar(ev) {
  const t = ev.target;
  if (t.id === 'nome-empresa') { setup.nome = t.value; return; }
  if (!S || !t.dataset.campo) return;
  const campo = t.dataset.campo;
  let v = parseFloat(t.value);
  if (campo === 'proLabore') v = Math.max(SALARIO_MINIMO, v);
  S.dec[campo] = campo === 'producao' ? Math.round(v) : v;
  if (campo === 'margemAlvo') S.dec.preco = precoPelaMargem(S);
  const out = app.querySelector(`[data-ver="${campo}"]`);
  if (out) out.textContent = fmtCampo(campo, v);
  const bm = document.getElementById('bloco-margem');
  if (bm && ['preco', 'margemAlvo', 'marketing'].includes(campo)) bm.innerHTML = blocoMargem();
  const ajudas = { preco: textoPreco, margemAlvo: textoPreco, proLabore: textoProLabore, distribuir: textoDistribuir };
  if (ajudas[campo]) {
    const a = app.querySelector(`[data-ajuda="${campo}"]`);
    if (a) a.textContent = ajudas[campo]();
  }
  const p = document.getElementById('previsao');
  if (p) p.innerHTML = textoPrevisao();
  const alvo = { emprestimo: ['emprestar', 'Contratar '], distribuir: ['distribuir', 'Distribuir '] }[campo];
  if (alvo) {
    const btn = app.querySelector(`[data-acao="${alvo[0]}"]`);
    if (btn) { btn.textContent = alvo[1] + brl(v); btn.disabled = v < 1000; }
  }
}

function aoMudar(ev) {
  const t = ev.target;
  // o slider grava quando o dedo solta (change), e nao a cada passo do arraste (input)
  if (S && t.type === 'range') { salvar(); return; }
  if (t.type !== 'radio') return;
  if (!S) {
    setup[t.name] = ['capital', 'emprestimo'].includes(t.name) ? +t.value : t.value;
    render();
    return;
  }
  if (t.name === 'prazo') S.dec.prazo = t.value === '1';
  if (t.name === 'producaoAuto') S.dec.producaoAuto = t.value === '1';
  if (t.name === 'politica') S.dec.politica = t.value;
  if (t.name === 'modoPreco') {
    S.dec.modoPreco = t.value;
    // ao ligar a margem, parte da margem do preco atual
    if (t.value === 'margem' && S.dec.preco > 0) S.dec.margemAlvo = clamp(Math.round(margemContribuicao(S) / S.dec.preco * 100) / 100, 0.05, 0.75);
  }
  if (t.name === 'seguro') S.dec.seguro = t.value === '1';
  if (t.name === 'regime') trocarRegime(S, t.value);
  salvar();
  render();
}

function aoClicar(ev) {
  const b = ev.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.aba) {
    aba = b.dataset.aba;
    pendente = null;
    salvar();
    render();
    window.scrollTo({ top: 0 });
    return;
  }
  const st = b.closest('.stepper');
  if (st && b.dataset.passo) {
    const setor = st.dataset.setor;
    S.dec.func[setor] = clamp(S.dec.func[setor] + +b.dataset.passo, setor === 'producao' ? 1 : 0, 99);
    if (SEG(S).estocavel && setor === 'producao') S.dec.producao = Math.min(S.dec.producao, capacidades(S, S.dec.func).capacidade);
    salvar();
    render();
    return;
  }
  const acao = b.dataset.acao;
  if (!acao) return;
  const fim = () => { salvar(); render(); };
  switch (acao) {
    case 'iniciar': {
      const nome = (setup.nome || '').trim() || 'Minha Empresa';
      S = novoJogo({ ...setup, nome });
      aba = 'painel';
      return fim();
    }
    case 'fechar': {
      pendente = null;
      modal = { tipo: 'resultado', reg: fecharMes(S) };
      return fim();
    }
    case 'ok-resultado': posFechamento(); return render();
    case 'evento': {
      const r = resolverEvento(S, +b.dataset.i);
      if (r) aviso(r.titulo, r.msg);
      return fim();
    }
    case 'ok-aviso':
    case 'fechar-modal':
      modal = S && jogoEncerrado(S) ? { tipo: 'fim' } : null;
      return render();
    case 'continuar': S.modoLivre = true; modal = null; return fim();
    case 'novo':
      S = null; modal = null; pendente = null; aba = 'painel';
      apagarJogo();
      return render();
    case 'reiniciar': modal = { tipo: 'reiniciar' }; return render();
    case 'comprar': pendente = b.dataset.id; return render();
    case 'cancelar': pendente = null; return render();
    case 'confirmar': {
      const r = comprar(S, b.dataset.id);
      pendente = null;
      if (!r.ok) aviso('Não foi possível', r.msg);
      return fim();
    }
    case 'emprestar': {
      const r = contratarEmprestimo(S, S.dec.emprestimo);
      if (r.ok) S.dec.emprestimo = 0;
      else aviso('Empréstimo recusado', r.msg);
      return fim();
    }
    case 'quitar': {
      const r = quitarEmprestimo(S, +b.dataset.i);
      if (!r.ok) aviso('Não foi possível', r.msg);
      return fim();
    }
    case 'distribuir': {
      const r = distribuirLucros(S, S.dec.distribuir);
      if (r.ok) {
        S.dec.distribuir = 0;
        const inv = r.investidor > 0 ? ` ${brl(r.investidor)} foram para o investidor (${pct(1 - S.participacao)} da empresa).` : '';
        const texto = r.liquido < 0
          ? `Com esta parcela, o que você recebeu no mês passou de ${brl(LIMITE_ISENCAO_DIVIDENDOS)}, e a retenção de 10% passou a valer sobre o total do mês: ${brl(r.irrf)} a mais. Esta parcela não cobriu a retenção.`
          : `${brl(r.liquido)} foram para você${r.irrf ? ` (retenção de ${brl(r.irrf)} de IR, que volta no ajuste anual se sua renda do ano ficar abaixo de R$ 600 mil)` : ', sem imposto'}.`;
        aviso('Lucros distribuídos', texto + inv);
      } else aviso('Não foi possível', r.msg);
      return fim();
    }
  }
}

// Botao "voltar" do Android: fecha o que estiver aberto antes de sair do app.
// Devolve true quando tratou o gesto.
export function voltar() {
  if (modal) {
    // acontecimento e fim de jogo estao salvos e voltam ao reabrir: o voltar pode sair do app
    if (modal.tipo === 'evento' || modal.tipo === 'fim') return false;
    if (modal.tipo === 'resultado') posFechamento();
    else modal = S && jogoEncerrado(S) ? { tipo: 'fim' } : null;
    render();
    return true;
  }
  if (pendente) { pendente = null; render(); return true; }
  if (S && aba !== 'painel') { aba = 'painel'; salvar(); render(); return true; }
  return false;
}

export async function iniciarApp(raiz) {
  app = raiz;
  document.addEventListener('input', aoDigitar);
  document.addEventListener('change', aoMudar);
  document.addEventListener('click', aoClicar);
  const salvo = await carregarJogo();
  if (salvo && salvo.S) {
    S = migrarEstado(salvo.S);
    aba = ABAS.includes(salvo.aba) ? salvo.aba : 'painel';
  }
  if (S && jogoEncerrado(S)) modal = { tipo: 'fim' };
  else if (S && S.evento) modal = { tipo: 'evento' };
  render();
}
