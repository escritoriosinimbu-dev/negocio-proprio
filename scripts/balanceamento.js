// Joga muitas partidas automaticas e resume o resultado por ramo e estrategia.
// Uso: npm run balanceamento [-- partidas]
// Serve para conferir o equilibrio depois de mexer em src/engine/regras.js.
import { SEGMENTOS, multiploNota, notaFinal } from '../src/engine/index.js';
import { jogar, ESTRATEGIAS } from '../tests/ajuda.js';

const PARTIDAS = Number(process.argv[2]) || 40;
const linhas = [];
for (const segmento of Object.keys(SEGMENTOS)) {
  for (const estrategia of Object.keys(ESTRATEGIAS)) {
    let quebras = 0, mult = 0;
    const notas = {};
    for (let i = 1; i <= PARTIDAS; i++) {
      const s = jogar({ segmento, estrategia, seed: i * 7919 });
      if (s.fim === 'falencia') quebras++;
      mult += multiploNota(s);
      const n = notaFinal(s);
      notas[n] = (notas[n] || 0) + 1;
    }
    linhas.push({
      ramo: segmento, estrategia, falencias: `${Math.round(quebras / PARTIDAS * 100)}%`,
      'multiplo da nota': (mult / PARTIDAS).toFixed(2),
      notas: Object.entries(notas).sort().map(([k, v]) => `${k}:${v}`).join(' '),
    });
  }
}
console.log(`${PARTIDAS} partidas de 36 meses por linha, capital de R$ 150 mil, acontecimentos com escolha aleatoria`);
console.log('Referencia: parada ~1,5-2,0 (C), ativa ~2,8-3,5 (B), caotica 100% F. Nota: A >= 4x, B >= 2,5x, C >= 1,5x, D >= 1x.');
console.table(linhas);
