// Destino depois do login. O endereço vem da URL (`?voltar=`), que qualquer pessoa pode forjar num link: só vale
// caminho interno do tracker (começando em /app). Qualquer outra coisa, inclusive URL externa, volta para /app.

export const DESTINO_PADRAO = '/app';

const ORIGEM_DE_TESTE = 'https://origem.invalida';

export function destinoSeguro(valor: string | null | undefined): string {
  if (!valor || valor.length > 2048) return DESTINO_PADRAO;
  // Barra invertida e caracteres de controle são tratados como separador ou ignorados por alguns navegadores.
  if (/[\\\u0000-\u001f\u007f]/.test(valor)) return DESTINO_PADRAO;
  if (!valor.startsWith('/') || valor.startsWith('//')) return DESTINO_PADRAO;
  let url: URL;
  try {
    // A origem de teste é fictícia: se o valor "escapar" dela (esquema, host), a origem muda.
    url = new URL(valor, ORIGEM_DE_TESTE);
  } catch {
    return DESTINO_PADRAO;
  }
  if (url.origin !== ORIGEM_DE_TESTE) return DESTINO_PADRAO;
  const dentroDoApp = url.pathname === '/app' || url.pathname.startsWith('/app/');
  return dentroDoApp ? `${url.pathname}${url.search}${url.hash}` : DESTINO_PADRAO;
}

/** Endereço de login que lembra para onde voltar. Só /app entra no parâmetro. */
export function caminhoDeLogin(destino: string): string {
  const seguro = destinoSeguro(destino);
  return seguro === DESTINO_PADRAO ? '/entrar' : `/entrar?voltar=${encodeURIComponent(seguro)}`;
}
