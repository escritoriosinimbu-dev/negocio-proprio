# Negócio Próprio

Jogo de gestão de empresas para Android. O jogador abre um negócio (hamburgueria, confecção ou estúdio de
software), decide preço, equipe, produção, marketing, crédito e regime tributário, e a cada mês vê o resultado
no DRE, no fluxo de caixa e no balanço. São 36 meses para fazer a empresa crescer — ou quebrar.

O que o jogo ensina, de propósito:

- **Lucro não é caixa.** Venda a prazo vira lucro hoje e dinheiro no mês seguinte; equipamento sai do caixa
  hoje e vira despesa aos poucos, pela depreciação.
- **Gargalos.** Procura, capacidade de produção e capacidade de atendimento são três números diferentes, e o
  menor deles decide a venda.
- **Regime tributário importa.** Simples Nacional (com RBT12, anexos, Fator R e sublimite), Lucro Presumido e
  Lucro Real são apurados em paralelo todo mês, e a aba Impostos mostra quanto a mesma operação pagaria em
  cada um. A troca só é permitida em janeiro.

## Baixar o APK

Cada push na `main` gera um APK na aba **Actions** do GitHub (execução "APK Android" → *Artifacts*). Para
uma versão "oficial", crie uma tag:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

O APK aparece em **Releases**, pronto para baixar no celular. Na primeira instalação o Android pede para
permitir "instalar apps desta fonte". Como todos os APKs são assinados com a mesma chave de depuração
(`android/app/debug.keystore`), uma versão nova instala por cima da anterior sem perder o jogo salvo.

## Desenvolvimento

Requisitos: Node 22+. Para compilar o APK localmente, também Java 21 e o Android SDK (Android Studio).

```bash
npm install
npm run dev            # abre o jogo no navegador, com recarga automática
npm test               # testes do motor (vitest)
npm run balanceamento  # joga centenas de partidas automáticas e resume o equilíbrio
npm run android:sync   # build web + copia para o projeto Android
npx cap open android   # abre no Android Studio
```

## Estrutura

```
src/engine/     motor do jogo — JavaScript puro, sem DOM, coberto pelos testes
  regras.js       ramos de negócio, tabelas do Simples, constantes de equilíbrio
  tributos.js     apuração de Simples, Presumido e Real
  empresa.js      estado inicial e indicadores (capacidade, procura, patrimônio)
  simulacao.js    fechamento do mês
  acoes.js        compras, empréstimos, distribuição de lucros
  eventos.js      acontecimentos sorteados
  dicas.js        "o que o contador diria"
src/ui/         interface (render em template strings, sem framework)
android/        projeto nativo gerado pelo Capacitor
tests/          testes do motor
scripts/        balanceamento
```

## Simplificações

É um jogo, não um sistema fiscal. IRPJ e CSLL são apurados mês a mês, não há substituição tributária nem
IPI, o ICMS usa uma alíquota única por ramo e os encargos de FGTS, 13º e férias entram como 30% da folha. A
transição para IBS e CBS da reforma tributária ainda não está no jogo.
