import {
  SEG, clamp, soma, patrimonio, valorEmpresa, capacidades, demandaEsperada, totalReceber, nivelEfetivo,
} from './empresa.js';
import { custoEquip, NIVEL_MAX_EQUIP } from './acoes.js';
import { comparativoDoAno, trocarRegime } from './simulacao.js';
import { REGIMES, NOME_REGIME, HONORARIOS, MESES, CONCORRENCIA_MAX } from './regras.js';
import { brl, brl2, num, pct } from './formato.js';

const mesNome = m => `${MESES[m % 12].toLowerCase()} do ano ${Math.floor(m / 12) + 1}`;
// Contratos valem ate antes do mes `ate`: o ultimo mes de contrato e ate - 1.
const fimDe = ate => `o fim de ${mesNome(ate - 1)}`;
const contratoAtivo = s => !!(s.contratoFornecedor && s.mes < s.contratoFornecedor.ate);
const efeitoAtivo = (s, tipo) => s.efeitos.filter(e => e.tipo === tipo && e.ate > s.mes).reduce((m, e) => m * e.mult, 1);
const DESCONTO_FORNECEDOR_NOVO = 0.08;
// Quantidade do contrato com a rede que entra no mes corrente.
export function qtdContratoCliente(s) {
  return s.contratoCliente && s.mes < s.contratoCliente.ate ? s.contratoCliente.qtd : 0;
}
// Margem liquida dos ultimos 12 meses.
function margem12(s) {
  const h = s.hist.slice(-12), r = soma(h, x => x.receita);
  return r > 0 ? soma(h, x => x.lucro) / r : 0;
}
// Media de unidades vendidas (ou produzidas, na industria) nos ultimos 3 meses.
function volumeMedio(s) {
  const h = s.hist.slice(-3);
  return h.length ? soma(h, x => (SEG(s).estocavel ? x.produzido : x.vendidos)) / h.length : 0;
}
// Investimento com caixa: vai para o imobilizado (o mesmo caminho das compras da aba Producao).
function investir(s, custo) {
  s.caixa -= custo;
  s.imobilizado += custo;
  s.investidoMes += custo;
}

// Acontecimentos sorteados no fechamento do mes. O estado guarda so { id, dados, titulo,
// texto, opcoes } — serializavel — e a escolha e resolvida por EVENTOS[id].resolver.

export const EVENTOS = {
  pedido: {
    cond: s => s.hist.length > 0 && s.hist.at(-1).vendidos > 50,
    montar(s, rnd) {
      const seg = SEG(s);
      const qtd = Math.max(50, Math.round(s.hist.at(-1).vendidos * (0.25 + 0.3 * rnd()) / 10) * 10);
      const preco = Math.round(s.dec.preco * 0.8 * 100) / 100;
      // O pedido consome oferta (producao/estoque), nao atendimento: so tira cliente normal
      // quando a oferta nao cobre os dois.
      // No plano manual da industria, a producao planejada nao sobe sozinha com o pedido.
      const c = capacidades(s, s.dec.func);
      const manual = seg.estocavel && !s.dec.producaoAuto;
      const producao = manual ? Math.min(s.dec.producao, c.capacidade) : c.capacidade;
      const oferta = seg.estocavel ? s.estoque + producao : producao;
      const jaPedido = soma(s.pedidos, p => p.qtd) + qtdContratoCliente(s);
      const ocupado = jaPedido + Math.min(Math.round(demandaEsperada(s)), c.cobertura);
      const folga = Math.max(0, oferta - ocupado);
      const cabeSeProduzir = manual && qtd <= s.estoque + c.capacidade - ocupado;
      const aviso = qtd > folga
        ? ` Capacidade livre prevista: ${num(folga)} ${seg.unidades}; o que passar disso sai dos seus clientes normais, que pagam ${brl2(s.dec.preco)}.${cabeSeProduzir ? ` Para não tirar clientes, suba o plano de produção na aba ${seg.setorProd}.` : ''}`
        : ` Capacidade livre prevista: ${num(folga)} ${seg.unidades}, o pedido cabe sem tirar ninguém.`;
      return {
        titulo: seg.tipo === 'servico' ? 'Um projeto grande na mesa' : 'Pedido grande',
        texto: `Um cliente corporativo quer ${num(qtd)} ${seg.unidades} a ${brl2(preco)} cada, 20% abaixo do seu preço, com pagamento em 60 dias. O pedido é atendido antes dos clientes normais.${aviso}`,
        dados: { qtd, preco }, opcoes: ['Aceitar o pedido', 'Recusar'],
      };
    },
    resolver(s, i, d) {
      if (i === 0) {
        s.pedidos.push({ qtd: d.qtd, preco: d.preco, prazo: 2 });
        return 'Pedido aceito. A receita entra no resultado deste mês; o dinheiro, daqui a dois meses.';
      }
      return 'Pedido recusado.';
    },
  },
  proposta: {
    cond: s => s.func.producao >= 2,
    montar(s) {
      return {
        titulo: 'Proposta da concorrência',
        texto: `${SEG(s).melhorProd} recebeu uma proposta de um concorrente e pediu um aumento de R$ 450 por mês para ficar.`,
        dados: {}, opcoes: ['Dar o aumento (+R$ 450/mês)', 'Deixar sair'],
      };
    },
    resolver(s, i) {
      if (i === 0) {
        s.salExtra += 450;
        s.M = clamp(s.M + 3, 0, 100);
        return 'Aumento concedido. A equipe notou.';
      }
      s.func.producao--;
      s.dec.func.producao = Math.min(s.dec.func.producao, s.func.producao);
      s.M = clamp(s.M - 4, 0, 100);
      return `${SEG(s).pronomeProd} foi embora. A equipe ${SEG(s).noSetorProd} ficou menor.`;
    },
  },
  quebra: {
    cond: () => true,
    montar(s) {
      const custo = Math.round(SEG(s).equipCusto * 0.12 / 100) * 100;
      const coberto = s.dec.seguro ? Math.round(custo * 0.2 / 100) * 100 : null;
      return {
        titulo: 'Equipamento quebrou',
        texto: `O principal equipamento parou. O conserto sai por ${brl(custo)}${coberto !== null ? `, mas o seguro cobre tudo menos a franquia de ${brl(coberto)}` : ''}. Sem conserto, a produção deste mês cai 30%.`,
        dados: { custo, coberto }, opcoes: [`Consertar (${brl(coberto ?? custo)})`, 'Seguir sem consertar'],
      };
    },
    resolver(s, i, d) {
      if (i === 0) {
        s.extras += d.coberto ?? d.custo;
        return d.coberto !== null && d.coberto !== undefined ? 'Conserto feito; o seguro pagou o resto.' : 'Conserto feito. Entra nas despesas do mês.';
      }
      s.efeitos.push({ tipo: 'producao', mult: 0.7, ate: s.mes + 1 });
      return 'Produção a 70% neste mês.';
    },
  },
  influenciador: {
    cond: s => SEG(s).tipo !== 'servico',
    montar() {
      return {
        titulo: 'Parceria com influenciador',
        texto: 'Um influenciador da cidade oferece uma série de posts sobre a sua marca por R$ 5.000. O resultado é incerto.',
        dados: {}, opcoes: ['Fechar a parceria (R$ 5.000)', 'Dispensar'],
      };
    },
    resolver(s, i, d, rnd) {
      if (i !== 0) return 'Proposta dispensada.';
      s.extras += 5000;
      const ganho = Math.round(4 + rnd() * 20);
      s.A = clamp(s.A + ganho, 0, 100);
      return ganho > 14 ? `Os posts viralizaram: reputação +${ganho}.` : `Resultado modesto: reputação +${ganho}.`;
    },
  },
  investidor: {
    // Sem piso: 20% depois do aporte so e justo ate 25% do valor de antes. Um piso fixo pagava
    // acima disso a quem estava quebrando, e aceitar virava dinheiro gratis.
    cond: s => !s.investidorUsado && s.mes >= 6 && s.participacao === 1 && patrimonio(s) > 0 && ofertaInvestidor(s) >= 10000,
    montar(s) {
      const valor = ofertaInvestidor(s);
      return {
        titulo: 'Proposta de investidor',
        texto: `Um investidor-anjo oferece ${brl(valor)} por 20% da empresa. O dinheiro entra no caixa da empresa, e 20% do valor dela passa a ser dele até o fim do jogo. Pelo critério do jogo, a empresa vale hoje cerca de ${brl(valorEmpresa(s))}; a oferta a avalia em ${brl(4 * valor)} antes do aporte.`,
        dados: { valor }, opcoes: ['Aceitar o investimento', 'Recusar'],
      };
    },
    resolver(s, i, d) {
      s.investidorUsado = true;
      if (i !== 0) return 'Você continua com 100% da empresa.';
      s.caixa += d.valor;
      s.captadoMes += d.valor;
      s.participacao = 0.8;
      return `${brl(d.valor)} no caixa. Você agora tem 80% da empresa.`;
    },
  },
  // Concorrente que se instala de vez (a fatia que ele toma so diminui aos poucos). O lucro alto
  // atrai: o peso cresce com a margem dos ultimos 12 meses.
  concorrente: {
    cond: s => s.mes >= 8 && s.concorrencia < CONCORRENCIA_MAX - 0.05,
    peso: s => 1 + 6 * Math.max(0, margem12(s)),
    montar(s) {
      const custo = Math.round(SEG(s).mkEscala * 1.2 / 100) * 100;
      return {
        titulo: 'Concorrente novo na região',
        texto: `Uma empresa do mesmo ramo abriu perto dos seus clientes${margem12(s) > 0.12 ? ', atraída pelo movimento que você criou' : ''}. Sem reação, ela deve ficar com cerca de 10% da sua procura, e só vai perdendo força aos poucos.`,
        dados: { custo }, opcoes: [`Campanha de fidelização (${brl(custo)})`, 'Não reagir'],
      };
    },
    resolver(s, i, d) {
      if (i === 0) {
        s.extras += d.custo;
        s.concorrencia = clamp(s.concorrencia + 0.04, 0, CONCORRENCIA_MAX);
        return 'Campanha no ar. A perda deve ficar perto de 4% da procura.';
      }
      s.concorrencia = clamp(s.concorrencia + 0.1, 0, CONCORRENCIA_MAX);
      return 'O concorrente ficou com uma parte dos seus clientes.';
    },
  },
  guerraPrecos: {
    cond: s => s.mes >= 6 && efeitoAtivo(s, 'precoMercado') === 1,
    montar(s) {
      const verba = Math.round(SEG(s).mkEscala * 0.8 / 100) * 100;
      return {
        titulo: 'Guerra de preços',
        texto: `Um concorrente baixou os preços em 12% para ganhar clientes. Pelos próximos 4 meses, o preço que o mercado aceita fica mais baixo: quem cobrar o mesmo de antes vai vender menos.`,
        dados: { verba }, opcoes: ['Acompanhar: baixar meu preço 10%', `Diferenciar: reforço de marketing (${brl(verba)})`, 'Manter o preço'],
      };
    },
    resolver(s, i, d) {
      s.efeitos.push({ tipo: 'precoMercado', mult: 0.88, ate: s.mes + 4 });
      if (i === 0) {
        s.dec.modoPreco = 'preco';
        s.dec.preco = Math.round(s.dec.preco * 0.9 * 100) / 100;
        return 'Preço reduzido em 10%. A margem por unidade caiu; confira o ponto de equilíbrio na aba Comercial.';
      }
      if (i === 1) {
        s.extras += d.verba;
        s.A = clamp(s.A + 8, 0, 100);
        return 'Campanha no ar: reputação +8. Quem gosta da marca paga um pouco mais.';
      }
      return 'Preço mantido. A procura deve cair enquanto durar a promoção do concorrente.';
    },
  },
  fiscalizacao: {
    cond: s => s.hist.length > 0,
    montar(s) {
      const h = s.hist.at(-1);
      const multa = Math.round(h.receita * (h.desorg ? 0.06 : 0.012) / 100) * 100 + 500;
      return {
        titulo: 'Fiscalização',
        texto: h.desorg
          ? `A fiscalização encontrou documentos atrasados e folha de pagamento desorganizada. Faltou gente no administrativo. Multa de ${brl(multa)}.`
          : `A fiscalização encontrou uma falha pequena em obrigações acessórias. Multa de ${brl(multa)}.`,
        dados: { multa }, opcoes: ['Pagar a multa', 'Contestar com advogado (R$ 3.000)'],
      };
    },
    resolver(s, i, d, rnd) {
      if (i === 0) {
        s.extras += d.multa;
        return 'Multa paga.';
      }
      s.extras += 3000;
      if (rnd() < 0.55) return 'Auto de infração anulado. Valeu o advogado.';
      s.extras += d.multa * 1.2;
      return 'Contestação perdida: multa com juros e o honorário do advogado.';
    },
  },
  materia: {
    cond: () => true,
    montar(s) {
      const seg = SEG(s), aumento = Math.round(s.custoMat * 0.12 * 100) / 100;
      const travado = contratoAtivo(s);
      return {
        titulo: 'Reajuste no mercado de insumos',
        texto: `O preço de ${seg.insumo} subiu 12% no mercado.`
          + (travado
            ? ` O seu contrato com o fornecedor trava o preço até ${fimDe(s.contratoFornecedor.ate)}: o reajuste não chega a você por enquanto. Os concorrentes repassaram, e o preço de mercado sobe ${brl2(aumento)}.`
            : ` Os concorrentes também repassaram: o preço de mercado sobe ${brl2(aumento)} por ${seg.unidade} (${pct(aumento / s.precoRef, 1)}).`),
        dados: { aumento, margem: s.dec.modoPreco === 'margem' },
        opcoes: s.dec.modoPreco === 'margem'
          ? ['Seguir com a margem (o preço acompanha o custo)', `Repassar só o aumento do mercado (+${brl2(aumento)})`]
          : ['Manter o preço', `Repassar o aumento (+${brl2(aumento)})`],
      };
    },
    resolver(s, i, d) {
      // o reajuste atinge os concorrentes: o preco de mercado sobe o mesmo valor em reais
      s.precoRef += d.aumento;
      if (contratoAtivo(s)) s.custoContratoAdiado = (s.custoContratoAdiado || 1) * 1.12;
      else s.custoMat *= 1.12;
      if (i === 0 && d.margem) {
        s.dec.modoPreco = 'margem';
        return 'O preço segue a margem: no fechamento ele sobe junto com o custo.';
      }
      if (i === 1) {
        s.dec.modoPreco = 'preco';
        s.dec.preco = Math.round((s.dec.preco + d.aumento) * 100) / 100;
        return 'Preço reajustado no mesmo valor do mercado.';
      }
      return 'Preço mantido. Com o mercado mais caro, seu preço ficou relativamente menor: a procura sobe e a margem por unidade cai.';
    },
  },
  reclamacao: {
    cond: s => s.Q < 48,
    montar() {
      return {
        titulo: 'Reclamação viralizou',
        texto: 'Um cliente insatisfeito publicou um vídeo sobre a qualidade do seu produto, e o vídeo está circulando.',
        dados: {}, opcoes: ['Responder e reembolsar (R$ 2.500)', 'Ignorar'],
      };
    },
    resolver(s, i) {
      if (i === 0) {
        s.extras += 2500;
        s.A = clamp(s.A - 3, 0, 100);
        return 'Resposta bem recebida. Estrago pequeno.';
      }
      s.A = clamp(s.A - 14, 0, 100);
      return 'A reputação caiu bastante.';
    },
  },
  reportagem: {
    cond: s => s.Q > 68,
    montar() {
      return {
        titulo: 'Saiu no jornal',
        texto: 'Um jornal local fez uma matéria elogiando a qualidade do que você vende. Publicidade de graça.',
        dados: {}, opcoes: ['Ótimo'],
      };
    },
    resolver(s) {
      s.A = clamp(s.A + 10, 0, 100);
      return 'Reputação +10.';
    },
  },
  credito: {
    cond: s => !s.creditoUsado && s.mes >= 4 && s.equipNivel < NIVEL_MAX_EQUIP,
    montar(s) {
      const custo = custoEquip(s);
      return {
        titulo: 'Linha de crédito para máquinas',
        texto: `Um banco de fomento oferece financiar o próximo nível de equipamento (${brl(custo)}) a 1,2% ao mês, em 48 parcelas. Produtividade +${Math.round(SEG(s).ganhoEquip * (nivelEfetivo(s.equipNivel + 1) - nivelEfetivo(s.equipNivel)) * 100)}%.`,
        dados: { custo }, opcoes: ['Financiar o equipamento', 'Agora não'],
      };
    },
    resolver(s, i, d) {
      s.creditoUsado = true;
      if (i !== 0) return 'Oferta recusada.';
      s.equipNivel++;
      s.imobilizado += d.custo;
      // financiado direto ao fornecedor: nao passa pelo caixa (CPC 03, item 43)
      s.financiadoMes = (s.financiadoMes || 0) + d.custo;
      s.emprestimos.push({ nome: 'Finame (equipamento)', saldo: d.custo, taxa: 0.012, amort: d.custo / 48 });
      return 'Equipamento novo instalado, pago em 48 meses.';
    },
  },

  // --- fornecedores ---
  fornecedorNovo: {
    // uma vez por partida: sem isso, descontos de fornecedores novos se empilhavam
    cond: s => !s.fornecedorNovoUsado && !s.fornecedorArriscado && !contratoAtivo(s) && s.mes >= 3,
    montar(s) {
      const seg = SEG(s);
      return {
        titulo: 'Fornecedor mais barato',
        texto: `Um fornecedor novo oferece ${seg.insumo} 8% mais baratos (${brl2(s.custoMat * (1 - DESCONTO_FORNECEDOR_NOVO))} em vez de ${brl2(s.custoMat)} por ${seg.unidade}). Ele não tem histórico: em cerca de 1 mês a cada 5 ele atrasa, e a produção daquele mês cai 40%.`,
        dados: {}, opcoes: ['Trocar de fornecedor', 'Ficar com o atual'],
      };
    },
    resolver(s, i) {
      s.fornecedorNovoUsado = true;
      if (i !== 0) return 'Você ficou com o fornecedor de sempre.';
      s.custoMat *= 1 - DESCONTO_FORNECEDOR_NOVO;
      s.fornecedorArriscado = true;
      return 'Custo 8% menor. Em cerca de 1 mês a cada 5, a entrega pode atrasar.';
    },
  },
  negociacao: {
    cond: s => !contratoAtivo(s) && s.mes >= 3,
    montar(s) {
      const seg = SEG(s);
      return {
        titulo: 'Fornecedor quer reajuste',
        texto: `O seu fornecedor de ${seg.insumo} quer reajustar 10% só para você, alegando frete mais caro. Os concorrentes não tiveram aumento, então o preço de mercado não muda.`,
        dados: {}, opcoes: ['Aceitar os 10%', 'Negociar', 'Trocar de fornecedor'],
      };
    },
    resolver(s, i, d, rnd) {
      if (i === 0) {
        s.custoMat *= 1.10;
        return 'Reajuste de 10% aceito.';
      }
      if (i === 1) {
        if (rnd() < 0.55) {
          s.custoMat *= 1.04;
          return 'Negociação bem-sucedida: o reajuste ficou em 4%.';
        }
        s.custoMat *= 1.10;
        return 'O fornecedor não cedeu: reajuste de 10%.';
      }
      s.efeitos.push({ tipo: 'producao', mult: 0.85, ate: s.mes + 1 });
      // saindo do fornecedor barato, volta a pagar o preco de mercado
      if (s.fornecedorArriscado) s.custoMat /= 1 - DESCONTO_FORNECEDOR_NOVO;
      s.fornecedorArriscado = false;
      return 'Fornecedor trocado sem aumento sobre o preço de mercado. A transição deve custar 15% da produção neste mês.';
    },
  },
  contratoFornecedor: {
    cond: s => !contratoAtivo(s) && s.mes >= 4 && volumeMedio(s) > 50,
    montar(s) {
      const seg = SEG(s), minimo = Math.round(volumeMedio(s) * 0.7 / 10) * 10;
      return {
        titulo: 'Contrato com o fornecedor',
        texto: `O fornecedor de ${seg.insumo} propõe um contrato de 12 meses: 6% de desconto e preço travado, sem os reajustes do mercado. No fim, o custo volta ao preço de mercado da época. Em troca, você se compromete a comprar pelo menos ${num(minimo)} ${seg.unidades} por mês; o que faltar paga 30% do valor como multa.`,
        dados: { minimo }, opcoes: ['Assinar o contrato', 'Recusar'],
      };
    },
    resolver(s, i, d) {
      if (i !== 0) return 'Contrato recusado. Você segue livre, e exposto aos reajustes.';
      s.custoMat *= 0.94;
      // o desconto vale so durante o contrato: no fim, o custo volta ao de mercado
      s.contratoFornecedor = { ate: s.mes + 12, minimo: d.minimo, desconto: 0.94 };
      s.custoContratoAdiado = 1;
      return `Contrato assinado até ${fimDe(s.mes + 12)}.`;
    },
  },

  // --- clientes ---
  grandeContrato: {
    cond: s => s.mes >= 6 && !(s.contratoCliente && s.mes < s.contratoCliente.ate) && s.hist.length > 0 && s.hist.at(-1).vendidos > 60,
    montar(s) {
      const seg = SEG(s), qtd = Math.max(10, Math.round(s.hist.at(-1).vendidos * 0.2 / 10) * 10);
      const preco = Math.round(s.dec.preco * 0.82 * 100) / 100;
      return {
        titulo: seg.tipo === 'servico' ? 'Contrato com uma rede' : 'Contrato de fornecimento',
        texto: `Uma rede quer ${num(qtd)} ${seg.unidades} por mês durante 12 meses, a ${brl2(preco)} cada (18% abaixo do seu preço), pagando no mês seguinte. O contrato é atendido antes dos clientes normais, e cada unidade que faltar paga 30% do preço como multa. Garante volume; aperta a margem e a capacidade.`,
        dados: { qtd, preco }, opcoes: ['Assinar por 12 meses', 'Recusar'],
      };
    },
    resolver(s, i, d) {
      if (i !== 0) return 'Contrato recusado.';
      s.contratoCliente = { qtd: d.qtd, preco: d.preco, ate: s.mes + 12 };
      return `Contrato assinado: ${num(d.qtd)} ${SEG(s).unidades} por mês até ${fimDe(s.mes + 12)}.`;
    },
  },
  inadimplencia: {
    cond: s => totalReceber(s) > 5000,
    montar(s) {
      const perda = Math.round(totalReceber(s) * 0.25 / 100) * 100;
      return {
        titulo: 'Cliente não vai pagar',
        texto: `Um cliente que comprou a prazo entrou em recuperação judicial: ${brl(perda)} das suas contas a receber não devem ser pagos. A perda entra no resultado; o caixa não muda, porque esse dinheiro nunca entrou.`,
        dados: { perda }, opcoes: ['Registrar a perda', 'Cobrar na justiça (R$ 2.000)'],
      };
    },
    resolver(s, i, d, rnd) {
      if (i === 0) {
        s.perdasMes = (s.perdasMes || 0) + d.perda;
        return `Perda de ${brl(d.perda)} registrada no fechamento deste mês.`;
      }
      s.extras += 2000;
      if (rnd() < 0.4) {
        s.perdasMes = (s.perdasMes || 0) + d.perda / 2;
        return `Acordo na justiça: metade recuperada. Perda de ${brl(d.perda / 2)}.`;
      }
      s.perdasMes = (s.perdasMes || 0) + d.perda;
      return 'Nada recuperado, e o advogado custou R$ 2.000.';
    },
  },

  // --- pessoas e controles ---
  desvio: {
    cond: s => s.func.adm === 0 && s.func.producao + s.func.comercial >= 7 && s.hist.length > 0,
    montar(s) {
      const valor = Math.round(s.hist.at(-1).receita * 0.03 / 100) * 100 + 1000;
      return {
        titulo: 'O caixa não fecha',
        texto: `Faltam ${brl(valor)}: um funcionário vinha desviando dinheiro do caixa. Sem ninguém no administrativo, ninguém conferia. Uma auditoria custa R$ 4.000 e pode recuperar parte do valor.`,
        dados: { valor }, opcoes: ['Contratar auditoria (R$ 4.000)', 'Demitir e assumir a perda'],
      };
    },
    resolver(s, i, d, rnd) {
      // o funcionario e demitido por justa causa (sem rescisao)
      if (s.func.comercial > 0) s.func.comercial--;
      else if (s.func.producao > 1) s.func.producao--;
      for (const k of ['producao', 'comercial']) s.dec.func[k] = Math.min(s.dec.func[k], s.func[k]);
      if (i === 0) {
        s.extras += 4000;
        if (rnd() < 0.6) {
          s.extras += d.valor * 0.4;
          return `Auditoria feita: 60% recuperados. Perda de ${brl(d.valor * 0.4)}. Um administrativo evitaria isso.`;
        }
        s.extras += d.valor;
        return 'A auditoria confirmou o desvio, mas o dinheiro não voltou.';
      }
      s.extras += d.valor;
      return `Perda de ${brl(d.valor)}. Controle custa menos que desvio: considere um administrativo.`;
    },
  },
  trabalhista: {
    cond: s => s.mes >= 6 && (s.politicaPaga === 'abaixo' || s.M < 50),
    montar(s) {
      const pedido = Math.round(salarioMedio(s) * 6 / 100) * 100;
      return {
        titulo: 'Ação trabalhista',
        texto: `Um ex-funcionário entrou na justiça pedindo ${brl(pedido)} em horas extras e diferenças salariais. Um acordo agora sai por 60% do pedido. Defender custa R$ 3.000 de advogado; metade das ações assim é perdida, e aí a conta vem com juros.`,
        dados: { pedido }, opcoes: [`Fazer acordo (${brl(pedido * 0.6)})`, 'Defender na justiça'],
      };
    },
    resolver(s, i, d, rnd) {
      if (i === 0) {
        s.extras += d.pedido * 0.6;
        return 'Acordo homologado.';
      }
      s.extras += 3000;
      if (rnd() < 0.5) return 'Ação julgada improcedente.';
      s.extras += d.pedido * 1.2;
      return `Ação perdida: ${brl(d.pedido * 1.2)} com juros e correção.`;
    },
  },

  // --- crescimento arriscado ---
  oportunidade: {
    cond: s => s.mes >= 10 && s.caixa > custoOportunidade(s) * 1.2,
    peso: () => 0.7,
    montar(s) {
      const seg = SEG(s), custo = custoOportunidade(s);
      return {
        titulo: 'Concorrente à venda',
        texto: `Um concorrente vai fechar e oferece ${seg.tipo === 'servico' ? 'a carteira de clientes' : 'o ponto e a clientela'} por ${brl(custo)}. Se a transição der certo, você fica com os clientes dele (mercado +25%). Se não der, a maioria vai para outro lugar e sobra pouco (mercado +5%). Pela experiência do setor, dá certo em 6 de cada 10 casos.`,
        dados: { custo }, opcoes: [`Comprar (${brl(custo)})`, 'Deixar passar'],
      };
    },
    resolver(s, i, d, rnd) {
      if (i !== 0) return 'Oportunidade dispensada.';
      if (s.caixa < d.custo) return 'O caixa já não comportava a compra. Oportunidade perdida.';
      investir(s, d.custo);
      if (rnd() < 0.6) {
        s.mercadoMult *= 1.25;
        s.concorrencia = clamp(s.concorrencia - 0.05, 0, CONCORRENCIA_MAX);
        return 'Deu certo: os clientes vieram junto. Mercado +25%.';
      }
      s.mercadoMult *= 1.05;
      return 'A transição não pegou: a maioria dos clientes foi embora. Mercado só +5%.';
    },
  },
};

function salarioMedio(s) {
  const seg = SEG(s);
  return (seg.salProd + seg.salCom + seg.salAdm) / 3;
}

function custoOportunidade(s) {
  const seg = SEG(s);
  return Math.round(seg.mercado * seg.precoRef * 0.6 * s.mercadoMult / 5000) * 5000;
}

export function ofertaInvestidor(s) {
  return Math.floor(valorEmpresa(s) * 0.22 / 5000) * 5000;
}

// --- Crises externas: atingem o mercado inteiro, algumas com aviso antes ---
export const CRISES = {
  recessao: {
    cond: s => s.economia > 0.85,
    montar(s) {
      const de = s.mes + 2;
      return {
        titulo: 'Recessão à vista',
        texto: `Os economistas preveem uma recessão a partir de ${mesNome(de)}: a procura deve cair cerca de 15% por 6 meses, em todo o mercado. Dá tempo de se preparar: reforçar o caixa, segurar contratações e não encher o estoque.`,
        dados: { de }, opcoes: ['Entendi'],
      };
    },
    resolver(s, i, d) {
      s.efeitos.push({ tipo: 'demanda', mult: 0.85, de: d.de, ate: d.de + 6 });
      return `Recessão marcada para começar em ${mesNome(d.de)}.`;
    },
  },
  insumos: {
    cond: () => true,
    montar(s) {
      const seg = SEG(s);
      return {
        titulo: 'Choque de custos',
        texto: `A alta do dólar e uma quebra de safra encareceram ${seg.insumo} em 15%, de uma vez. Os concorrentes repassam só uma parte: o preço de mercado sobe 6%.${contratoAtivo(s) ? ' O seu contrato com o fornecedor segura o seu custo até o fim dele.' : ''}`,
        dados: {}, opcoes: ['Entendi'],
      };
    },
    resolver(s) {
      if (contratoAtivo(s)) s.custoContratoAdiado = (s.custoContratoAdiado || 1) * 1.15;
      else s.custoMat *= 1.15;
      s.precoRef *= 1.06;
      return contratoAtivo(s) ? 'O contrato segurou o seu custo, por enquanto.' : 'Custo dos insumos +15%. Confira a margem na aba Comercial.';
    },
  },
  greve: {
    cond: s => SEG(s).tipo !== 'servico',
    montar(s) {
      const frete = Math.round(SEG(s).mkEscala * 0.6 / 100) * 100;
      return {
        titulo: 'Greve dos caminhoneiros',
        texto: `Estradas bloqueadas: ${SEG(s).insumo} não chegam. Sem providência, a produção deste mês cai pela metade${SEG(s).estocavel ? ' (o estoque que você já tem continua vendendo)' : ''}. Um frete alternativo por ${brl(frete)} garante boa parte da entrega.`,
        dados: { frete }, opcoes: [`Pagar frete alternativo (${brl(frete)})`, 'Esperar a greve passar'],
      };
    },
    resolver(s, i, d) {
      if (i === 0) {
        s.extras += d.frete;
        s.efeitos.push({ tipo: 'producao', mult: 0.85, ate: s.mes + 1 });
        return 'Frete pago: a produção cai só 15% neste mês.';
      }
      s.efeitos.push({ tipo: 'producao', mult: 0.5, ate: s.mes + 1 });
      return 'Produção pela metade neste mês.';
    },
  },
  enchente: {
    cond: () => true,
    montar(s) {
      const dano = Math.round((s.imobilizado - s.deprecAcum) * 0.05 / 100) * 100 + 2000;
      return {
        titulo: 'Temporal alagou o bairro',
        texto: `Uma chuva forte alagou a região. O estrago nas instalações é de ${brl(dano)}${s.dec.seguro ? ', coberto pelo seguro menos a franquia de 20%' : ''}, e o movimento deste mês cai 30%.`,
        dados: { dano }, opcoes: ['Entendi'],
      };
    },
    resolver(s, i, d) {
      const pago = s.dec.seguro ? d.dano * 0.2 : d.dano;
      s.extras += pago;
      s.efeitos.push({ tipo: 'demanda', mult: 0.7, ate: s.mes + 1 });
      return s.dec.seguro ? `O seguro cobriu o estrago; você pagou a franquia de ${brl(pago)}.` : `Reparos de ${brl(pago)} por sua conta. Um seguro teria coberto 80%.`;
    },
  },
  apagao: {
    cond: () => true,
    montar(s) {
      const servico = SEG(s).tipo === 'servico';
      return {
        titulo: servico ? 'Ataque hacker' : 'Apagão no bairro',
        texto: servico
          ? 'Um ransomware travou os computadores da equipe. Sem especialista, a produção deste mês cai 30%. Um especialista em segurança resolve em dois dias por R$ 6.000.'
          : 'A distribuidora de energia deixou o bairro sem luz por vários dias. Sem gerador, a produção deste mês cai 30%. Alugar um gerador custa R$ 6.000.',
        dados: {}, opcoes: [servico ? 'Contratar o especialista (R$ 6.000)' : 'Alugar gerador (R$ 6.000)', 'Esperar'],
      };
    },
    resolver(s, i) {
      if (i === 0) {
        s.extras += 6000;
        s.efeitos.push({ tipo: 'producao', mult: 0.92, ate: s.mes + 1 });
        return 'Resolvido rápido: produção −8% neste mês.';
      }
      s.efeitos.push({ tipo: 'producao', mult: 0.7, ate: s.mes + 1 });
      return 'Produção a 70% neste mês.';
    },
  },
  obras: {
    cond: s => SEG(s).tipo !== 'servico',
    montar(s) {
      const verba = Math.round(SEG(s).mkEscala * 0.5 / 100) * 100;
      const delivery = s.expansoes.some(e => ['delivery', 'loja', 'app'].includes(e));
      return {
        titulo: 'Rua fechada para obras',
        texto: `A prefeitura vai fechar a sua rua para obras por 3 meses, começando agora. O movimento deve cair ${delivery ? '10% (as vendas pela internet seguram parte)' : '25%'}. Uma campanha "estamos abertos" por ${brl(verba)} reduz a perda.`,
        dados: { verba, perda: delivery ? 0.9 : 0.75 }, opcoes: [`Fazer a campanha (${brl(verba)})`, 'Esperar as obras'],
      };
    },
    resolver(s, i, d) {
      const mult = i === 0 ? 1 - (1 - d.perda) * 0.5 : d.perda;
      if (i === 0) s.extras += d.verba;
      s.efeitos.push({ tipo: 'demanda', mult, ate: s.mes + 3 });
      return `Movimento a ${pct(mult)} do normal pelos próximos 3 meses.`;
    },
  },
};

// Decisao do regime em janeiro: o comparativo do ano que acabou, com os honorarios do contador.
export function eventoRegime(s) {
  const ano = s.mes / 12 - 1;
  const { tot, meses } = comparativoDoAno(s, ano);
  const custo = r => (tot[r] === null ? null : tot[r] + HONORARIOS[r] * meses * (s.indice || 1) / 1.05);
  const disponiveis = REGIMES.filter(r => !(r === 'simples' && s.excluidoSimples));
  const ordem = [s.regime, ...disponiveis.filter(r => r !== s.regime)].filter(r => disponiveis.includes(r));
  const melhor = disponiveis.filter(r => custo(r) !== null).sort((a, b) => custo(a) - custo(b))[0];
  const linhas = REGIMES.map(r => `<tr${r === melhor ? ' class="destaque"' : ''}><td>${NOME_REGIME[r]}${r === s.regime ? ' (atual)' : ''}</td><td>${custo(r) === null ? 'não se aplica' : brl(custo(r))}</td></tr>`).join('');
  return {
    id: 'regime',
    titulo: `Regime tributário do ano ${ano + 2}`,
    texto: `É janeiro: o único mês para escolher o regime do ano. No ano ${ano + 1}, a mesma operação teria custado, em tributos mais o contador (honorários fictícios do jogo):`
      + `<div class="tab-wrap"><table>${linhas}</table></div>`
      + `<p class="small muted">Se o ano que vem for parecido, ${melhor ? `o ${NOME_REGIME[melhor]} sai mais barato` : 'compare os números'}. Crescimento muda a conta: no Simples a alíquota sobe com a receita; no Lucro Real, só se paga IRPJ e CSLL sobre lucro de verdade.${s.excluidoSimples ? ' O Simples está fechado: a receita do ano passou do limite.' : ''}</p>`,
    dados: { ordem, melhor: Math.max(0, ordem.indexOf(melhor)) },
    opcoes: ordem.map((r, i) => (i === 0 ? `Manter o ${NOME_REGIME[r]}` : `Mudar para o ${NOME_REGIME[r]}`)),
  };
}

const TODOS = () => ({ ...EVENTOS, regime: { resolver: (s, i, d) => trocarRegime(s, d.ordem[i]).msg }, ...CRISES });

function sortearDe(lista, s, rnd) {
  const ids = Object.keys(lista).filter(id => lista[id].cond(s));
  if (!ids.length) return null;
  const pesos = ids.map(id => (lista[id].peso ? lista[id].peso(s) : 1));
  let r = rnd() * soma(pesos, x => x);
  let k = 0;
  while (k < ids.length - 1 && r >= pesos[k]) r -= pesos[k++];
  const id = ids[k];
  return { id, ...lista[id].montar(s, rnd) };
}

export function sortearEvento(s, rnd) { return sortearDe(EVENTOS, s, rnd); }
export function sortearCrise(s, rnd) {
  const e = sortearDe(CRISES, s, rnd);
  return e && { ...e, crise: true };
}

export function resolverEvento(s, opcao, rnd = Math.random) {
  const e = s.evento;
  if (!e) return null;
  const def = TODOS()[e.id];
  // acontecimento de uma versao antiga que deixou de existir: so descarta
  const msg = def ? def.resolver(s, opcao, e.dados, rnd) : 'Acontecimento encerrado.';
  s.evento = null;
  return { titulo: e.titulo, msg };
}
