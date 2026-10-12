import { Preferences } from '@capacitor/preferences';

// O jogo salvo fica no armazenamento do aparelho. No Android, Preferences grava em
// SharedPreferences (o localStorage da WebView pode ser apagado pelo sistema quando falta
// espaco); no navegador, cai no localStorage.
const CHAVE = 'negocio-proprio-v1';

export async function salvarJogo(dados) {
  try {
    await Preferences.set({ key: CHAVE, value: JSON.stringify(dados) });
  } catch (e) {
    console.warn('Nao foi possivel salvar o jogo', e);
  }
}

export async function carregarJogo() {
  try {
    const { value } = await Preferences.get({ key: CHAVE });
    return value ? JSON.parse(value) : null;
  } catch (e) {
    console.warn('Jogo salvo ilegivel; comecando do zero', e);
    return null;
  }
}

export async function apagarJogo() {
  try {
    await Preferences.remove({ key: CHAVE });
  } catch (e) {
    console.warn('Nao foi possivel apagar o jogo salvo', e);
  }
}
