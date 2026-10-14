// Fontes da identidade ESCSIN servidas pelo proprio app (offline e APK): Sora nos titulos e numeros
// de destaque, Inter no texto. Os pacotes @fontsource trazem os .woff2 e usam font-display: swap.
import '@fontsource/sora/latin-600.css';
import '@fontsource/sora/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import './ui/style.css';

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { iniciarApp, voltar } from './ui/app.js';

iniciarApp(document.getElementById('app'));

if (Capacitor.isNativePlatform()) {
  App.addListener('backButton', () => {
    // na tela raiz, manda o app para segundo plano (como o Android 12+ faz) em vez de mata-lo
    if (!voltar()) App.minimizeApp();
  });
} else if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // versao web: o service worker guarda o jogo para abrir sem internet
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker nao registrado', e));
}
