# CLAUDE.md

Orientações para o Claude Code trabalhar neste repositório.

## Comandos

```bash
npm test                 # vitest: testes do motor
npm run build            # build web (Vite) em dist/
npm run balanceamento    # 40 partidas automáticas por ramo/estratégia; rode após mexer em regras.js
                         # referência: parada ~1,4–2,6 (C/D), ativa ~2,8–3,6 (B), caótica 100% falência
npm run android:sync     # build + cap sync android
```

O Android SDK não está disponível nos containers de nuvem (dl.google.com é bloqueado). O APK é compilado
pelo GitHub Actions (`.github/workflows/android.yml`); localmente, só dá para validar o build web e os testes.

## Arquitetura

`src/engine/` é JavaScript puro: não importa nada de `ui/`, do DOM nem do Capacitor. Toda regra de jogo e
de tributo mora ali e é testável no Node. `src/ui/app.js` só desenha e chama o motor.

O estado do jogo (`S`) é um objeto JSON simples, salvo inteiro pelo `@capacitor/preferences` (só quando
o dedo solta o slider, não a cada passo). Não guarde funções, `Date` ou classes nele; os acontecimentos
guardam só `{ id, dados, ... }` e são resolvidos por `EVENTOS[id].resolver`. Ao mudar o formato do
estado, suba `VERSAO_ESTADO` e acrescente o passo em `migrarEstado` (`empresa.js`), com teste.

Toda aleatoriedade do motor passa pelo parâmetro `rnd` (`fecharMes(s, rnd)`, `resolverEvento(s, i, rnd)`),
para os testes rodarem com semente fixa. Não use `Math.random()` direto no motor.

## Convenções

- Código e comentários em português. Comentários sem acento; textos de interface com acento.
- Valores em reais como `number` (é um jogo: arredondamento de centavos não importa; as identidades
  contábeis são conferidas com tolerância nos testes).
- Os testes de `tests/simulacao.test.js` conferem quatro identidades a cada mês: caixa final − inicial =
  entradas − saídas; variação do patrimônio líquido = lucro; linhas do DRE fecham no lucro líquido;
  caixa inicial + linhas da DFC = caixa final (com ações e acontecimentos no meio).
  Uma mudança no motor que quebre uma delas é um bug, não um teste a ajustar.

## Regras tributárias

A apuração está em `src/engine/tributos.js` e as tabelas em `regras.js` (LC 123/2006 com a redação da
LC 155/2016). Fatos que não são óbvios e que já custaram um erro:

1. **RBT12 define a alíquota; o ano-calendário define limite e sublimite.** O sublimite de R$ 3,6 mi
   (ICMS/ISS fora do DAS) e o limite de R$ 4,8 mi (saída do Simples) se medem pela receita de janeiro a
   dezembro, com tolerância de 20%: excesso de até 20% só vale no ano seguinte; acima disso, a partir do
   mês seguinte (`TOLERANCIA_EXCESSO`). A primeira versão media pelo RBT12 e aplicava no próprio mês.
2. **6ª faixa sem impedimento.** Com RBT12 acima de R$ 3,6 mi e a empresa ainda não impedida, o ICMS/ISS
   continua no DAS, calculado pela 5ª faixa (Res. CGSN 140, art. 21, III, b). A alíquota efetiva da 6ª
   faixa é menor que a da 5ª justamente porque a repartição dela não tem ICMS/ISS.
3. **Fator R** = salários, 13º, férias e FGTS (a folha × (1 + `ENCARGOS_FOLHA`)) + pró-labore, que não
   tem FGTS. Usar só salário + pró-labore jogava o software no Anexo V sem motivo.
4. **Comparativo x Lalur.** Os três regimes são apurados todo mês sobre a mesma operação (`comp` no
   histórico) e `s.prejuizo[regime]` é o prejuízo *simulado* de cada um. O prejuízo fiscal de verdade é
   `s.prejuizoFiscal`, que só cresce em meses no Real; `trocarRegime` usa ele ao entrar no Real.
5. **Dividendos (Lei 15.270/2025).** A retenção de 10% incide sobre o total do mês da pessoa, pro rata à
   participação, e é antecipação do IRPFM: o ajuste em `viradaDeAno` devolve o que passar do imposto
   mínimo (zero para renda abaixo de R$ 600 mil).
6. **Encargos sobre a folha.** `ENCARGOS_FOLHA` (29%) = provisões de 13º e férias + 1/3 + FGTS sobre salário e
   provisões, em todos os regimes. A CPP fica fora dele: no Simples (Anexos I, II, III, V) está no DAS; no Presumido
   e no Real é `CPP_FOLHA` (20% + RAT 2% + terceiros 5,8%, sobre salário e provisões) + 20% do pró-labore, e entra
   no comparativo de regimes. A linha "Encargos" do DRE soma os dois — somar CPP no Simples seria cobrar em dobro.

## Site da ESCSIN

O jogo é linkado no site da ESCSIN. Por isso os honorários aparecem como "valor fictício" e há uma chamada para o
escritório em **só três lugares**: tela final (abaixo da nota), fim do comparativo na aba Impostos e crédito no
rodapé da abertura. Nada de pop-up nem chamada em outras telas. Endereços em `src/ui/externo.js`; no app, os links
abrem fora da WebView pelo `@capacitor/app-launcher`.

**Visual.** O jogo usa a identidade do escsin.com.br: tokens no topo de `src/ui/style.css` (azul-marinho `#1a1966`,
laranja `#F5A21B`, fundo `#f7f8fc`; tema escuro com fundo `#0f0f2e`), Sora nos títulos e números de destaque e Inter
no texto, servidas pelos pacotes `@fontsource` (nada de Google Fonts: o jogo roda offline e no APK). Laranja como
**texto** sobre branco só em `#9c6200` (o `#F5A21B` não passa no contraste AA); verde e vermelho continuam só para
lucro/prejuízo e alertas. O logo (`public/marca/logo-escsin.jpg`, fundo branco) fica no topo da abertura sobre um selo
branco, com link para o site. Ícone e splash usam o mesmo símbolo de antes (barras e seta) nas cores da marca.

## Mecânicas da v0.2 (o que não é óbvio)

1. **Preço justo.** `precoJusto` = preço de mercado × fator de qualidade × fator de reputação (os dois valem 1
   em 50). A procura compara o preço com ele, com elasticidade 3; a reputação ainda decide quantos conhecem a
   marca. Qualidade não multiplica mais a procura direto — isso contaria duas vezes.
2. **Carteira** (`seg.recorrente`): a procura anda 30% do caminho até a do mercado por mês e `s.carteira` é quem
   foi atendido. Preço alto perde clientes devagar.
3. **Perdas sem caixa.** `s.perdasMes` (cliente que não paga) é baixado dos recebíveis *no fechamento*, nunca na
   resolução do acontecimento: assim a variação do PL do mês continua igual ao lucro.
4. **Contrato com fornecedor** trava `custoMat`; inflação e reajustes vão para `custoContratoAdiado` e chegam de
   uma vez no fim. **Selic**: Pronampe (`posFixado`) muda de taxa todo mês; capital de giro fica com a do dia.
5. **Reajuste anual** (`s.indice`, +5% todo janeiro) vale para salários, aluguel e honorários. Sem ele, preço
   subindo com a inflação e custo fixo parado tornava o jogo fácil demais no ano 3.
6. **Saldo credor.** ICMS e PIS/COFINS com crédito maior que o débito não zeram: o excedente vai para
   `s.saldoCredor[regime]` (LC 87/1996, art. 24, III; Lei 10.833/2003, art. 3º §4º), simulado por regime como o
   prejuízo. Na troca de regime, o saldo de ICMS segue a empresa e o de PIS/COFINS zera.
7. **Revenda com alíquota zero.** No mercadinho, `fracaoTributadaPisCofins` (40%) reduz a base do débito *e* do
   crédito; no Simples, sai do DAS a parcela de PIS/COFINS (15,5% do Anexo I) sobre os outros 60%. Reduzir só o
   crédito cobrava PIS/COFINS sobre cesta básica.
8. **Preço abusivo.** Acima de 110% do preço justo, a reputação cai (`abuso` em `fecharMes`); e o mercadinho tem
   elasticidade 5. Sem isso, cobrar 20–30% acima do mercado sem gerir nada vencia as estratégias ativas.
9. **Fornecedor barato** aparece uma vez por partida (`fornecedorNovoUsado`); trocar de fornecedor devolve o preço
   de mercado e o fim do contrato desfaz o desconto (`contratoFornecedor.desconto`). Antes os descontos se empilhavam.
10. **Balanceamento.** O robô "parada" reajusta o preço pelo mercado uma vez por ano e mantém o regime; o "ativo"
   acompanha o mercado e escolhe o regime mais barato em janeiro. Escolher o regime ao acaso quebrava metade das
   partidas. O mercadinho é o ramo arriscado de propósito (margem curta).

## Versão web

O build de `dist/` serve também como site instalável (iPhone pelo Safari, navegador). `vite.config.js` gera
`sw.js` no build com a lista exata dos arquivos, então cada versão troca o cache inteiro; o registro em
`src/main.js` só acontece fora do Capacitor e em produção. `.github/workflows/site.yml` publica no GitHub
Pages (só repositório público) e/ou no Cloudflare Pages (se os segredos existirem) — cada destino liga sozinho.
Ícones do site em `public/icones/`, gerados de `assets/icon-only.png`.

## Android

- `android/app/debug.keystore` é versionado de propósito: todos os APKs de CI saem com a mesma assinatura e
  instalam por cima do anterior sem perder o jogo salvo. Não é segredo (senha `android`).
- `versionCode` são os minutos desde 1970 (sempre cresce, em qualquer máquina); `versionName` vem do
  `package.json`. Suba a versão com `npm version patch` — o CI recusa tag diferente do `package.json`.
- `capacitor.config.json` exige WebView 111 (`android.minWebViewVersion`); abaixo disso o app abre
  `public/webview-antiga.html`. O CSS usa `:has()` e `color-mix()`, que não existem em WebViews antigas.
  Esse piso não vale para a Huawei WebView (`com.huawei.webview`, numeração própria): quem cobre esse caso
  é a checagem de recursos no `<head>` do `index.html`, que redireciona para a mesma página.
- Ícone e splash saem de `assets/` com `npx @capacitor/assets generate --android` (cores no README do
  commit que os gerou: ícone com fundo `#1a1966`, barras brancas e seta `#F5A21B`; splash `#f7f8fc`/`#0f0f2e`).
- As áreas seguras chegam pelo SystemBars do Capacitor como `--safe-area-inset-*` e são lidas no CSS
  com fallback para `env()`.
