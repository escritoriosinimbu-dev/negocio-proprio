import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';

// Links para fora do jogo. Unico lugar com os enderecos da ESCSIN.
export const LINK_WHATSAPP = 'https://wa.me/555137081268?text=Ol%C3%A1!%20Joguei%20o%20Neg%C3%B3cio%20Pr%C3%B3prio%20e%20queria%20fazer%20a%20conta%20da%20minha%20empresa.';
export const LINK_SITE = 'https://escsin.com.br/';

// Na web, o proprio <a target="_blank"> abre a nova aba. No app, a WebView nao deve navegar para
// fora: o AppLauncher entrega o endereco ao Android, que abre o WhatsApp ou o navegador.
export function tratarLinkExterno(ev) {
  const a = ev.target.closest && ev.target.closest('a[data-externo]');
  if (!a || !Capacitor.isNativePlatform()) return false;
  ev.preventDefault();
  AppLauncher.openUrl({ url: a.href }).catch(() => window.open(a.href, '_blank'));
  return true;
}

export function linkExterno(url, texto, cls = '') {
  return `<a href="${url}" target="_blank" rel="noopener" data-externo class="${cls}">${texto}</a>`;
}
