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

Cada push na `main` gera um APK na aba **Actions** do GitHub (execução "APK Android" → *Artifacts*,
guardado por 7 dias). Para uma versão "oficial", suba a versão e a tag juntas:

```bash
npm version patch        # ou minor; atualiza o package.json e cria a tag v0.1.1
git push --follow-tags
```

O APK aparece em **Releases**, pronto para baixar no celular (o repositório é privado: é preciso estar
logado no GitHub). Na primeira instalação o Android pede para permitir "instalar apps desta fonte". Como
todos os APKs são assinados com a mesma chave de depuração (`android/app/debug.keystore`) e o
`versionCode` sempre cresce, uma versão nova instala por cima da anterior sem perder o jogo salvo.

O jogo precisa do Android System WebView 111 ou mais novo (Android 7 com o Chrome atualizado já
serve). Com uma WebView mais antiga, o app mostra uma página pedindo a atualização.

## Versão web (iPhone e navegador)

O mesmo jogo roda como site instalável. No iPhone: abrir o endereço no Safari → **Compartilhar →
Adicionar à Tela de Início**. Ele ganha ícone, abre em tela cheia e funciona sem internet depois da
primeira visita (iOS 16.4 ou mais novo). O jogo salvo fica no próprio aparelho, separado do APK.

O workflow **Site** publica a cada push na `main`, em um destes dois lugares:

- **GitHub Pages** — só com o repositório público (Settings → Pages → *Source: GitHub Actions*).
- **Cloudflare Pages** — funciona com o repositório privado. Basta cadastrar os segredos
  `CLOUDFLARE_API_TOKEN` (permissão *Cloudflare Pages: Edit*) e `CLOUDFLARE_ACCOUNT_ID` em
  Settings → Secrets and variables → Actions. O endereço fica `https://negocio-proprio.pages.dev`.

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

O que o jogo trata como na lei, porque é justamente o que um escritório explica para o cliente:

- **Simples Nacional**: tabelas e parcelas a deduzir da LC 123/2006 (LC 155/2016); RBT12 proporcional no
  início de atividade; Fator R com salários, 13º, férias, FGTS e pró-labore; sublimite de R$ 3,6 mi e
  limite de R$ 4,8 mi medidos pela receita do ano-calendário, com a tolerância de 20%; ICMS/ISS da 6ª
  faixa calculados pela 5ª enquanto a empresa não está impedida.
- **Lucro Presumido e Real**: PIS/COFINS cumulativo e não cumulativo, sem o ICMS na base (Tema 69 do STF);
  software no cumulativo mesmo no Real; crédito só sobre insumos que pagaram a contribuição; prejuízo
  fiscal compensável até 30% e só se apurado no Real.
- **Sócio**: pró-labore com INSS até o teto e IRRF pela tabela de 2026 (isenção até R$ 5 mil); retenção de
  10% sobre lucros acima de R$ 50 mil no mês, devolvida no ajuste anual de quem fica abaixo de R$ 600 mil.
- **Pessoal e contabilidade**: salário irredutível (a política salarial só sobe); custeio por absorção na
  indústria; DFC com caixa inicial e financiamento direto ao fornecedor fora do caixa (CPC 03).
