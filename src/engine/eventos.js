import { SEG, clamp, patrimonio, valorEmpresa } from './empresa.js';
import { brl, brl2, num } from './formato.js';

// Acontecimentos sorteados no fechamento do mes. O estado guarda so { id, dados, titulo,
// texto, opcoes } — serializavel — e a escolha e resolvida por EVENTOS[id].resolver.

export const EVENTOS = {
  pedido: {
    cond: s => s.hist.length > 0 && s.hist.at(-1).vendidos > 50,
    montar(s, rnd) {
      const seg = SEG(s);
      const qtd = Math.max(50, Math.round(s.hist.at(-1).vendidos * (0.25 + 0.3 * rnd()) / 10) * 10);
      const preco = Math.round(s.dec.preco * 0.8 * 100) / 100;
      return {
        titulo: seg.tipo === 'servico' ? 'Um projeto grande na mesa' : 'Pedido grande',
        texto: `Um cliente corporativo quer ${num(qtd)} ${seg.unidades} a ${brl2(preco)} cada, 20% abaixo do seu preço, com pagamento em 60 dias. O pedido é atendido antes dos clientes normais.`,
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
        texto: `Seu melhor ${SEG(s).cargoProd} recebeu uma proposta de um concorrente e pediu um aumento de R$ 450 por mês para ficar.`,
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
      return 'Ele foi embora. A equipe de produção ficou menor.';
    },
  },
  quebra: {
    cond: () => true,
    montar(s) {
      const custo = Math.round(SEG(s).equipCusto * 0.12 / 100) * 100;
      return {
        titulo: 'Equipamento quebrou',
        texto: `O principal equipamento parou. O conserto sai por ${brl(custo)}. Sem conserto, a produção deste mês cai 30%.`,
        dados: { custo }, opcoes: [`Consertar (${brl(custo)})`, 'Seguir sem consertar'],
      };
    },
    resolver(s, i, d) {
      if (i === 0) {
        s.extras += d.custo;
        return 'Conserto feito. Entra nas despesas do mês.';
      }
      s.efeitos.push({ tipo: 'producao', mult: 0.7, ate: s.mes + 1 });
      return 'Produção a 70% neste mês.';
    },
  },
  influenciador: {
    cond: s => s.segmento !== 'software',
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
    cond: s => !s.investidorUsado && s.mes >= 6 && s.participacao === 1 && patrimonio(s) > 0,
    montar(s) {
      const valor = Math.max(60000, Math.round(valorEmpresa(s) * 0.22 / 5000) * 5000);
      return {
        titulo: 'Proposta de investidor',
        texto: `Um investidor-anjo oferece ${brl(valor)} por 20% da empresa. O dinheiro entra no caixa da empresa, e 20% do valor dela passa a ser dele até o fim do jogo.`,
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
  concorrente: {
    cond: () => true,
    montar(s) {
      const custo = Math.round(SEG(s).mkEscala * 1.2 / 100) * 100;
      return {
        titulo: 'Concorrente novo na região',
        texto: 'Uma empresa do mesmo ramo abriu perto dos seus clientes, com preços agressivos. Sem reação, você deve perder cerca de 18% da procura pelos próximos 4 meses.',
        dados: { custo }, opcoes: [`Campanha de fidelização (${brl(custo)})`, 'Não reagir'],
      };
    },
    resolver(s, i, d) {
      if (i === 0) {
        s.extras += d.custo;
        s.efeitos.push({ tipo: 'demanda', mult: 0.94, ate: s.mes + 4 });
        return 'Campanha no ar. A perda deve ficar perto de 6%.';
      }
      s.efeitos.push({ tipo: 'demanda', mult: 0.82, ate: s.mes + 4 });
      return 'Você vai sentir a concorrência pelos próximos 4 meses.';
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
      const servico = SEG(s).tipo === 'servico';
      return {
        titulo: servico ? 'Licenças de software mais caras' : 'Fornecedor reajustou preços',
        texto: servico
          ? 'As ferramentas e servidores que você usa ficaram 12% mais caros.'
          : 'O principal fornecedor reajustou a matéria-prima em 12%.',
        dados: {}, opcoes: ['Absorver o aumento', 'Repassar 6% ao preço'],
      };
    },
    resolver(s, i) {
      s.custoMat *= 1.12;
      if (i === 1) {
        s.dec.preco = Math.round(s.dec.preco * 1.06 * 100) / 100;
        return 'Preço reajustado em 6%.';
      }
      return 'Margem menor, preço mantido.';
    },
  },
  juros: {
    cond: () => true,
    montar(s, rnd) {
      const sobe = rnd() < 0.55 && s.ajusteJuros < 0.01;
      return {
        titulo: sobe ? 'Copom subiu os juros' : 'Copom cortou os juros',
        texto: sobe
          ? 'A Selic subiu. Novos empréstimos de capital de giro ficam 0,3 ponto mais caros por mês.'
          : 'A Selic caiu. Novos empréstimos de capital de giro ficam 0,2 ponto mais baratos por mês.',
        dados: { delta: sobe ? 0.003 : -0.002 }, opcoes: ['Entendi'],
      };
    },
    resolver(s, i, d) {
      s.ajusteJuros = clamp(s.ajusteJuros + d.delta, -0.006, 0.012);
      return 'Taxa atualizada na aba Finanças.';
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
    cond: s => !s.creditoUsado && s.mes >= 4 && s.equipNivel < 5,
    montar(s) {
      const custo = Math.round(SEG(s).equipCusto * (1 + 0.6 * s.equipNivel));
      return {
        titulo: 'Linha de crédito para máquinas',
        texto: `Um banco de fomento oferece financiar o próximo nível de equipamento (${brl(custo)}) a 1,2% ao mês, em 48 parcelas. Produtividade +20%.`,
        dados: { custo }, opcoes: ['Financiar o equipamento', 'Agora não'],
      };
    },
    resolver(s, i, d) {
      s.creditoUsado = true;
      if (i !== 0) return 'Oferta recusada.';
      s.equipNivel++;
      s.imobilizado += d.custo;
      s.investidoMes += d.custo;
      s.captadoMes += d.custo;
      s.emprestimos.push({ nome: 'Finame (equipamento)', saldo: d.custo, taxa: 0.012, amort: d.custo / 48 });
      return 'Equipamento novo instalado, pago em 48 meses.';
    },
  },
};

export function sortearEvento(s, rnd) {
  const ids = Object.keys(EVENTOS).filter(id => EVENTOS[id].cond(s));
  if (!ids.length) return null;
  const id = ids[Math.floor(rnd() * ids.length)];
  return { id, ...EVENTOS[id].montar(s, rnd) };
}

export function resolverEvento(s, opcao, rnd = Math.random) {
  const e = s.evento;
  if (!e) return null;
  const msg = EVENTOS[e.id].resolver(s, opcao, e.dados, rnd);
  s.evento = null;
  return { titulo: e.titulo, msg };
}
