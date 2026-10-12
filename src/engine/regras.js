// Parametros do jogo: ramos de negocio, tabelas tributarias e constantes.
// Mudar um numero aqui muda o equilibrio do jogo — rode `npm run balanceamento` depois.

export const SEGMENTOS = {
  hamburgueria: {
    nome: 'Hamburgueria', tipo: 'comercio', unidade: 'refeição', unidades: 'refeições',
    desc: 'Restaurante de bairro. Comida não vira estoque: o que a cozinha não serve no mês, não fatura.',
    precoRef: 38, custoMat: 13, prodPorFunc: 700, mercado: 3400, elasticidade: 1.9, estocavel: false,
    aluguel: 6000, salProd: 2000, salCom: 1900, salAdm: 2700, capVenda: 900, capDono: 500,
    mkEscala: 4000, qEscala: 2500, setup: 70000, equipCusto: 30000,
    icms: { aliq: 0.032, credito: false, nome: 'ICMS (regime de bares e restaurantes)' }, iss: 0,
    sazonal: [0.9, 0.9, 0.95, 0.95, 1, 1, 1.05, 1, 0.95, 1, 1.05, 1.25],
    funcInicial: { producao: 3, comercial: 1, adm: 0 },
    setorProd: 'Cozinha', cargoProd: 'cozinheiro', cargoCom: 'atendente', setorCom: 'Salão e atendimento',
    expansoes: [
      { id: 'delivery', nome: 'Delivery próprio', desc: 'Motoboy e cardápio online. Mercado +30%.', custo: 18000, mult: 0.30, aluguel: 0 },
      { id: 'filial', nome: 'Segunda unidade', desc: 'Outro bairro. Mercado +80%, aluguel +R$ 6.000.', custo: 120000, mult: 0.80, aluguel: 6000 },
    ],
  },
  confeccao: {
    nome: 'Confecção', tipo: 'industria', unidade: 'camiseta', unidades: 'camisetas',
    desc: 'Fábrica de camisetas. Pode produzir para estoque e vender depois — o Natal agradece.',
    precoRef: 59, custoMat: 21, prodPorFunc: 450, mercado: 2600, elasticidade: 1.6, estocavel: true,
    aluguel: 4000, salProd: 2100, salCom: 2400, salAdm: 2700, capVenda: 800, capDono: 400,
    mkEscala: 3500, qEscala: 2500, setup: 55000, equipCusto: 35000,
    icms: { aliq: 0.18, credito: true, nome: 'ICMS (débito − crédito)' }, iss: 0,
    sazonal: [0.8, 0.8, 0.9, 0.95, 1.05, 1, 0.95, 0.95, 1, 1.05, 1.2, 1.55],
    funcInicial: { producao: 3, comercial: 1, adm: 0 },
    setorProd: 'Fábrica', cargoProd: 'costureira', cargoCom: 'vendedor', setorCom: 'Vendas',
    expansoes: [
      { id: 'loja', nome: 'Loja virtual', desc: 'Venda direta pela internet. Mercado +35%.', custo: 20000, mult: 0.35, aluguel: 0 },
      { id: 'repres', nome: 'Representantes em outros estados', desc: 'Atacado para lojistas. Mercado +60%.', custo: 45000, mult: 0.60, aluguel: 0 },
    ],
  },
  software: {
    nome: 'Estúdio de software', tipo: 'servico', unidade: 'hora', unidades: 'horas',
    desc: 'Desenvolve sistemas sob encomenda. Vende horas; hora parada não volta.',
    precoRef: 165, custoMat: 8, prodPorFunc: 130, mercado: 1500, elasticidade: 1.4, estocavel: false,
    aluguel: 2500, salProd: 5800, salCom: 4500, salAdm: 3200, capVenda: 260, capDono: 150,
    mkEscala: 3000, qEscala: 3000, setup: 25000, equipCusto: 20000,
    icms: null, iss: 0.03,
    sazonal: [0.85, 0.95, 1, 1, 1, 1, 0.95, 1, 1.05, 1.05, 1.05, 0.9],
    funcInicial: { producao: 2, comercial: 0, adm: 0 },
    setorProd: 'Desenvolvimento', cargoProd: 'programador', cargoCom: 'executivo de contas', setorCom: 'Comercial',
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
// Sublimite estadual/municipal (LC 123, art. 13-A): acima dele ICMS e ISS saem do DAS.
export const SUBLIMITE = 3.6e6;
export const FATOR_R_MINIMO = 0.28;
export const DURACAO = 36;
export const SALARIO_MINIMO = 1518;
