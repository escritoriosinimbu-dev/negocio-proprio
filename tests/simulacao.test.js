import { describe, it, expect } from 'vitest';
import {
  novoJogo, fecharMes, patrimonio, comparativoDoAno, trocarRegime, SEGMENTOS, REGIMES, DURACAO,
} from '../src/engine/index.js';
import { jogar, semente, ESTRATEGIAS } from './ajuda.js';

const SEGS = Object.keys(SEGMENTOS);

function numerosFinitos(obj, caminho = '') {
  const ruins = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && !Number.isFinite(v)) ruins.push(caminho + k);
    else if (v && typeof v === 'object') ruins.push(...numerosFinitos(v, caminho + k + '.'));
  }
  return ruins;
}

describe('partidas completas', () => {
  for (const segmento of SEGS) {
    for (const regime of REGIMES) {
      for (const estrategia of Object.keys(ESTRATEGIAS)) {
        it(`${segmento} / ${regime} / ${estrategia}: nenhum numero invalido no estado`, () => {
          const s = jogar({ segmento, regime, estrategia, seed: 7 });
          expect(numerosFinitos(s)).toEqual([]);
          expect(s.mes).toBeGreaterThan(0);
          expect(s.mes).toBeLessThanOrEqual(DURACAO);
        });
      }
    }
  }

  it('a mesma semente produz a mesma partida', () => {
    const a = jogar({ segmento: 'confeccao', seed: 42 });
    const b = jogar({ segmento: 'confeccao', seed: 42 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('o estado sobrevive a JSON (e o que vai para o armazenamento)', () => {
    const s = jogar({ segmento: 'software', meses: 12, seed: 3 });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('identidades contabeis do fechamento', () => {
  for (const segmento of SEGS) {
    it(`${segmento}: caixa final - caixa inicial = entradas - saidas`, () => {
      jogar({
        segmento, estrategia: 'caotica', seed: 11, resolver: false, aoFechar: (s, reg, antes) => {
          expect(reg.caixa - antes.caixa).toBeCloseTo(reg.entradas - reg.saidas, 4);
        },
      });
    });

    it(`${segmento}: variacao do patrimonio liquido = lucro do mes`, () => {
      for (const regime of REGIMES) {
        jogar({
          segmento, regime, estrategia: 'caotica', seed: 5, resolver: false, aoFechar: (s, reg, antes) => {
            expect(patrimonio(s) - patrimonio(antes)).toBeCloseTo(reg.lucro, 4);
          },
        });
      }
    });

    it(`${segmento}: as linhas do DRE fecham no lucro liquido`, () => {
      jogar({
        segmento, estrategia: 'caotica', seed: 9, aoFechar: (s, h) => {
          const dre = h.receita - h.tribVenda - h.cmv - h.folha - h.encargos - h.proLabore
            - h.despesas - h.depreciacao - h.juros - h.irpj;
          expect(dre).toBeCloseTo(h.lucro, 4);
        },
      });
    });
  }

  it('estoque nunca fica negativo e o valor do estoque acompanha a quantidade', () => {
    jogar({
      segmento: 'confeccao', estrategia: 'caotica', seed: 13, aoFechar: s => {
        expect(s.estoque).toBeGreaterThanOrEqual(0);
        if (s.estoque === 0) expect(s.valorEstoque).toBeCloseTo(0, 6);
      },
    });
  });

  it('nao vende mais do que a procura (fora pedidos especiais) nem do que a oferta', () => {
    jogar({
      segmento: 'hamburgueria', estrategia: 'caotica', seed: 17, resolver: false, aoFechar: (s, h) => {
        expect(h.vendidos).toBeLessThanOrEqual(Math.max(h.demanda, 0) + 1e-9);
        expect(h.vendidos).toBeLessThanOrEqual(h.capacidade);
      },
    });
  });
});

describe('fim de jogo', () => {
  it('tres meses seguidos com caixa negativo e a empresa quebra', () => {
    const s = novoJogo({ nome: 'X', segmento: 'software', capital: 80000, emprestimo: 0, regime: 'simples' });
    s.caixa = -1000;
    s.dec.func = { producao: 1, comercial: 0, adm: 0 };
    s.dec.marketing = 0;
    const rnd = semente(2);
    for (let i = 0; i < 3 && !s.fim; i++) { fecharMes(s, rnd); s.evento = null; }
    expect(s.fim).toBe('falencia');
  });

  it('chega ao fim do prazo marcado como concluido', () => {
    const s = jogar({ segmento: 'confeccao', capital: 300000, estrategia: 'ativa', seed: 21 });
    if (s.fim !== 'falencia') {
      expect(s.mes).toBe(DURACAO);
      expect(s.fim).toBe('concluido');
    }
  });
});

describe('regime tributario', () => {
  it('so troca em janeiro', () => {
    const s = novoJogo({ nome: 'X', segmento: 'hamburgueria', capital: 150000, emprestimo: 0, regime: 'simples' });
    expect(trocarRegime(s, 'presumido').ok).toBe(true);
    fecharMes(s, semente(1));
    expect(trocarRegime(s, 'real').ok).toBe(false);
    expect(s.regime).toBe('presumido');
  });

  it('acima de R$ 4,8 milhoes de RBT12 o Simples deixa de se aplicar', () => {
    const s = novoJogo({ nome: 'X', segmento: 'hamburgueria', capital: 150000, emprestimo: 0, regime: 'simples' });
    s.hist = Array.from({ length: 12 }, (_, i) => ({ mes: i - 12, receita: 500000, folhaFatorR: 0, lucro: 0, comp: {} }));
    const reg = fecharMes(s, semente(1));
    expect(reg.comp.simples).toBeNull();
    expect(s.regime).toBe('presumido');
  });

  it('o comparativo soma os tributos do ano por regime e aponta o menor', () => {
    const s = jogar({ segmento: 'software', meses: 6, seed: 4 });
    const { tot, melhor } = comparativoDoAno(s, 0);
    for (const r of REGIMES) expect(tot[r]).toBeCloseTo(s.hist.reduce((t, h) => t + h.comp[r], 0), 6);
    expect(tot[melhor]).toBe(Math.min(...REGIMES.map(r => tot[r])));
  });
});
