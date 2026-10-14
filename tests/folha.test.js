import { describe, it, expect } from 'vitest';
import { novoJogo, fecharMes, REGIMES, ENCARGOS_FOLHA, CPP_FOLHA, comparativoDoAno } from '../src/engine/index.js';

// Encargos sobre a folha: FGTS e provisoes em todos os regimes; contribuicao patronal (CPP) so fora do Simples.
describe('encargos sobre a folha', () => {
  it('FGTS + provisoes de 13o e ferias + 1/3 dao 29,0% dos salarios', () => {
    const provisoes = 1 / 12 + (1 / 12) * (4 / 3);
    expect(ENCARGOS_FOLHA).toBeCloseTo(provisoes + 0.08 * (1 + provisoes), 12);
    expect(ENCARGOS_FOLHA).toBeCloseTo(0.29, 4);
    expect(CPP_FOLHA).toBeCloseTo(0.278 * (1 + provisoes), 12);
  });

  for (const regime of REGIMES) {
    it(`${regime}: a linha de encargos do DRE e o comparativo usam a mesma regra`, () => {
      const s = novoJogo({ nome: 'x', segmento: 'hamburgueria', capital: 150000, emprestimo: 0, regime });
      const h = fecharMes(s, () => 0.5);
      const cpp = regime === 'simples' ? 0 : h.folha * CPP_FOLHA + h.proLabore * 0.2;
      // no Simples nao ha CPP fora do DAS: somente FGTS e provisoes
      expect(h.encargos).toBeCloseTo(h.folha * ENCARGOS_FOLHA + cpp, 6);
      // o comparativo do regime atual e exatamente o tributo pago, que inclui a CPP
      expect(h.comp[regime]).toBeCloseTo(h.tributos, 6);
      expect(comparativoDoAno(s, 0).tot[regime]).toBeCloseTo(h.tributos, 6);
      const linhaCpp = h.det.find(d => d.nome.startsWith('INSS patronal'));
      if (regime === 'simples') expect(linhaCpp).toBeUndefined();
      else expect(linhaCpp.valor).toBeCloseTo(cpp, 6);
    });
  }
});
