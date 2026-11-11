/**
 * Manifest e service worker só entram em contexto seguro (localhost ou HTTPS). O app funciona completo sem eles;
 * o service worker guarda só o shell, nunca respostas da API (frontend/public/sw.js).
 */
export function ativarPwa(): void {
  if (!window.isSecureContext) return;

  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = '/manifest.webmanifest';
  document.head.appendChild(link);

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }
}
