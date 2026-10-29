/** Registra el service worker solo en producción. Cualquier fallo se ignora: la app funciona sin él. */
export function registerServiceWorker(): void {
  try {
    if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      try {
        navigator.serviceWorker.register('/sw.js').catch(() => {
          /* sin service worker no hay modo sin conexión, pero todo lo demás funciona */
        });
      } catch {
        /* ignorado */
      }
    });
  } catch {
    /* ignorado */
  }
}
