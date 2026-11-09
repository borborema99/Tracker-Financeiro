// Tema claro e escuro. Por padrão segue o sistema; a pessoa pode fixar um dos dois. A escolha fica só neste
// navegador (localStorage, sempre dentro de try/catch: pode estar bloqueado). Aplicar o tema é trocar a classe
// `dark` no elemento raiz do documento, o que a CSP permite (sem bloco de estilo nem atributo de estilo inline).

export type PreferenciaDeTema = 'sistema' | 'claro' | 'escuro';

const CHAVE = 'tracker.tema';

export function lerPreferencia(): PreferenciaDeTema {
  try {
    const valor = localStorage.getItem(CHAVE);
    return valor === 'claro' || valor === 'escuro' ? valor : 'sistema';
  } catch {
    return 'sistema';
  }
}

export function sistemaEscuro(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function aplicarTema(preferencia: PreferenciaDeTema): void {
  const escuro = preferencia === 'escuro' || (preferencia === 'sistema' && sistemaEscuro());
  document.documentElement.classList.toggle('dark', escuro);
}

export function salvarPreferencia(preferencia: PreferenciaDeTema): void {
  try {
    if (preferencia === 'sistema') localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, preferencia);
  } catch {
    // sem armazenamento: vale só nesta aba
  }
  aplicarTema(preferencia);
}

/** Chamada uma vez na entrada do app: aplica a preferência e acompanha o sistema enquanto for "sistema". */
export function iniciarTema(): void {
  aplicarTema(lerPreferencia());
  if (typeof matchMedia !== 'function') return;
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (lerPreferencia() === 'sistema') aplicarTema('sistema');
  });
}
