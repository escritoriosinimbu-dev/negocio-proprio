# CLAUDE.md

Orientações para o Claude Code trabalhar neste repositório.

## Comandos

```bash
npm test                 # vitest: testes do motor
npm run build            # build web (Vite) em dist/
npm run balanceamento    # 40 partidas automáticas por ramo/estratégia; rode após mexer em regras.js
                         # referência: parada ~1,5–2,0 (C), ativa ~2,8–3,5 (B), caótica 100% falência
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
3. **Fator R** = salários, 13º, férias e FGTS (a folha × 1,30 de `ENCARGOS_FOLHA`) + pró-labore, que não
   tem FGTS. Usar só salário + pró-labore jogava o software no Anexo V sem motivo.
4. **Comparativo x Lalur.** Os três regimes são apurados todo mês sobre a mesma operação (`comp` no
   histórico) e `s.prejuizo[regime]` é o prejuízo *simulado* de cada um. O prejuízo fiscal de verdade é
   `s.prejuizoFiscal`, que só cresce em meses no Real; `trocarRegime` usa ele ao entrar no Real.
5. **Dividendos (Lei 15.270/2025).** A retenção de 10% incide sobre o total do mês da pessoa, pro rata à
   participação, e é antecipação do IRPFM: o ajuste em `viradaDeAno` devolve o que passar do imposto
   mínimo (zero para renda abaixo de R$ 600 mil).

## Android

- `android/app/debug.keystore` é versionado de propósito: todos os APKs de CI saem com a mesma assinatura e
  instalam por cima do anterior sem perder o jogo salvo. Não é segredo (senha `android`).
- `versionCode` são os minutos desde 1970 (sempre cresce, em qualquer máquina); `versionName` vem do
  `package.json`. Suba a versão com `npm version patch` — o CI recusa tag diferente do `package.json`.
- `capacitor.config.json` exige WebView 111 (`android.minWebViewVersion`); abaixo disso o app abre
  `public/webview-antiga.html`. O CSS usa `:has()` e `color-mix()`, que não existem em WebViews antigas.
- Ícone e splash saem de `assets/` com `npx @capacitor/assets generate --android` (cores no README do
  commit que os gerou: fundo `#1C6A4B`/`#0D1511`, splash `#EAF0EA`/`#0D1511`).
- As áreas seguras chegam pelo SystemBars do Capacitor como `--safe-area-inset-*` e são lidas no CSS
  com fallback para `env()`.
