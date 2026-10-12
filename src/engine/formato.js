// Formatadores em pt-BR. Ficam no motor porque as noticias do mes ja saem formatadas.

export function brl(v) {
  return (v < 0 ? '−' : '') + 'R$ ' + Math.round(Math.abs(v)).toLocaleString('pt-BR');
}

export function brl2(v) {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function num(v) {
  return Math.round(v).toLocaleString('pt-BR');
}

export function pct(v, casas = 0) {
  return (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + '%';
}

export function brlK(v) {
  const a = Math.abs(v), sinal = v < 0 ? '−' : '';
  if (a >= 1e6) return sinal + 'R$ ' + (a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  if (a >= 1e3) return sinal + 'R$ ' + (a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil';
  return sinal + 'R$ ' + Math.round(a);
}
