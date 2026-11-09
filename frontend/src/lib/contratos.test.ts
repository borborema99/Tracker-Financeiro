import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import { esquemaConta, TIPOS_CONTA } from '../../../contratos/contas.js';
import { esquemaMovimentacao } from '../../../contratos/movimentacoes.js';
import { formatarDinheiro, parseDinheiro } from '../../../contratos/dinheiro.js';

// Os esquemas Zod de contratos/ são os mesmos do servidor. Este teste garante duas coisas: o TypeScript do front
// infere os tipos dos formulários a partir deles (sem repetir interface à mão) e as mensagens vêm em português.

type NovaConta = z.infer<typeof esquemaConta>;
type NovaMovimentacao = z.infer<typeof esquemaMovimentacao>;

describe('contratos compartilhados com o servidor', () => {
  it('infere o tipo do formulário a partir do esquema Zod', () => {
    expectTypeOf<NovaConta['nome']>().toEqualTypeOf<string>();
    expectTypeOf<NovaConta['saldo_inicial_centavos']>().toEqualTypeOf<number>();
    expectTypeOf<NovaConta['arquivada']>().toEqualTypeOf<boolean>();
    // Enum de verdade, não string solta: o formulário só aceita os tipos que o banco aceita.
    expectTypeOf<NovaConta['tipo']>().toEqualTypeOf<
      'corrente' | 'poupanca' | 'carteira' | 'investimento' | 'digital' | 'beneficio' | 'outro'
    >();
    expectTypeOf<NovaMovimentacao['tipo']>().toEqualTypeOf<'receita' | 'despesa' | 'transferencia'>();
    expectTypeOf<NovaMovimentacao['valor_centavos']>().toEqualTypeOf<number>();
  });

  it('valida com mensagens em português, as mesmas do servidor', () => {
    const resultado = esquemaConta.safeParse({ nome: '', tipo: 'corrente' });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.message).toBe('Informe o nome.');
    }
    expect(esquemaConta.safeParse({ nome: 'Nubank', tipo: 'nenhum' }).success).toBe(false);
    expect(TIPOS_CONTA).toContain('digital');
  });

  it('dinheiro: parse e formato únicos, em centavos inteiros', () => {
    expect(parseDinheiro('1.234,56')).toBe(123456);
    expect(parseDinheiro('abc')).toBeNull();
    expect(formatarDinheiro(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
  });
});
