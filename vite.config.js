import { defineConfig } from 'vite';

// base relativa: o Capacitor serve o build a partir de https://localhost/ no Android.
export default defineConfig({
  base: './',
  // sem target: o padrao do Vite 8 (chrome111) coincide com android.minWebViewVersion
  build: { outDir: 'dist' },
  test: { include: ['tests/**/*.test.js'] },
});
