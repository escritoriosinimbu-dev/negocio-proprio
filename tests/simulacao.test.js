import { describe, it, expect } from 'vitest';
import {
  novoJogo, fecharMes, patrimonio, comparativoDoAno, trocarRegime, SEGMENTOS, REGIMES, DURACAO, capacidades,
  comprar, contratarEmprestimo, quitarEmprestimo, distribuirLucros, resolverEvento, EVENTOS, jogoEncerrado,
  migrarEstado, VERSAO_ESTADO,
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

function comHistorico(mes, desde, receita) {
  const s = novoJogo({ nome: 'X', segmento: 'hamburgueria', capital: 150000, emprestimo: 0, regime: 'simples' });
  s.mes = mes;
  s.hist = [];
  for (let m = desde; m < mes; m++) s.hist.push({ mes: m, receita, folhaFatorR: 0, lucro: 0, proLabore: 0, comp: {} });
  return s;
}

describe('fluxo de caixa (DFC)', () => {
  it('caixa inicial + linhas da DFC = caixa final, com acoes e acontecimentos no meio', () => {
    for (const segmento of SEGS) {
      let anterior = null;
      const rnd = semente(31);
      const s = novoJogo({ nome: 'X', segmento, capital: 300000, emprestimo: 50000, regime: 'simples' });
      const inicial = s.caixa;
      for (let m = 0; m < 30 && !s.fim; m++) {
        ESTRATEGIAS.ativa(s, rnd);
        if (rnd() < 0.3) comprar(s, 'equip');
        if (rnd() < 0.3) contratarEmprestimo(s, 10000);
        if (rnd() < 0.2 && s.emprestimos.length) quitarEmprestimo(s, 0);
        if (rnd() < 0.3) distribuirLucros(s, 5000);
        const h = fecharMes(s, rnd);
        expect(h.caixaIni).toBeCloseTo(anterior ? anterior.caixa : inicial, 4);
        const linhas = h.entradas - h.saidas - h.quitado - h.investido + h.captado - h.distribuido;
        expect(h.caixaIni + linhas).toBeCloseTo(h.caixa, 4);
        if (s.evento) resolverEvento(s, Math.floor(rnd() * s.evento.opcoes.length), rnd);
        anterior = h;
      }
    }
  });

  it('equipamento financiado nao aparece como entrada nem saida de caixa', () => {
    const s = jogar({ segmento: 'confeccao', meses: 6, seed: 4, resolver: false });
    s.fim = null;
    s.evento = { id: 'credito', ...EVENTOS.credito.montar(s) };
    const custo = s.evento.dados.custo;
    resolverEvento(s, 0);
    const h = fecharMes(s, semente(9));
    expect(h.investido).toBe(0);
    expect(h.captado).toBe(0);
    expect(h.financiado).toBe(custo);
  });
});

describe('custeio por absorcao na industria', () => {
  it('a peca em estoque carrega mao de obra alem da materia-prima', () => {
    const s = novoJogo({ nome: 'X', segmento: 'confeccao', capital: 300000, emprestimo: 0, regime: 'real' });
    s.dec.producaoAuto = false;
    s.dec.producao = capacidades(s, s.dec.func).capacidade;
    const h = fecharMes(s, semente(1));
    expect(s.estoque).toBeGreaterThan(0);
    expect(s.valorEstoque / s.estoque).toBeGreaterThan(h.compras / h.produzido + 1);
    expect(h.absorvido).toBeGreaterThan(0);
  });
});

describe('pessoas', () => {
  it('a politica salarial nao pode baixar depois do primeiro mes', () => {
    const s = novoJogo({ nome: 'X', segmento: 'software', capital: 150000, emprestimo: 0, regime: 'simples' });
    s.dec.politica = 'acima';
    const h1 = fecharMes(s, semente(1));
    s.evento = null;
    s.dec.politica = 'abaixo';
    const h2 = fecharMes(s, semente(2));
    expect(s.dec.politica).toBe('acima');
    expect(h2.folha).toBeCloseTo(h1.folha, 6);
  });
});

describe('socio', () => {
  it('a retencao sobre lucros abaixo de R$ 600 mil de renda volta no ajuste anual', () => {
    const s = novoJogo({ nome: 'X', segmento: 'software', capital: 300000, emprestimo: 0, regime: 'simples' });
    s.lucroAcum = 200000;
    s.caixa = 400000;
    const r = distribuirLucros(s, 60000);
    expect(r.irrf).toBeCloseTo(6000, 6);
    const antes = s.retirado;
    const rnd = semente(5);
    while (s.mes < 12) { fecharMes(s, rnd); s.evento = null; s.fim = null; }
    expect(s.retirado - antes).toBeCloseTo(6000, 6);
    expect(s.irrfDiv).toBeCloseTo(0, 6);
  });
});

describe('estado salvo', () => {
  it('migra um jogo da versao 1 e continua jogando', () => {
    const s = jogar({ segmento: 'confeccao', meses: 5, seed: 6, resolver: false });
    s.fim = null;
    s.evento = null;
    s.v = 1;
    for (const k of ['politicaPaga', 'prejuizoFiscal', 'financiadoMes', 'dividendosDonoMes', 'irrfDivMes']) delete s[k];
    delete s.dec.producaoAuto;
    for (const h of s.hist) h.folhaFatorR = 1;
    migrarEstado(s);
    expect(s.v).toBe(VERSAO_ESTADO);
    expect(s.dec.producaoAuto).toBe(true);
    expect(s.hist[0].folhaFatorR).toBeCloseTo(s.hist[0].folha * 1.3 + s.hist[0].proLabore, 6);
    fecharMes(s, semente(7));
    expect(numerosFinitos(s)).toEqual([]);
  });
});

describe('fim de jogo', () => {
  it('tres meses seguidos com caixa negativo e a empresa quebra', () => {
    const s = novoJogo({ nome: 'X', segmento: 'software', capital: 80000, emprestimo: 0, regime: 'simples' });
    s.caixa = -1000;
    s.dec.func = { producao: 4, comercial: 0, adm: 0 }; // equipe ociosa: o dono so vende 150 h
    s.dec.marketing = 0;
    const rnd = semente(2);
    for (let i = 0; i < 3 && !s.fim; i++) { fecharMes(s, rnd); s.evento = null; }
    expect(s.fim).toBe('falencia');
  });

  it('no modo livre seguem os acontecimentos e a falencia encerra o jogo', () => {
    const s = jogar({ segmento: 'hamburgueria', capital: 300000, estrategia: 'ativa', seed: 21 });
    if (s.fim !== 'concluido') return;
    s.modoLivre = true;
    expect(jogoEncerrado(s)).toBe(false);
    const rnd = semente(8);
    let eventos = 0;
    for (let i = 0; i < 30; i++) { fecharMes(s, rnd); if (s.evento) { eventos++; s.evento = null; } }
    expect(eventos).toBeGreaterThan(0);
    s.caixa = -1e6;
    fecharMes(s, rnd);
    expect(jogoEncerrado(s)).toBe(true);
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

  it('RBT12 acima de 4,8 mi com a receita do ano abaixo do limite: continua no Simples', () => {
    const s = comHistorico(18, 6, 420000); // RBT12 5,04 mi; ano 2 com 2,52 mi
    const reg = fecharMes(s, semente(1));
    expect(reg.comp.simples).not.toBeNull();
    expect(s.regime).toBe('simples');
  });

  it('receita do ano acima de 5,76 mi: o mes do excesso ainda e Simples, o seguinte nao', () => {
    const s = comHistorico(22, 12, 575000); // 10 meses do ano 2 somam 5,75 mi
    const reg = fecharMes(s, semente(1));
    expect(reg.regime).toBe('simples');
    expect(reg.comp.simples).not.toBeNull();
    expect(s.regime).toBe('presumido');
    s.evento = null;
    expect(fecharMes(s, semente(2)).comp.simples).toBeNull();
  });

  it('receita do ano entre 4,8 e 5,76 mi: fica no Simples ate dezembro e sai em janeiro', () => {
    const s = comHistorico(23, 12, 450000); // 11 meses: 4,95 mi
    const reg = fecharMes(s, semente(1));
    expect(reg.regime).toBe('simples');
    expect(s.mes % 12).toBe(0);
    expect(s.regime).toBe('presumido');
    expect(trocarRegime(s, 'simples').ok).toBe(false);
  });

  it('excluida por excesso pode voltar ao Simples num janeiro depois de um ano dentro do limite', () => {
    const s = comHistorico(23, 12, 100000);
    s.excluidoSimples = true;
    s.regime = 'presumido';
    fecharMes(s, semente(1));
    expect(s.excluidoSimples).toBe(false);
    expect(trocarRegime(s, 'simples').ok).toBe(true);
  });

  it('receita do ano anterior acima do sublimite: ICMS fora do DAS o ano inteiro', () => {
    const s = comHistorico(13, 0, 350000); // ano 1 com 4,2 mi
    const reg = fecharMes(s, semente(1));
    expect(reg.det.some(d => d.nome.includes('fora do DAS'))).toBe(true);
  });

  it('o Fator R conta 13o, ferias e FGTS da folha e o pro-labore', () => {
    jogar({
      segmento: 'software', meses: 6, seed: 2, aoFechar: (s, h) => {
        expect(h.folhaFatorR).toBeCloseTo(h.folha * 1.3 + h.proLabore, 6);
      },
    });
  });

  it('so o prejuizo apurado no Lucro Real e compensavel ao entrar no Real', () => {
    const s = jogar({ segmento: 'confeccao', estrategia: 'parada', meses: 12, seed: 3 });
    expect(s.prejuizo.real).toBeGreaterThan(0); // prejuizo do comparativo, simulado
    s.fim = null;
    expect(trocarRegime(s, 'real').ok).toBe(true);
    expect(s.prejuizo.real).toBe(0);
  });

  it('o comparativo soma os tributos do ano por regime e aponta o menor', () => {
    const s = jogar({ segmento: 'software', meses: 6, seed: 4 });
    const { tot, melhor } = comparativoDoAno(s, 0);
    for (const r of REGIMES) expect(tot[r]).toBeCloseTo(s.hist.reduce((t, h) => t + h.comp[r], 0), 6);
    expect(tot[melhor]).toBe(Math.min(...REGIMES.map(r => tot[r])));
  });
});
