import { novoJogo, fecharMes, resolverEvento, capacidades, demandaEsperada, SEG } from '../src/engine/index.js';

// Gerador pseudoaleatorio com semente (Park-Miller): os testes repetem a mesma partida.
export function semente(n = 1) {
  let x = n;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

// Estrategias simples de jogador, usadas nos testes e no script de balanceamento.
export const ESTRATEGIAS = {
  parada: () => {},
  ativa: s => {
    const h = s.hist.at(-1), seg = SEG(s);
    if (h) {
      if (h.faltaAtend > h.demanda * 0.1) s.dec.func.comercial++;
      if (h.faltaProduto > h.demanda * 0.1) s.dec.func.producao++;
      if (capacidades(s, s.dec.func).desorg) s.dec.func.adm++;
    }
    s.dec.marketing = seg.mkEscala;
    if (seg.estocavel) s.dec.producao = Math.min(capacidades(s, s.dec.func).capacidade, Math.round(demandaEsperada(s) * 1.1));
  },
  caotica: (s, rnd) => {
    const seg = SEG(s);
    s.dec.preco = seg.precoRef * (0.6 + rnd());
    s.dec.marketing = Math.round(rnd() * seg.mkEscala * 4);
    s.dec.qualidade = Math.round(rnd() * seg.qEscala * 3);
    s.dec.prazo = rnd() < 0.5;
    s.dec.politica = ['abaixo', 'mercado', 'acima'][Math.floor(rnd() * 3)];
    for (const k of ['producao', 'comercial', 'adm']) {
      s.dec.func[k] = Math.max(k === 'producao' ? 1 : 0, s.dec.func[k] + Math.floor(rnd() * 3) - 1);
    }
    s.dec.producao = Math.round(rnd() * capacidades(s, s.dec.func).capacidade);
  },
};

// Joga uma partida inteira. `aoFechar(s, reg, antes)` recebe cada mes com o estado de antes.
export function jogar({ segmento = 'hamburgueria', regime = 'simples', capital = 150000, emprestimo = 0,
  estrategia = 'ativa', meses = 36, seed = 1, resolver = true, aoFechar } = {}) {
  const rnd = semente(seed);
  const s = novoJogo({ nome: 'Teste', segmento, capital, emprestimo, regime });
  for (let m = 0; m < meses && !s.fim; m++) {
    ESTRATEGIAS[estrategia](s, rnd);
    const antes = structuredClone(s);
    const reg = fecharMes(s, rnd);
    if (aoFechar) aoFechar(s, reg, antes);
    if (s.evento && resolver) resolverEvento(s, Math.floor(rnd() * s.evento.opcoes.length), rnd);
  }
  return s;
}
