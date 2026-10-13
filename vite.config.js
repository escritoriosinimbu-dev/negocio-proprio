import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';

// Service worker da versao web (iPhone e navegador): guarda o jogo para abrir sem internet.
// A lista de arquivos sai do proprio build, entao cada versao nova troca o cache inteiro.
function serviceWorker() {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const publicos = readdirSync('public', { recursive: true, withFileTypes: true })
        .filter(f => f.isFile())
        .map(f => `${f.parentPath ?? f.path}/${f.name}`.replace(/\\/g, '/').replace(/^public\//, ''));
      const arquivos = ['./', ...Object.keys(bundle), ...publicos].filter(f => f !== 'sw.js');
      const versao = createHash('sha256').update(arquivos.join('\n')).update(
        Object.values(bundle).map(b => b.code ?? b.source ?? '').join('')).digest('hex').slice(0, 12);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `// gerado no build (vite.config.js)
const CACHE = 'negocio-proprio-${versao}';
const ARQUIVOS = ${JSON.stringify(arquivos)};
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Pagina: rede primeiro (pega a versao nova), cache sem internet. Resto: cache primeiro.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./', { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
});
`,
      });
    },
  };
}

// base relativa: o Capacitor serve o build a partir de https://localhost/ no Android, e o site
// pode morar numa subpasta (GitHub Pages).
export default defineConfig({
  base: './',
  // sem target: o padrao do Vite 8 (chrome111, safari16) coincide com android.minWebViewVersion
  build: { outDir: 'dist' },
  plugins: [serviceWorker()],
  test: { include: ['tests/**/*.test.js'] },
});
