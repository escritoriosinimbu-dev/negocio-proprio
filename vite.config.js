import { defineConfig } from 'vite';

// base relativa: o Capacitor serve o build a partir de https://localhost/ no Android.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2022' },
  test: { include: ['tests/**/*.test.js'] },
});
