const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{1F900}-\u{1F9FF}]/gu;
const MD_RE = /[*_`#>~]/g;
const LIST_RE = /^\s*[-*+]\s+/gm;
const URL_RE = /https?:\/\/[^\s)]+/gi;
const MULTI_SPACE_RE = /\s{2,}/g;

/** Limpia el texto para que sea legible por el sintetizador. */
export function cleanForSpeech(text: string): string {
  if (!text) return '';
  let out = text;
  out = out.replace(EMOJI_RE, ' ');
  out = out.replace(URL_RE, ' ');
  out = out.replace(LIST_RE, '');
  out = out.replace(MD_RE, '');
  out = out.replace(/\r\n?/g, '\n');
  out = out.replace(MULTI_SPACE_RE, ' ');
  return out.trim();
}

/** Divide el texto en frases por . ! ? … y saltos de línea. */
export function splitIntoSentences(text: string): string[] {
  const cleaned = cleanForSpeech(text);
  if (!cleaned) return [];
  // Normalizar saltos de línea a puntos para unificar.
  const normalized = cleaned.replace(/\n+/g, '. ');
  const parts = normalized.split(/(?<=[.!?…])\s+/);
  const result: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (t) result.push(t);
  }
  // Si no hubo división (sin puntuación), devolver el texto completo como una frase.
  if (result.length === 0) return [cleaned];
  return result;
}

/** Variación ligera de rate (±3%) por frase, acotada a [min, max]. */
export function varyRate(base: number, index: number, min = 0.7, max = 1.3): number {
  // Variación determinista por índice: +3%, -3%, +1.5%, -1.5%, ...
  const factors = [1.03, 0.97, 1.015, 0.985];
  const factor = factors[index % factors.length];
  const value = base * factor;
  const clamped = Math.min(max, Math.max(min, value));
  return Math.round(clamped * 1000) / 1000;
}