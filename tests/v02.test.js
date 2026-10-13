import { describe, it, expect } from 'vitest';
import {
  novoJogo, fecharMes, patrimonio, totalReceber, resolverEvento, migrarEstado, VERSAO_ESTADO, EVENTOS, CRISES,
  precoJusto, precoMercado, procuraDoMercado, demandaEsperada, margemContribuicao, precoPelaMargem, pontoEquilibrio,
  custosFixos, aliqVendaEstimada, contratarEmprestimo, taxaPronampe, efeito, nivelEfetivo, capacidades, apurar,
  SEGMENTOS, SELIC_MIN, SELIC_MAX, CONCORRENCIA_MAX, eventoRegime, salario, indice, REAJUSTE_ANUAL,
} from '../src/engine/index.js';
import { semente, jogar } from './ajuda.js';

const jogo = (segmento = 'hamburgueria', over = {}) =>
  Object.assign(novoJogo({ nome: 'T', segmento, capital: 150000, emprestimo: 0, regime: 'simples' }), over);

// Fecha meses descartando acontecimentos (para isolar a mecanica testada).
function fechar(s, n, rnd = semente(1)) {
  let h;
  for (let i = 0; i < n; i++) {
    h = fecharMes(s, rnd);
    s.evento = null;
  }
  return h;
}

// Monta um acontecimento do catalogo e o resolve com a opcao dada.
function viver(s, catalogo, id, opcao = 0, rnd = semente(1)) {
  s.evento = { id, ...catalogo[id].montar(s, rnd) };
  return resolverEvento(s, opcao, rnd);
}

describe('preco justo: qualidade e reputacao', () => {
  it('com qualidade e reputacao 50, o preco justo e o de mercado', () => {
    const s = jogo('hamburgueria', { Q: 50, A: 50 });
    expect(precoJusto(s)).toBeCloseTo(precoMercado(s), 8);
  });

  it('qualidade alta deixa cobrar acima do mercado sem perder procura', () => {
    const base = jogo('hamburgueria', { Q: 50, A: 50 });
    const premium = jogo('hamburgueria', { Q: 90, A: 90 });
    premium.dec.preco = base.precoRef * 1.15;
    expect(procuraDoMercado(premium)).toBeGreaterThan(procuraDoMercado(base));
  });

  it('caro e sem qualidade: a procura despenca', () => {
    const s = jogo('hamburgueria', { Q: 30, A: 50 });
    const normal = procuraDoMercado(s);
    s.dec.preco = s.precoRef * 1.3;
    expect(procuraDoMercado(s) / normal).toBeLessThan(0.5);
  });

  it('guerra de precos derruba o preco que o mercado aceita enquanto dura', () => {
    const s = jogo();
    s.mes = 8;
    const antes = precoMercado(s);
    viver(s, EVENTOS, 'guerraPrecos', 2);
    expect(precoMercado(s)).toBeCloseTo(antes * 0.88, 8);
    s.mes += 4;
    expect(precoMercado(s)).toBeCloseTo(antes, 8);
  });
});

describe('margem de contribuicao', () => {
  it('o preco pela margem entrega a margem pedida', () => {
    for (const segmento of Object.keys(SEGMENTOS)) {
      const s = jogo(segmento);
      const p = precoPelaMargem(s, 0.35);
      expect(margemContribuicao(s, p) / p).toBeCloseTo(0.35, 2);
    }
  });

  it('ponto de equilibrio = custos fixos / margem por unidade', () => {
    const s = jogo('confeccao');
    expect(pontoEquilibrio(s)).toBeCloseTo(custosFixos(s) / margemContribuicao(s), 6);
    s.dec.preco = 1; // preco abaixo do custo: nao ha ponto de equilibrio
    expect(pontoEquilibrio(s)).toBe(Infinity);
  });

  it('a aliquota estimada passa a ser a do ultimo mes', () => {
    const s = jogo();
    const h = fechar(s, 1);
    expect(aliqVendaEstimada(s)).toBeCloseTo(h.tribVenda / h.receita, 10);
  });

  it('no modo margem, o reajuste do fornecedor passa sozinho para o preco', () => {
    const s = jogo('confeccao');
    s.dec.modoPreco = 'margem';
    s.dec.margemAlvo = 0.4;
    fechar(s, 2);
    const antes = s.dec.preco;
    s.mes = 5;
    viver(s, EVENTOS, 'materia', 0);
    expect(s.dec.modoPreco).toBe('margem');
    fechar(s, 1);
    expect(s.dec.preco).toBeGreaterThan(antes * 1.05);
  });
});

describe('Selic', () => {
  it('fica entre o piso e o teto numa partida longa e anda em passos de 0,25 ponto', () => {
    const s = jogo('software');
    s.modoLivre = true;
    const rnd = semente(5);
    for (let m = 0; m < 120 && !s.fim; m++) {
      fechar(s, 1, rnd);
      expect(s.selic).toBeGreaterThanOrEqual(SELIC_MIN);
      expect(s.selic).toBeLessThanOrEqual(SELIC_MAX);
      expect(Math.round(s.selic * 10000) % 25).toBe(0);
      s.caixa = Math.max(s.caixa, 50000);
    }
  });

  it('o Pronampe e pos-fixado e o capital de giro e prefixado', () => {
    const s = novoJogo({ nome: 'T', segmento: 'software', capital: 150000, emprestimo: 50000, regime: 'simples' });
    s.hist.push({ mes: -1, receita: 100000 }); // da limite de credito
    expect(contratarEmprestimo(s, 10000).ok).toBe(true);
    s.hist = [];
    const giro = s.emprestimos[1].taxa;
    s.selic = 0.18;
    fecharMes(s, () => 0.9); // 0,9: sem Copom neste mes
    expect(s.emprestimos[0].taxa).toBeCloseTo(taxaPronampe(0.18), 10);
    expect(s.emprestimos[1].taxa).toBe(giro);
  });

  it('juro alto esfria a economia', () => {
    const alta = jogo(), baixa = jogo();
    alta.selic = 0.2;
    baixa.selic = 0.07;
    alta.modoLivre = baixa.modoLivre = true;
    const ra = semente(2), rb = semente(2);
    for (let m = 0; m < 12; m++) {
      alta.selic = 0.2; baixa.selic = 0.07;
      fechar(alta, 1, ra); fechar(baixa, 1, rb);
      alta.caixa = baixa.caixa = 100000;
    }
    expect(alta.economia).toBeLessThan(baixa.economia);
  });
});

describe('concorrencia', () => {
  it('tira a fatia dela da procura', () => {
    const s = jogo();
    const sem = procuraDoMercado(s);
    s.concorrencia = 0.2;
    expect(procuraDoMercado(s)).toBeCloseTo(sem * 0.8, 6);
  });

  it('lucro alto atrai concorrentes; sem lucro, eles vao embora aos poucos', () => {
    const s = jogo();
    s.mes = 12;
    for (let m = 0; m < 12; m++) s.hist.push({ mes: m, receita: 100000, lucro: 30000, folhaFatorR: 0, comp: {} });
    fechar(s, 1);
    expect(s.concorrencia).toBeGreaterThan(0);
    const t = jogo();
    t.concorrencia = 0.3;
    fechar(t, 1);
    expect(t.concorrencia).toBeLessThan(0.3);
  });

  it('o concorrente que entra fica, e nunca passa do teto', () => {
    const s = jogo();
    s.mes = 10;
    s.concorrencia = CONCORRENCIA_MAX - 0.06;
    viver(s, EVENTOS, 'concorrente', 1);
    expect(s.concorrencia).toBeLessThanOrEqual(CONCORRENCIA_MAX);
  });
});

describe('carteira (escritorio de contabilidade)', () => {
  it('fica no Anexo III com qualquer Fator R', () => {
    const s = jogo('contabilidade');
    const h = fechar(s, 1);
    expect(h.anexo).toBe('III');
    const op = { seg: SEGMENTOS.contabilidade, receita: 50000, compras: 0, cmv: 0, folha: 0, proLabore: 1621, despesas: 0, aluguel: 0, utilidades: 0, depreciacao: 0, juros: 0, rbt12: 600000, fatorR: 0.05 };
    expect(apurar('simples', op, 0).anexo).toBe('III');
  });

  it('subir o preco perde clientes aos poucos, nao de uma vez', () => {
    const s = jogo('contabilidade');
    s.dec.func.producao = 10;
    s.carteira = 40;
    const alvo = procuraDoMercado(s);
    s.dec.preco = s.precoRef * 1.4;
    const alvoCaro = procuraDoMercado(s);
    const primeiro = demandaEsperada(s);
    expect(alvoCaro).toBeLessThan(alvo);
    // anda so 30% do caminho no primeiro mes
    expect(primeiro).toBeCloseTo(40 + (alvoCaro - 40) * 0.3, 6);
  });

  it('a carteira e quem foi atendido', () => {
    const s = jogo('contabilidade');
    const h = fechar(s, 1);
    expect(s.carteira).toBe(h.vendidos);
  });
});

describe('mercadinho (revenda)', () => {
  it('o estoque estraga 3% ao mes e a perda entra no custo', () => {
    const s = jogo('mercadinho');
    s.dec.producaoAuto = false;
    s.dec.producao = 0;
    s.estoque = 1000;
    s.valorEstoque = 58000;
    s.mercadoMult = 0; // ninguem compra
    const h = fechar(s, 1);
    expect(s.estoque).toBe(970);
    expect(h.cmv).toBeCloseTo(58000 * 0.03, 6);
  });

  it('nao absorve salario no estoque (revenda nao produz)', () => {
    const s = jogo('mercadinho');
    const h = fechar(s, 1);
    expect(h.absorvido).toBe(0);
  });
});

describe('fornecedores e contratos', () => {
  it('com contrato, o custo fica travado e o reajuste acumulado chega no fim', () => {
    const s = jogo('confeccao');
    fechar(s, 4);
    s.hist.at(-1).produzido = 500;
    viver(s, EVENTOS, 'contratoFornecedor', 0);
    const travado = s.custoMat;
    viver(s, CRISES, 'insumos');
    expect(s.custoMat).toBe(travado);
    s.contratoFornecedor.minimo = 0;
    fechar(s, 12);
    expect(s.contratoFornecedor).toBe(null);
    expect(s.custoMat).toBeGreaterThan(travado * 1.15 * 1.04);
  });

  it('comprar abaixo do minimo do contrato gera multa', () => {
    const s = jogo('confeccao');
    s.contratoFornecedor = { ate: 12, minimo: 5000 };
    const h = fechar(s, 1);
    expect(h.noticias.some(([, t]) => t.includes('mínimo do contrato'))).toBe(true);
    expect(h.despesas).toBeGreaterThan(5000 * 0.3 * 23 * 0.5);
  });

  it('o contrato com a rede entra todo mes e cobra multa do que faltar', () => {
    const s = jogo('software');
    s.contratoCliente = { qtd: 5000, preco: 100, ate: 3 };
    const h = fechar(s, 1);
    expect(h.noticias.some(([, t]) => t.includes('Multa contratual'))).toBe(true);
  });
});

describe('perda com cliente que nao paga', () => {
  it('baixa o contas a receber sem mexer no caixa, e o PL cai o mesmo que o lucro', () => {
    const s = jogo('software');
    s.dec.prazo = true;
    fechar(s, 3);
    const receber = totalReceber(s);
    viver(s, EVENTOS, 'inadimplencia', 0);
    const antes = structuredClone(s);
    const h = fecharMes(s, semente(4));
    expect(h.perdas).toBeCloseTo(Math.round(receber * 0.25 / 100) * 100, 6);
    expect(h.caixa - antes.caixa).toBeCloseTo(h.entradas - h.saidas, 4);
    expect(patrimonio(s) - patrimonio(antes)).toBeCloseTo(h.lucro, 4);
  });
});

describe('janeiro: decisao do regime', () => {
  it('todo janeiro abre a decisao, com o regime atual como primeira opcao', () => {
    const s = jogo();
    const rnd = semente(8);
    while (s.mes < 12) {
      fecharMes(s, rnd);
      if (s.mes < 12) s.evento = null;
    }
    expect(s.evento.id).toBe('regime');
    expect(s.evento.dados.ordem[0]).toBe('simples');
    const i = s.evento.dados.ordem.indexOf('presumido');
    resolverEvento(s, i);
    expect(s.regime).toBe('presumido');
  });

  it('com o Simples fechado, ele nao aparece entre as opcoes', () => {
    const s = jogo('software', { mes: 12, excluidoSimples: true, regime: 'presumido' });
    expect(eventoRegime(s).dados.ordem).not.toContain('simples');
  });
});

describe('crises', () => {
  it('a recessao avisa antes: so vale a partir do mes marcado', () => {
    const s = jogo();
    s.mes = 6;
    viver(s, CRISES, 'recessao');
    expect(efeito(s, 'demanda')).toBe(1);
    expect(efeito(s, 'demanda', 8)).toBeCloseTo(0.85, 8);
    expect(efeito(s, 'demanda', 14)).toBe(1);
  });

  it('o seguro paga 80% do estrago da enchente', () => {
    const com = jogo(), sem = jogo();
    com.dec.seguro = true;
    viver(com, CRISES, 'enchente');
    viver(sem, CRISES, 'enchente');
    expect(com.extras).toBeCloseTo(sem.extras * 0.2, 6);
  });

  it('toda crise pode ser montada e resolvida em todo ramo', () => {
    for (const segmento of Object.keys(SEGMENTOS)) {
      for (const id of Object.keys(CRISES)) {
        const s = jogo(segmento);
        s.mes = 6;
        if (!CRISES[id].cond(s)) continue;
        for (let i = 0; i < CRISES[id].montar(s, semente(1)).opcoes.length; i++) {
          const t = structuredClone(s);
          expect(() => viver(t, CRISES, id, i)).not.toThrow();
          expect(() => fechar(t, 1)).not.toThrow();
        }
      }
    }
  });
});

describe('custos fixos e niveis', () => {
  it('salarios, aluguel e honorarios sobem 5% todo janeiro', () => {
    const s = jogo();
    fechar(s, 12);
    expect(indice(s)).toBeCloseTo(1 + REAJUSTE_ANUAL, 10);
    const h = fechar(s, 1);
    expect(h.contador).toBeCloseTo(700 * (1 + REAJUSTE_ANUAL), 6);
    expect(salario(SEGMENTOS.hamburgueria, 'producao', 'mercado', indice(s))).toBeCloseTo(2000 * 1.05, 6);
  });

  it('depois do nivel 5, o equipamento rende metade por nivel', () => {
    expect(nivelEfetivo(5)).toBe(5);
    expect(nivelEfetivo(8)).toBe(6.5);
    const a = jogo('confeccao', { equipNivel: 5 }), b = jogo('confeccao', { equipNivel: 6 });
    const ganho = capacidades(b).capacidade / capacidades(a).capacidade;
    expect(ganho).toBeGreaterThan(1.05);
    expect(ganho).toBeLessThan(1.1);
  });
});

describe('controles internos', () => {
  it('o desvio de caixa so acontece sem ninguem no administrativo', () => {
    const s = jogo('hamburgueria');
    s.func = { producao: 5, comercial: 3, adm: 0 };
    s.hist.push({ receita: 100000 });
    expect(EVENTOS.desvio.cond(s)).toBe(true);
    s.func.adm = 1;
    expect(EVENTOS.desvio.cond(s)).toBe(false);
  });
});

describe('estado salvo da versao 2', () => {
  it('ganha Selic, concorrencia, indice e Pronampe pos-fixado, e segue jogando', () => {
    const s = jogar({ segmento: 'confeccao', meses: 8, seed: 3 });
    // volta o estado ao formato da v2
    s.v = 2;
    s.ajusteJuros = 0.003;
    for (const k of ['selic', 'selicTendencia', 'concorrencia', 'carteira', 'contratoFornecedor', 'contratoCliente', 'fornecedorArriscado', 'indice']) delete s[k];
    for (const k of ['modoPreco', 'margemAlvo', 'seguro']) delete s.dec[k];
    s.emprestimos = [{ nome: 'Pronampe', saldo: 30000, taxa: 0.016, amort: 1000 }];
    s.evento = { id: 'juros', titulo: 'x', texto: 'x', dados: { delta: 0.003 }, opcoes: ['Entendi'] };
    migrarEstado(s);
    expect(s.v).toBe(VERSAO_ESTADO);
    expect(s.selic).toBeCloseTo(0.175, 6);
    expect(s.emprestimos[0].posFixado).toBe(true);
    expect(s.evento).toBe(null);
    expect(s.indice).toBe(1);
    const rnd = semente(2);
    for (let m = 0; m < 14 && !s.fim; m++) {
      expect(() => fecharMes(s, rnd)).not.toThrow();
      if (s.evento) resolverEvento(s, 0, rnd);
    }
  });

  it('um acontecimento salvo que deixou de existir e so descartado', () => {
    const s = jogo();
    s.evento = { id: 'coisaAntiga', titulo: 'x', texto: 'x', dados: {}, opcoes: ['Ok'] };
    expect(resolverEvento(s, 0).msg).toBe('Acontecimento encerrado.');
    expect(s.evento).toBe(null);
  });
});

describe('todo acontecimento em todo ramo', () => {
  it('monta, resolve cada opcao e o mes seguinte fecha', () => {
    for (const segmento of Object.keys(SEGMENTOS)) {
      const base = jogar({ segmento, meses: 14, seed: 21 });
      base.fim = null;
      base.caixa = 500000;
      base.func.adm = 0;
      base.dec.prazo = true;
      base.recebiveis.push({ mes: base.mes + 1, valor: 20000 });
      for (const id of Object.keys(EVENTOS)) {
        if (!EVENTOS[id].cond(base)) continue;
        const n = EVENTOS[id].montar(base, semente(1)).opcoes.length;
        for (let i = 0; i < n; i++) {
          const s = structuredClone(base);
          expect(() => viver(s, EVENTOS, id, i)).not.toThrow();
          expect(() => fechar(s, 1)).not.toThrow();
          expect(Number.isFinite(s.caixa)).toBe(true);
        }
      }
    }
  });
});
