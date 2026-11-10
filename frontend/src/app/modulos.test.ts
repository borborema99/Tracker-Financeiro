import { describe, expect, it } from 'vitest';
import { destinoExiste, MODULOS } from './modulos';

describe('registro de módulos', () => {
  it('só liga link a tela que existe (nada de botão que cai no Início)', () => {
    expect(destinoExiste('/compromissos?tipo=receita')).toBe(true);
    expect(destinoExiste('/app/lancamentos/12')).toBe(true);
    expect(destinoExiste('/faturas/3')).toBe(true);
    expect(destinoExiste('/orcamento?mes=2026-11')).toBe(false);
    expect(destinoExiste('/metas')).toBe(false);
  });

  it('não repete caminho de módulo nem de subrota (a rota ia ficar ambígua)', () => {
    const caminhos = MODULOS.flatMap((m) => [m.caminho, ...(m.subrotas ?? []).map((s) => s.caminho)]);
    expect(new Set(caminhos).size).toBe(caminhos.length);
  });

  it('a barra inferior leva só os módulos marcados, e todos existem no menu', () => {
    const barra = MODULOS.filter((m) => m.barra).map((m) => m.rotulo);
    expect(barra).toEqual(['Início', 'Lançamentos', 'Compromissos', 'Fluxo de caixa']);
  });
});
