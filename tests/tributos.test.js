import { describe, it, expect } from 'vitest';
import { aliqEfetiva, anexoSimples, apurar, irrfProLabore, liquidoProLabore, SEGMENTOS, ANEXOS } from '../src/engine/index.js';

const op = (over = {}) => ({
  seg: SEGMENTOS.hamburgueria, receita: 100000, compras: 30000, cmv: 30000, folha: 20000, proLabore: 3000,
  despesas: 15000, aluguel: 6000, utilidades: 3100, depreciacao: 583, juros: 0, rbt12: 1.2e6, fatorR: 0.3, ...over,
});

describe('Simples Nacional: aliquota efetiva', () => {
  it('primeira faixa e a propria aliquota nominal', () => {
    expect(aliqEfetiva('I', 100000)).toBeCloseTo(0.04, 10);
    expect(aliqEfetiva('I', 180000)).toBeCloseTo(0.04, 10);
    expect(aliqEfetiva('III', 150000)).toBeCloseTo(0.06, 10);
    expect(aliqEfetiva('V', 50000)).toBeCloseTo(0.155, 10);
  });

  it('aplica a formula (RBT12 x nominal - deducao) / RBT12', () => {
    expect(aliqEfetiva('I', 360000)).toBeCloseTo((360000 * 0.073 - 5940) / 360000, 10);
    expect(aliqEfetiva('II', 1e6)).toBeCloseTo((1e6 * 0.112 - 22500) / 1e6, 10);
    expect(aliqEfetiva('III', 300000)).toBeCloseTo((300000 * 0.112 - 9360) / 300000, 10);
    expect(aliqEfetiva('V', 2e6)).toBeCloseTo((2e6 * 0.23 - 62100) / 2e6, 10);
  });

  it('a aliquota efetiva e continua nas trocas de faixa ate o sublimite', () => {
    for (const anexo of Object.keys(ANEXOS)) {
      for (const [limite] of ANEXOS[anexo].slice(0, 4)) {
        expect(aliqEfetiva(anexo, limite + 1)).toBeCloseTo(aliqEfetiva(anexo, limite), 4);
      }
    }
  });

  it('a aliquota efetiva nunca diminui com a receita ate R$ 3,6 milhoes', () => {
    for (const anexo of Object.keys(ANEXOS)) {
      let ant = 0;
      for (let r = 10000; r <= 3.6e6; r += 10000) {
        const a = aliqEfetiva(anexo, r);
        expect(a).toBeGreaterThanOrEqual(ant - 1e-12);
        ant = a;
      }
    }
  });

  it('na 6a faixa a aliquota cai porque ICMS/ISS saem do DAS', () => {
    expect(aliqEfetiva('I', 3.6e6 + 1)).toBeLessThan(aliqEfetiva('I', 3.6e6));
  });

  it('acima de R$ 4,8 milhoes usa a ultima faixa', () => {
    expect(aliqEfetiva('I', 6e6)).toBeCloseTo((6e6 * 0.19 - 378000) / 6e6, 10);
  });

  it('receita zero usa a aliquota da primeira faixa', () => {
    expect(aliqEfetiva('II', 0)).toBe(0.045);
  });
});

describe('Simples Nacional: anexo pela atividade e pelo Fator R', () => {
  it('comercio no I, industria no II', () => {
    expect(anexoSimples('comercio', 0)).toBe('I');
    expect(anexoSimples('industria', 0)).toBe('II');
  });

  it('servico: Fator R de 28% ou mais vai para o III, abaixo para o V', () => {
    expect(anexoSimples('servico', 0.28)).toBe('III');
    expect(anexoSimples('servico', 0.2799)).toBe('V');
  });

  it('6a faixa sem impedimento: ICMS segue no DAS calculado pela 5a faixa', () => {
    const r = apurar('simples', op({ rbt12: 3.7e6 }), 0);
    const f = [3.6e6, 0.143, 87300];
    const ef5 = (3.7e6 * f[1] - f[2]) / 3.7e6;
    const icms = r.det.find(d => d.nome.startsWith('ICMS no DAS'));
    expect(icms.valor).toBeCloseTo(100000 * ef5 * 0.335, 6);
    expect(r.tribVenda).toBeCloseTo(100000 * aliqEfetiva('I', 3.7e6) + icms.valor, 6);
  });

  it('impedida pelo sublimite na 6a faixa: ICMS por fora, pelas regras normais', () => {
    const r = apurar('simples', op({ rbt12: 3.7e6, impedidoSublimite: true }), 0);
    const icms = r.det.find(d => d.nome.includes('fora do DAS'));
    expect(icms.valor).toBeCloseTo(100000 * 0.032, 6);
    expect(r.tribVenda).toBeCloseTo(100000 * aliqEfetiva('I', 3.7e6) + icms.valor, 6);
  });

  it('impedida com RBT12 abaixo de 3,6 mi: tira a parcela do ICMS do DAS e cobra por fora', () => {
    const r = apurar('simples', op({ rbt12: 3e6, impedidoSublimite: true }), 0);
    const ef = aliqEfetiva('I', 3e6);
    expect(r.aliq).toBeCloseTo(ef * (1 - 0.335), 10);
    expect(r.tribVenda).toBeCloseTo(100000 * ef * (1 - 0.335) + 3200, 6);
  });

  it('ISS dentro do DAS nunca passa de 5% da receita', () => {
    const r = apurar('simples', op({ seg: SEGMENTOS.software, rbt12: 4.5e6, fatorR: 0.3, impedidoSublimite: false }), 0);
    const iss = r.det.find(d => d.nome.startsWith('ISS no DAS'));
    expect(iss.valor).toBeLessThanOrEqual(100000 * 0.05 + 1e-6);
  });

  it('o DAS e receita x aliquota efetiva e nao ha CPP fora da guia', () => {
    const r = apurar('simples', op(), 0);
    expect(r.anexo).toBe('I');
    expect(r.tribVenda).toBeCloseTo(100000 * aliqEfetiva('I', 1.2e6), 6);
    expect(r.cpp).toBe(0);
    expect(r.irpj + r.csll).toBe(0);
  });
});

describe('Lucro Presumido', () => {
  it('comercio: PIS 0,65%, COFINS 3%, IRPJ sobre 8% e CSLL sobre 12%', () => {
    const r = apurar('presumido', op(), 0);
    const nomes = Object.fromEntries(r.det.map(d => [d.nome.split(' ')[0], d.valor]));
    expect(nomes.PIS).toBeCloseTo(650, 6);
    expect(nomes.COFINS).toBeCloseTo(3000, 6);
    expect(r.irpj).toBeCloseTo(8000 * 0.15, 6);
    expect(r.csll).toBeCloseTo(12000 * 0.09, 6);
  });

  it('servico: presuncao de 32% e adicional de 10% acima de R$ 20 mil no mes', () => {
    const r = apurar('presumido', op({ seg: SEGMENTOS.software, receita: 300000 }), 0);
    expect(r.irpj).toBeCloseTo(96000 * 0.15 + (96000 - 20000) * 0.10, 6);
    expect(r.csll).toBeCloseTo(96000 * 0.09, 6);
  });

  it('cobra INSS patronal sobre folha e pro-labore', () => {
    const r = apurar('presumido', op(), 0);
    // 20% + RAT 2% + terceiros 5,8% sobre salario e provisoes de 13o e ferias + 1/3; 20% sobre o pro-labore
    expect(r.cpp).toBeCloseTo(20000 * 0.278 * (1 + 1 / 12 + 1 / 9) + 3000 * 0.2, 6);
  });

  it('ICMS com credito na industria e sem credito no regime de restaurante', () => {
    const ind = apurar('presumido', op({ seg: SEGMENTOS.confeccao }), 0);
    const icmsInd = ind.det.find(d => d.nome.startsWith('ICMS')).valor;
    expect(icmsInd).toBeCloseTo(100000 * 0.18 - 30000 * 0.18, 6);
    const rest = apurar('presumido', op(), 0);
    expect(rest.det.find(d => d.nome.startsWith('ICMS')).valor).toBeCloseTo(100000 * 0.032, 6);
  });

  it('ISS so no servico', () => {
    const r = apurar('presumido', op({ seg: SEGMENTOS.software }), 0);
    expect(r.det.find(d => d.nome.startsWith('ISS')).valor).toBeCloseTo(3000, 6);
    expect(r.det.some(d => d.nome.startsWith('ICMS'))).toBe(false);
  });
});

describe('PIS/COFINS', () => {
  it('confeccao: ICMS destacado sai da base (Tema 69 do STF)', () => {
    const r = apurar('presumido', op({ seg: SEGMENTOS.confeccao }), 0);
    expect(r.det.find(d => d.nome.startsWith('PIS')).valor).toBeCloseTo(100000 * 0.82 * 0.0065, 6);
    expect(r.det.find(d => d.nome.startsWith('COFINS')).valor).toBeCloseTo(100000 * 0.82 * 0.03, 6);
  });

  it('software fica no cumulativo mesmo no Lucro Real', () => {
    const r = apurar('real', op({ seg: SEGMENTOS.software }), 0);
    expect(r.det.find(d => d.nome.startsWith('PIS')).valor).toBeCloseTo(650, 6);
    expect(r.det.find(d => d.nome.startsWith('COFINS')).valor).toBeCloseTo(3000, 6);
  });

  it('hamburgueria no Real so credita 30% das compras (insumos de aliquota zero)', () => {
    const o = op();
    const r = apurar('real', o, 0);
    const credito = 0.3 * o.compras + o.aluguel + o.utilidades + o.depreciacao;
    expect(r.det.find(d => d.nome.startsWith('PIS')).valor).toBeCloseTo(Math.max(0, 0.0165 * (o.receita - credito)), 6);
  });
});

describe('Lucro Real', () => {
  it('prejuizo nao paga IRPJ/CSLL e vira saldo a compensar', () => {
    const r = apurar('real', op({ receita: 10000, cmv: 3000, compras: 3000 }), 0);
    expect(r.lucroAntesIR).toBeLessThan(0);
    expect(r.irpj).toBe(0);
    expect(r.csll).toBe(0);
    expect(r.prejuizo).toBeCloseTo(-r.lucroAntesIR, 6);
  });

  it('compensa no maximo 30% do lucro do periodo', () => {
    const r = apurar('real', op({ receita: 200000 }), 1e9);
    const base = r.lucroAntesIR * 0.7;
    expect(r.prejuizo).toBeCloseTo(1e9 - r.lucroAntesIR * 0.3, 2);
    expect(r.csll).toBeCloseTo(base * 0.09, 6);
    expect(r.irpj).toBeCloseTo(base * 0.15 + Math.max(0, base - 20000) * 0.1, 6);
  });

  it('PIS/COFINS nao cumulativos descontam credito e nao ficam negativos', () => {
    const r = apurar('real', op({ receita: 1000, compras: 500000 }), 0);
    const pis = r.det.find(d => d.nome.startsWith('PIS')).valor;
    const cofins = r.det.find(d => d.nome.startsWith('COFINS')).valor;
    expect(pis).toBe(0);
    expect(cofins).toBe(0);
  });

  it('nao altera o prejuizo recebido (funcao pura)', () => {
    const entrada = { prej: 5000 };
    apurar('real', op(), entrada.prej);
    expect(entrada.prej).toBe(5000);
  });
});

describe('Identidades', () => {
  it('lucro = lucro antes do IR - IRPJ - CSLL, e total = soma do detalhe', () => {
    for (const regime of ['simples', 'presumido', 'real']) {
      for (const seg of Object.values(SEGMENTOS)) {
        const r = apurar(regime, op({ seg }), 0);
        expect(r.lucro).toBeCloseTo(r.lucroAntesIR - r.irpj - r.csll, 6);
        const det = r.det.reduce((t, d) => t + d.valor, 0);
        expect(det).toBeCloseTo(r.totalTributos, 6);
      }
    }
  });
});

describe('pro-labore do socio', () => {
  it('ate R$ 5 mil nao tem IR na fonte (Lei 15.270/2025)', () => {
    expect(irrfProLabore(5000)).toBe(0);
    expect(liquidoProLabore(5000)).toBeCloseTo(4450, 6);
  });

  it('INSS limitado ao teto e IR pela tabela progressiva', () => {
    expect(liquidoProLabore(15000)).toBeCloseTo(11107.81, 1);
  });

  it('o liquido nunca cai quando o bruto sobe', () => {
    let ant = 0;
    for (let b = 1621; b <= 40000; b += 50) {
      const l = liquidoProLabore(b);
      expect(l).toBeGreaterThanOrEqual(ant - 1e-9);
      ant = l;
    }
  });
});
