import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aplicarTema, lerPreferencia, salvarPreferencia } from './tema';

function sistemaEscuro(escuro: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: escuro, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});
afterEach(() => vi.unstubAllGlobals());

describe('tema', () => {
  it('sem escolha, segue o sistema', () => {
    sistemaEscuro(true);
    aplicarTema(lerPreferencia());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    sistemaEscuro(false);
    aplicarTema(lerPreferencia());
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('a escolha da pessoa vale mais que o sistema e fica salva', () => {
    sistemaEscuro(true);
    salvarPreferencia('claro');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(lerPreferencia()).toBe('claro');
    salvarPreferencia('escuro');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    salvarPreferencia('sistema');
    expect(lerPreferencia()).toBe('sistema');
  });

  it('sem localStorage, o tema continua funcionando', () => {
    sistemaEscuro(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(lerPreferencia()).toBe('sistema');
    vi.restoreAllMocks();
  });
});
