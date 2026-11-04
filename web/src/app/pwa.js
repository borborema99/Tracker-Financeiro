/**
 * Manifest e service worker só entram em contexto seguro (localhost ou HTTPS).
 * Em HTTP por IP da rede o navegador não os aceita; o app funciona igual, sem instalação.
 */
export function ativarPwa() {
  if (!window.isSecureContext) return;

  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = '/manifest.webmanifest';
  document.head.appendChild(link);

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}
