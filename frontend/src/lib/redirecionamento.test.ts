import { describe, expect, it } from 'vitest';
import { caminhoDeLogin, destinoSeguro } from './redirecionamento';

describe('destinoSeguro', () => {
  it('aceita caminhos internos do tracker, com consulta e âncora', () => {
    expect(destinoSeguro('/app')).toBe('/app');
    expect(destinoSeguro('/app/lancamentos')).toBe('/app/lancamentos');
    expect(destinoSeguro('/app/lancamentos?pagina=2&tipo=despesa#topo')).toBe('/app/lancamentos?pagina=2&tipo=despesa#topo');
  });

  it('sem valor ou vazio, vai para /app', () => {
    expect(destinoSeguro(null)).toBe('/app');
    expect(destinoSeguro(undefined)).toBe('/app');
    expect(destinoSeguro('')).toBe('/app');
  });

  it.each([
    'https://exemplo.com/app',
    'http://exemplo.com',
    '//exemplo.com/app',
    '///exemplo.com',
    '/\\exemplo.com',
    '\\\\exemplo.com',
    'javascript:alert(1)',
    '/app\n//exemplo.com',
    '/app/../../exemplo',
    '/appendice',
    '/entrar',
    '/',
    'app/contas',
  ])('recusa %j', (valor) => {
    expect(destinoSeguro(valor)).toBe('/app');
  });
});

describe('caminhoDeLogin', () => {
  it('lembra a página pedida', () => {
    expect(caminhoDeLogin('/app/contas?x=1')).toBe('/entrar?voltar=%2Fapp%2Fcontas%3Fx%3D1');
  });

  it('não carrega /app nem destino inválido', () => {
    expect(caminhoDeLogin('/app')).toBe('/entrar');
    expect(caminhoDeLogin('https://exemplo.com')).toBe('/entrar');
  });
});
