import { describe, it, expect } from 'vitest';
import {
  novoJogo, fecharMes, patrimonio, comprar, custoEquip, custoEspaco, contratarEmprestimo, quitarEmprestimo,
  distribuirLucros, limiteCredito, EVENTOS, resolverEvento, sortearEvento, SEGMENTOS, riquezaDono, irrfDaDistribuicao,
} from '../src/engine/index.js';
import { semente, jogar } from './ajuda.js';

const nova = (over = {}) => novoJogo({ nome: 'X', segmento: 'confeccao', capital: 300000, emprestimo: 0, regime: 'simples', ...over });

describe('investimentos', () => {
  it('comprar equipamento troca caixa por imobilizado sem mudar o patrimonio', () => {
    const s = nova();
    const pl = patrimonio(s), custo = custoEquip(s);
    expect(comprar(s, 'equip').ok).toBe(true);
    expect(s.equipNivel).toBe(1);
    expect(patrimonio(s)).toBeCloseTo(pl, 6);
    expect(s.investidoMes).toBe(custo);
  });

  it('recusa compra sem caixa', () => {
    const s = nova();
    s.caixa = custoEspaco(s) - 1;
    expect(comprar(s, 'espaco').ok).toBe(false);
    expect(s.espacoNivel).toBe(0);
  });

  it('expansao aumenta o mercado e so pode ser feita uma vez', () => {
    const s = nova();
    expect(comprar(s, 'exp:loja').ok).toBe(true);
    expect(s.mercadoMult).toBeCloseTo(1.35, 10);
    expect(comprar(s, 'exp:loja').ok).toBe(false);
  });
});

describe('emprestimos', () => {
  it('respeita o limite de credito', () => {
    const s = nova();
    expect(contratarEmprestimo(s, limiteCredito(s) + 1000).ok).toBe(false);
    const caixa = s.caixa;
    expect(contratarEmprestimo(s, 20000).ok).toBe(true);
    expect(s.caixa).toBe(caixa + 20000);
  });

  it('pegar e quitar emprestimo nao muda o patrimonio', () => {
    const s = nova();
    const pl = patrimonio(s);
    contratarEmprestimo(s, 20000);
    expect(patrimonio(s)).toBeCloseTo(pl, 6);
    expect(quitarEmprestimo(s, 0).ok).toBe(true);
    expect(s.emprestimos).toHaveLength(0);
    expect(patrimonio(s)).toBeCloseTo(pl, 6);
  });

  it('o emprestimo e amortizado ate zerar', () => {
    const s = nova();
    contratarEmprestimo(s, 24000);
    const rnd = semente(1);
    for (let i = 0; i < 24; i++) { fecharMes(s, rnd); s.evento = null; s.fim = null; }
    expect(s.emprestimos.filter(e => e.nome === 'Capital de giro')).toHaveLength(0);
  });
});

describe('distribuicao de lucros', () => {
  const comLucro = () => {
    const s = nova();
    s.lucroAcum = 500000;
    s.caixa = 500000;
    return s;
  };

  it('so distribui lucro que existe', () => {
    const s = nova();
    expect(distribuirLucros(s, 5000).ok).toBe(false);
  });

  it('ate R$ 50 mil no mes nao ha retencao', () => {
    const s = comLucro();
    const r = distribuirLucros(s, 50000);
    expect(r.irrf).toBe(0);
    expect(s.retirado).toBe(50000);
  });

  it('com investidor, o dono so recebe a parte dele e a riqueza dele nao muda', () => {
    const s = comLucro();
    s.participacao = 0.8;
    const antes = riquezaDono(s);
    const r = distribuirLucros(s, 50000);
    expect(s.retirado).toBeCloseTo(40000, 6);
    expect(r.investidor).toBeCloseTo(10000, 6);
    expect(riquezaDono(s)).toBeCloseTo(antes, 6);
  });

  it('a previa da retencao bate com o que e retido', () => {
    const s = comLucro();
    distribuirLucros(s, 50000);
    const previa = irrfDaDistribuicao(s, 1000);
    expect(previa).toBeCloseTo(5100, 6);
    expect(distribuirLucros(s, 1000).irrf).toBeCloseTo(previa, 6);
  });

  it('acima de R$ 50 mil no mes retem 10% do total do mes', () => {
    const s = comLucro();
    distribuirLucros(s, 40000);
    const r = distribuirLucros(s, 20000);
    expect(r.irrf).toBeCloseTo(6000, 6);
    expect(s.irrfDiv).toBeCloseTo(6000, 6);
    expect(s.retirado).toBeCloseTo(54000, 6);
  });
});

describe('acontecimentos', () => {
  it('todo acontecimento monta e resolve em todas as opcoes sem quebrar o estado', () => {
    for (const segmento of Object.keys(SEGMENTOS)) {
      const base = jogar({ segmento, meses: 8, seed: 8, resolver: false });
      base.fim = null;
      for (const [id, ev] of Object.entries(EVENTOS)) {
        const montado = ev.montar(base, semente(3));
        for (let i = 0; i < montado.opcoes.length; i++) {
          const s = structuredClone(base);
          s.evento = { id, ...ev.montar(s, semente(3)) };
          const r = resolverEvento(s, i, semente(5));
          expect(typeof r.msg).toBe('string');
          expect(s.evento).toBeNull();
          expect(Number.isFinite(s.caixa)).toBe(true);
          expect(() => fecharMes(s, semente(6))).not.toThrow();
        }
      }
    }
  });

  it('o sorteio so escolhe acontecimentos cuja condicao vale', () => {
    const s = nova();
    for (let i = 0; i < 200; i++) {
      const e = sortearEvento(s, semente(i + 1));
      expect(EVENTOS[e.id].cond(s)).toBe(true);
    }
  });
});
