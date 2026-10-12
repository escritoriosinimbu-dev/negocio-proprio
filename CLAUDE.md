# CLAUDE.md

Orientações para o Claude Code trabalhar neste repositório.

## Comandos

```bash
npm test                 # vitest: testes do motor
npm run build            # build web (Vite) em dist/
npm run balanceamento    # 40 partidas automáticas por ramo/estratégia; rode após mexer em regras.js
npm run android:sync     # build + cap sync android
```

O Android SDK não está disponível nos containers de nuvem (dl.google.com é bloqueado). O APK é compilado
pelo GitHub Actions (`.github/workflows/android.yml`); localmente, só dá para validar o build web e os testes.

## Arquitetura

`src/engine/` é JavaScript puro: não importa nada de `ui/`, do DOM nem do Capacitor. Toda regra de jogo e
de tributo mora ali e é testável no Node. `src/ui/app.js` só desenha e chama o motor.

O estado do jogo (`S`) é um objeto JSON simples, salvo inteiro pelo `@capacitor/preferences`. Não guarde
funções, `Date` ou classes nele; os acontecimentos guardam só `{ id, dados, ... }` e são resolvidos por
`EVENTOS[id].resolver`. Ao mudar o formato do estado, suba `VERSAO_ESTADO` em `empresa.js` e trate jogos
salvos antigos no carregamento.

Toda aleatoriedade do motor passa pelo parâmetro `rnd` (`fecharMes(s, rnd)`, `resolverEvento(s, i, rnd)`),
para os testes rodarem com semente fixa. Não use `Math.random()` direto no motor.

## Convenções

- Código e comentários em português. Comentários sem acento; textos de interface com acento.
- Valores em reais como `number` (é um jogo: arredondamento de centavos não importa; as identidades
  contábeis são conferidas com tolerância nos testes).
- Os testes de `tests/simulacao.test.js` conferem três identidades a cada mês: caixa final − inicial =
  entradas − saídas; variação do patrimônio líquido = lucro; linhas do DRE fecham no lucro líquido.
  Uma mudança no motor que quebre uma delas é um bug, não um teste a ajustar.

## Regras tributárias

A apuração está em `src/engine/tributos.js` e as tabelas em `regras.js` (LC 123/2006 com a redação da
LC 155/2016). Dois fatos que não são óbvios:

1. **Sublimite.** Na 6ª faixa (RBT12 acima de R$ 3,6 mi) a alíquota efetiva do Simples *cai*, porque a
   repartição do DAS deixa de incluir ICMS/ISS — que passam a ser pagos por fora. O motor cobra os dois
   por fora nessa faixa; sem isso, crescer além de R$ 3,6 mi baixaria o tributo.
2. **Comparativo.** Os três regimes são apurados todo mês sobre a mesma operação (`comp` em cada mês do
   histórico). O prejuízo fiscal do Lucro Real é acompanhado para cada regime em `s.prejuizo`, mesmo
   quando a empresa não está no Real, para o comparativo ser justo.

## Android

- `android/app/debug.keystore` é versionado de propósito: todos os APKs de CI saem com a mesma assinatura e
  instalam por cima do anterior sem perder o jogo salvo. Não é segredo (senha `android`).
- `versionCode` vem de `GITHUB_RUN_NUMBER`; `versionName` do `package.json`.
- As áreas seguras chegam pelo SystemBars do Capacitor como `--safe-area-inset-*` e são lidas no CSS
  com fallback para `env()`.
