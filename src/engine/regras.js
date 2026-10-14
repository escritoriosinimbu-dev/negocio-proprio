// Parametros do jogo: ramos de negocio, tabelas tributarias e constantes.
// Mudar um numero aqui muda o equilibrio do jogo — rode `npm run balanceamento` depois.

export const SEGMENTOS = {
  hamburgueria: {
    nome: 'Hamburgueria', tipo: 'comercio', unidade: 'refeição', unidades: 'refeições',
    desc: 'Restaurante de bairro. Comida não vira estoque: o que a cozinha não serve no mês, não fatura.',
    precoRef: 38, custoMat: 13, prodPorFunc: 700, mercado: 2450, elasticidade: 3, estocavel: false,
    aluguel: 5000, salProd: 2000, salCom: 1900, salAdm: 2700, capVenda: 900, capDono: 500,
    mkEscala: 4000, qEscala: 2500, setup: 70000, equipCusto: 30000, ganhoEquip: 0.2,
    icms: { aliq: 0.032, credito: false, nome: 'ICMS (regime de bares e restaurantes)' }, iss: 0,
    sazonal: [0.9, 0.9, 0.95, 0.95, 1, 1, 1.05, 1, 0.95, 1, 1.05, 1.25],
    funcInicial: { producao: 3, comercial: 1, adm: 0 },
    setorProd: 'Cozinha', cargoProd: 'cozinheiro', cargoCom: 'atendente', setorCom: 'Salão e atendimento',
    noSetorProd: 'na cozinha', noSetorCom: 'no salão', melhorProd: 'Seu melhor cozinheiro', pronomeProd: 'Ele',
    umCargoCom: 'um atendente', insumo: 'carne, pães e hortaliças',
    // Carne, pao, queijo e hortalicas tem aliquota zero de PIS/COFINS e bebidas revendidas sao
    // monofasicas: so ~30% das compras dao credito no regime nao cumulativo (Lei 10.833/2003,
    // art. 3o §2o II; Lei 10.925/2004, art. 1o; Lei 10.865/2004, art. 28).
    creditoCompras: 0.3,
    expansoes: [
      { id: 'delivery', nome: 'Delivery próprio', desc: 'Motoboy e cardápio online. Mercado +30%.', custo: 18000, mult: 0.30, aluguel: 0 },
      { id: 'filial', nome: 'Segunda unidade', desc: 'Outro bairro. Mercado +80%, aluguel +R$ 6.000.', custo: 120000, mult: 0.80, aluguel: 6000 },
      { id: 'shopping', nome: 'Unidade no shopping', desc: 'Praça de alimentação. Mercado +90%, aluguel +R$ 14.000.', custo: 220000, mult: 0.90, aluguel: 14000 },
    ],
  },
  confeccao: {
    nome: 'Confecção', tipo: 'industria', unidade: 'camiseta', unidades: 'camisetas',
    desc: 'Fábrica de camisetas. Pode produzir para estoque e vender depois — o Natal agradece.',
    precoRef: 59, custoMat: 23, prodPorFunc: 380, mercado: 2350, elasticidade: 3, estocavel: true,
    aluguel: 4000, salProd: 2100, salCom: 2400, salAdm: 2700, capVenda: 600, capDono: 400,
    mkEscala: 3500, qEscala: 2500, setup: 55000, equipCusto: 35000, ganhoEquip: 0.2,
    icms: { aliq: 0.18, credito: true, nome: 'ICMS (débito − crédito)' }, iss: 0,
    sazonal: [0.8, 0.8, 0.9, 0.95, 1.05, 1, 0.95, 0.95, 1, 1.05, 1.2, 1.55],
    funcInicial: { producao: 3, comercial: 1, adm: 0 },
    setorProd: 'Fábrica', cargoProd: 'costureira', cargoCom: 'vendedor', setorCom: 'Vendas',
    noSetorProd: 'na fábrica', noSetorCom: 'nas vendas', melhorProd: 'Sua melhor costureira', pronomeProd: 'Ela',
    umCargoCom: 'um vendedor', insumo: 'malha e aviamentos', planoNome: 'Plano de produção',
    expansoes: [
      { id: 'loja', nome: 'Loja virtual', desc: 'Venda direta pela internet. Mercado +35%.', custo: 20000, mult: 0.35, aluguel: 0 },
      { id: 'repres', nome: 'Representantes em outros estados', desc: 'Atacado para lojistas. Mercado +60%.', custo: 45000, mult: 0.60, aluguel: 0 },
      { id: 'lojapropria', nome: 'Loja própria no centro', desc: 'Varejo com a sua marca. Mercado +50%, aluguel +R$ 7.000.', custo: 110000, mult: 0.50, aluguel: 7000 },
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
    umCargoCom: 'um executivo de contas', insumo: 'licenças e servidores',
    // Receita de desenvolvimento de software fica no PIS/COFINS cumulativo mesmo no Lucro Real
    // (Lei 10.833/2003, art. 10, XXV, e art. 15, V).
    pisCofinsCumulativo: true,
    expansoes: [
      { id: 'parceria', nome: 'Parceria com integradoras', desc: 'Indicações de clientes maiores. Mercado +40%.', custo: 15000, mult: 0.40, aluguel: 0 },
      { id: 'saas', nome: 'Produto próprio (SaaS)', desc: 'Sistema vendido por assinatura. Mercado +70%.', custo: 80000, mult: 0.70, aluguel: 0 },
      { id: 'sp', nome: 'Escritório em São Paulo', desc: 'Clientes grandes da capital. Mercado +80%, aluguel +R$ 12.000.', custo: 150000, mult: 0.80, aluguel: 12000 },
    ],
  },
  contabilidade: {
    nome: 'Escritório de contabilidade', tipo: 'servico', unidade: 'empresa-cliente', unidades: 'empresas-clientes',
    desc: 'Atende empresas por honorário mensal. A carteira cresce devagar e também se perde devagar.',
    precoRef: 900, custoMat: 45, prodPorFunc: 15, mercado: 135, elasticidade: 3, estocavel: false,
    aluguel: 3000, salProd: 4200, salCom: 3500, salAdm: 2600, capVenda: 45, capDono: 30,
    mkEscala: 2500, qEscala: 2500, setup: 30000, equipCusto: 15000, ganhoEquip: 0.10,
    icms: null, iss: 0.03,
    sazonal: [1, 1, 1.05, 1.05, 1, 1, 1, 1, 1, 1, 1, 0.95],
    funcInicial: { producao: 2, comercial: 0, adm: 0 },
    setorProd: 'Equipe contábil', cargoProd: 'analista contábil', cargoCom: 'executivo de relacionamento', setorCom: 'Comercial',
    noSetorProd: 'na equipe contábil', noSetorCom: 'no comercial', melhorProd: 'Sua melhor analista', pronomeProd: 'Ela',
    umCargoCom: 'um executivo de relacionamento', insumo: 'sistemas e certificados digitais',
    // Servicos contabeis ficam no Anexo III qualquer que seja o Fator R (LC 123, art. 18 §5o-B, XIV).
    anexoFixo: 'III',
    // Carteira: cliente atendido fica; a procura do mes anda 30% do caminho ate a procura do mercado.
    recorrente: 0.3, carteiraInicial: 8,
    expansoes: [
      { id: 'bpo', nome: 'BPO financeiro', desc: 'Contas a pagar e receber dos clientes. Mercado +30%.', custo: 20000, mult: 0.30, aluguel: 0 },
      { id: 'digital', nome: 'Atendimento digital', desc: 'Clientes de outras cidades. Mercado +50%.', custo: 35000, mult: 0.50, aluguel: 0 },
      { id: 'sede', nome: 'Segunda sede', desc: 'Outra cidade da região. Mercado +70%, aluguel +R$ 4.000.', custo: 90000, mult: 0.70, aluguel: 4000 },
    ],
  },
  mercadinho: {
    nome: 'Mercadinho de bairro', tipo: 'comercio', unidade: 'compra', unidades: 'compras',
    desc: 'Revende mercadoria com margem curta e giro alto. Estoque parado estraga, e cada reajuste não repassado come o lucro. O ramo mais arriscado.',
    precoRef: 85, custoMat: 56, prodPorFunc: 1100, mercado: 2450, elasticidade: 5, estocavel: true,
    aluguel: 4000, salProd: 1900, salCom: 1850, salAdm: 2600, capVenda: 800, capDono: 450,
    mkEscala: 3000, qEscala: 2500, setup: 50000, equipCusto: 25000, ganhoEquip: 0.15,
    icms: { aliq: 0.12, credito: true, nome: 'ICMS (débito − crédito, cesta básica reduzida)' }, iss: 0,
    sazonal: [0.95, 0.9, 0.95, 0.95, 1, 0.95, 1, 1, 0.95, 1, 1.05, 1.3],
    funcInicial: { producao: 1, comercial: 1, adm: 0 },
    setorProd: 'Estoque e reposição', cargoProd: 'repositor', cargoCom: 'operador de caixa', setorCom: 'Caixas e atendimento',
    noSetorProd: 'na reposição', noSetorCom: 'nos caixas', melhorProd: 'Seu melhor repositor', pronomeProd: 'Ele',
    umCargoCom: 'um operador de caixa', insumo: 'mercadorias', planoNome: 'Plano de compras',
    // Revenda: o salario da reposicao e despesa do mes, nao custo da mercadoria.
    revenda: true,
    // Perda mensal do estoque (validade, avaria, furto).
    perecivel: 0.03,
    // Cesta basica com aliquota zero na venda (Lei 10.925/2004, art. 1o) e bebidas e higiene monofasicas
    // (aliquota zero na revenda): so 40% da receita paga PIS/COFINS, e so as compras desses 40% dao credito.
    fracaoTributadaPisCofins: 0.4,
    expansoes: [
      { id: 'app', nome: 'Delivery por aplicativo', desc: 'Pedidos pelo celular. Mercado +25%.', custo: 12000, mult: 0.25, aluguel: 0 },
      { id: 'hortifruti', nome: 'Hortifrúti e padaria', desc: 'Seções novas que trazem cliente todo dia. Mercado +35%.', custo: 40000, mult: 0.35, aluguel: 0 },
      { id: 'loja2', nome: 'Segunda loja', desc: 'Outro bairro. Mercado +80%, aluguel +R$ 6.000.', custo: 140000, mult: 0.80, aluguel: 6000 },
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
// Encargos sobre a folha, em todos os regimes: provisoes de 13o (1/12) e de ferias + 1/3 (1/12 x 4/3)
// e o FGTS de 8% sobre o salario e sobre essas provisoes. Da 29,0% dos salarios. Entram no DRE, no
// caixa e no Fator R. A contribuicao patronal (CPP) NAO esta aqui: no Simples (Anexos I, II, III e V)
// ela ja vem dentro do DAS; fora dele e CPP_FOLHA, somada a parte em tributos.js.
export const FGTS = 0.08;
export const PROVISOES_FOLHA = 1 / 12 + (1 / 12) * (4 / 3);
export const ENCARGOS_FOLHA = PROVISOES_FOLHA + FGTS * (1 + PROVISOES_FOLHA);
// Lucro Presumido e Real: INSS patronal 20% + RAT 2% + terceiros 5,8%, sobre o salario e as provisoes
// de 13o e ferias (que tambem pagam INSS). Sobre o pro-labore, so os 20% patronais.
export const INSS_PATRONAL = 0.20;
export const RAT = 0.02;
export const TERCEIROS = 0.058;
export const CPP_FOLHA = (INSS_PATRONAL + RAT + TERCEIROS) * (1 + PROVISOES_FOLHA);
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

// Juros: a Selic anda ao longo do jogo (decisoes do Copom) e move o custo do dinheiro.
export const SELIC_INICIAL = 0.14;
export const SELIC_MIN = 0.065;
export const SELIC_MAX = 0.20;
// Capital de giro: Selic mensal + spread do banco, prefixado na contratacao.
export const SPREAD_GIRO = 0.013;
// Pronampe: Selic + 6% ao ano, pos-fixado (a parcela de juros muda com a Selic).
export const SPREAD_PRONAMPE = 0.06;
// Cheque especial: limitado a 8% ao mes (Res. CMN 4.765/2019).
export const JUROS_CHEQUE = 0.08;
// Reajuste anual de salarios (dissidio), aluguel e honorarios, aplicado em janeiro.
export const REAJUSTE_ANUAL = 0.05;
// Fatia maxima da procura que a concorrencia consegue tomar.
export const CONCORRENCIA_MAX = 0.5;
