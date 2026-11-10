// A API devolve links no formato do app antigo ('/compromissos?tipo=pagar'). No front novo toda tela do tracker
// mora sob /app; esta função faz a tradução num só lugar.

export function caminhoDoTracker(link: string): string {
  if (link === '/' || link === '') return '/app';
  if (link.startsWith('/app/') || link === '/app') return link;
  return `/app${link.startsWith('/') ? '' : '/'}${link}`;
}
