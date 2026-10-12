// Parametros do jogo: ramos de negocio, tabelas tributarias e constantes.
// Mudar um numero aqui muda o equilibrio do jogo — rode `npm run balanceamento` depois.

export const SEGMENTOS = {
  hamburgueria: {
    nome: 'Hamburgueria', tipo: 'comercio', unidade: 'refeição', unidades: 'refeições',
    desc: 'Restaurante de bairro. Comida não vira estoque: o que a cozinha não serve no mês, não fatura.',
    precoRef: 38, custoMat: 13, prodPorFunc: 700, mercado: 2600, elasticidade: 3, estocavel: false,
    aluguel: 5000, salProd: 2000, salCom: 1900, salAdm: 2700, capVenda: 900, capDono: 500,
    mkEscala: 4000, qEscala: 2500, setup: 70000, equipCusto: 30000, ganhoEquip: 0.2,
    icms: { aliq: 0.032, credito: false, nome: 'ICMS (regime de bares e restaurantes)' }, iss: 0,
    sazonal: [0.9, 0.9, 0.95, 0.95, 1, 1, 1.05, 1, 0.95, 1, 1.05, 1.25],
    funcInicial: { producao: 3, comercial: 1, adm: 0 },
    setorProd: 'Cozinha', cargoProd: 'cozinheiro', cargoCom: 'atendente', setorCom: 'Salão e atendimento',
    noSetorProd: 'na cozinha', noSetorCom: 'no salão', melhorProd: 'Seu melhor cozinheiro', pronomeProd: 'Ele',
    umCargoCom: 'um atendente',
    // Carne, pao, queijo e hortalicas tem aliquota zero de PIS/COFINS e bebidas revendidas sao
    // monofasicas: so ~30% das compras dao credito no regime nao cumulativo (Lei 10.833/2003,
    // art. 3o §2o II; Lei 10.925/2004, art. 1o; Lei 10.865/2004, art. 28).
    creditoCompras: 0.3,
    expansoes: [
      { id: 'delivery', nome: 'Delivery próprio', desc: 'Motoboy e cardápio online. Mercado +30%.', custo: 18000, mult: 0.30, aluguel: 0 },
      { id: 'filial', nome: 'Segunda unidade', desc: 'Outro bairro. Mercado +80%, aluguel +R$ 6.000.', custo: 120000, mult: 0.80, aluguel: 6000 },
    ],
  },
  confeccao: {
    nome: 'Confecção', tipo: 'industria', unidade: 'camiseta', unidades: 'camisetas',
    desc: 'Fábrica de camisetas. Pode produzir para estoque e vender depois — o Natal agradece.',
    precoRef: 59, custoMat: 23, prodPorFunc: 380, mercado: 2600, elasticidade: 3, estocavel: true,
    aluguel: 4000, salProd: 2100, salCom: 2400, salAdm: 2700, capVenda: 600, capDono: 400,
    mkEscala: 3500, qEscala: 2500, setup: 55000, equipCusto: 35000, ganhoEquip: 0.2,
    icms: { aliq: 0.18, credito: true, nome: 'ICMS (débito − crédito)' }, iss: 0,
    sazonal: [0.8, 0.8, 0.9, 0.95, 1.05, 1, 0.95, 0.95, 1, 1.05, 1.2, 1.55],
    funcInicial: { producao: 3, comercial: 1, adm: 0 },
    setorProd: 'Fábrica', cargoProd: 'costureira', cargoCom: 'vendedor', setorCom: 'Vendas',
    noSetorProd: 'na fábrica', noSetorCom: 'nas vendas', melhorProd: 'Sua melhor costureira', pronomeProd: 'Ela',
    umCargoCom: 'um vendedor',
    expansoes: [
      { id: 'loja', nome: 'Loja virtual', desc: 'Venda direta pela internet. Mercado +35%.', custo: 20000, mult: 0.35, aluguel: 0 },
      { id: 'repres', nome: 'Representantes em outros estados', desc: 'Atacado para lojistas. Mercado +60%.', custo: 45000, mult: 0.60, aluguel: 0 },
    ],
  },
  software: {
    nome: 'Estúdio de software', tipo: 'servico', unidade: 'hora', unidades: 'horas',
    desc: 'Desenvolve sistemas sob encomenda. Vende horas; hora parada não volta.',
    precoRef: 165, custoMat: 8, prodPorFunc: 130, mercado: 900, elasticidade: 3, estocavel: false,
    aluguel: 2500, salProd: 6600, salCom: 4500, salAdm: 3200, capVenda: 260, capDono: 150,
    mkEscala: 3000, qEscala: 3000, setup: 25000, equipCusto: 20000, ganhoEquip: 0.06,
    icms: null, iss: 0.03,
    sazonal: [0.85, 0.95, 1, 1, 1, 1, 0.95, 1, 1.05, 1.05, 1.05, 0.9],
    funcInicial: { producao: 1, comercial: 0, adm: 0 },
    setorProd: 'Desenvolvimento', cargoProd: 'programador', cargoCom: 'executivo de contas', setorCom: 'Comercial',
    noSetorProd: 'no desenvolvimento', noSetorCom: 'no comercial', melhorProd: 'Seu melhor programador', pronomeProd: 'Ele',
    umCargoCom: 'um executivo de contas',
    // Receita de desenvolvimento de software fica no PIS/COFINS cumulativo mesmo no Lucro Real
    // (Lei 10.833/2003, art. 10, XXV, e art. 15, V).
    pisCofinsCumulativo: true,
    expansoes: [
      { id: 'parceria', nome: 'Parceria com integradoras', desc: 'Indicações de clientes maiores. Mercado +40%.', custo: 15000, mult: 0.40, aluguel: 0 },
      { id: 'saas', nome: 'Produto próprio (SaaS)', desc: 'Sistema vendido por assinatura. Mercado +70%.', custo: 80000, mult: 0.70, aluguel: 0 },
    ],
  },
};

export const SETORES = ['producao', 'comercial', 'adm'];
export const REGIMES = ['simples', 'presumido', 'real'];
export const NOME_REGIME = { simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real' };
export const HONORARIOS = { simples: 700, presumido: 1800, real: 3800 };

export const POLITICA = {
  abaixo: { fator: 0.9, moral: 40, nome: 'Abaixo do mercado' },
  mercado: { fator: 1, moral: 62, nome: 'Na média do mercado' },
  acima: { fator: 1.15, moral: 82, nome: 'Acima do mercado' },
};

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Tabelas da LC 123/2006 (redacao da LC 155/2016): [limite da faixa (RBT12), aliquota nominal, parcela a deduzir]
export const ANEXOS = {
  I:   [[180e3, .04, 0], [360e3, .073, 5940], [720e3, .095, 13860], [1.8e6, .107, 22500], [3.6e6, .143, 87300], [4.8e6, .19, 378000]],
  II:  [[180e3, .045, 0], [360e3, .078, 5940], [720e3, .10, 13860], [1.8e6, .112, 22500], [3.6e6, .147, 85500], [4.8e6, .30, 720000]],
  III: [[180e3, .06, 0], [360e3, .112, 9360], [720e3, .135, 17640], [1.8e6, .16, 35640], [3.6e6, .21, 125640], [4.8e6, .33, 648000]],
  V:   [[180e3, .155, 0], [360e3, .18, 4500], [720e3, .195, 9900], [1.8e6, .205, 17100], [3.6e6, .23, 62100], [4.8e6, .305, 540000]],
};

export const LIMITE_SIMPLES = 4.8e6;
// Sublimite estadual/municipal (LC 123, art. 13-A). Mede-se pela receita do ano-calendario,
// nao pelo RBT12: o RBT12 so define a faixa (aliquota).
export const SUBLIMITE = 3.6e6;
// Excesso de ate 20% sobre o limite ou o sublimite so produz efeito no ano seguinte; acima
// disso, a partir do mes seguinte ao excesso (LC 123, art. 3o §9o e §9o-A; art. 20 §1o e §1o-A).
export const TOLERANCIA_EXCESSO = 0.20;
// Parcela do ICMS (Anexos I e II) ou do ISS (III e V) na reparticao do DAS, faixas 1 a 5.
export const PARTILHA_LOCAL = {
  I: [0.34, 0.34, 0.335, 0.335, 0.335],
  II: [0.32, 0.32, 0.32, 0.32, 0.32],
  III: [0.335, 0.32, 0.325, 0.325, 0.335],
  V: [0.14, 0.17, 0.19, 0.21, 0.235],
};
// ISS efetivo dentro do DAS limitado a 5% (o excedente vai para os tributos federais).
export const TETO_ISS_DAS = 0.05;
// FGTS + provisao de 13o e ferias, como fracao da folha: entra no DRE, no caixa e no Fator R.
export const ENCARGOS_FOLHA = 0.30;
export const FATOR_R_MINIMO = 0.28;
export const DURACAO = 36;
export const SALARIO_MINIMO = 1621; // Decreto 12.797/2025
// INSS do segurado: teto do salario de contribuicao em 2026 (Portaria Interministerial MPS/MF 13/2026).
export const TETO_INSS = 8475.55;
// Retencao sobre lucros e dividendos (Lei 15.270/2025): 10% sobre o total do mes quando o que a
// mesma pessoa recebe no mes passa de R$ 50 mil. E antecipacao do imposto minimo anual (IRPFM).
export const LIMITE_ISENCAO_DIVIDENDOS = 50000;
export const ALIQ_RETENCAO_DIVIDENDOS = 0.10;
export const RENDA_MINIMA_IRPFM = 600000;
// A nota mede o ganho do dono contra um capital fixo: o capital escolhido na abertura muda o
// risco (folego de caixa), nao o tamanho da regua.
export const CAPITAL_REFERENCIA = 150000;
