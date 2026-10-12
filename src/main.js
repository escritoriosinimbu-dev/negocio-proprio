import '@fontsource/bricolage-grotesque/latin-500.css';
import '@fontsource/bricolage-grotesque/latin-700.css';
import '@fontsource/bricolage-grotesque/latin-800.css';
import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-500.css';
import '@fontsource/figtree/latin-600.css';
import '@fontsource/figtree/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import './ui/style.css';

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { iniciarApp, voltar } from './ui/app.js';

iniciarApp(document.getElementById('app'));

if (Capacitor.isNativePlatform()) {
  App.addListener('backButton', () => {
    if (!voltar()) App.exitApp();
  });
}
