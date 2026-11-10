import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definirCsrf } from '@/lib/api';
import { instalarApiFalsa, renderizarComRotas, SESSAO_ABERTA } from '@/teste/api-falsa';
import Investimentos from './Investimentos';

const BASE = {
  nome: 'Tesouro Selic',
  tipo: 'tesouro',
  instituicao: 'Corretora',
  observacao: '',
  encerrado: false,
  atualizado_em: '2026-11-01T00:00:00Z',
  avaliado_em: null,
  rentabilidade_percentual: null,
  resgatado_centavos: 0,
};

const LISTA = {
  corpo: {
    itens: [
      { ...BASE, id: 1, avaliado: true, avaliado_em: '2026-11-01', valor_atual_centavos: 110000, aportado_centavos: 100000, resultado_centavos: 10000, rentabilidade_percentual: 10 },
      { ...BASE, id: 2, nome: 'CDB sem valor', avaliado: false, valor_atual_centavos: 50000, aportado_centavos: 50000, resultado_centavos: 0 },
    ],
    totais: { valor_atual_centavos: 160000, aportado_centavos: 150000, resultado_centavos: 10000, sem_avaliacao: 1 },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  definirCsrf(null);
  localStorage.clear();
});

describe('investimentos', () => {
  it('RF: sem valor informado não inventa resultado; com valor, mostra resultado e rentabilidade', async () => {
    instalarApiFalsa({ 'GET /sessao': SESSAO_ABERTA, 'GET /investimentos': LISTA, 'GET /contas': { corpo: { itens: [] } } });
    renderizarComRotas(<Investimentos />, '/app/investimentos');

    const comValor = (await screen.findByText('Tesouro Selic')).closest('li') as HTMLElement;
    expect(within(comValor).getByText(/Resultado/)).toBeInTheDocument();
    expect(within(comValor).getByText(/10,00%/)).toBeInTheDocument();

    const semValor = screen.getByText('CDB sem valor').closest('li') as HTMLElement;
    expect(within(semValor).queryByText(/Resultado/)).not.toBeInTheDocument();
    expect(within(semValor).getByText(/Sem valor informado/)).toBeInTheDocument();
    expect(screen.getByText(/1 investimento está sem valor informado/)).toBeInTheDocument();
  });

  it('registra um aporte sem conta, sem mexer em saldo de conta', async () => {
    const { chamadas } = instalarApiFalsa({
      'GET /sessao': SESSAO_ABERTA,
      'GET /investimentos': LISTA,
      'GET /contas': { corpo: { itens: [] } },
      'POST /investimentos/1/operacoes': { corpo: { id: 9 } },
    });
    const pessoa = userEvent.setup();
    renderizarComRotas(<Investimentos />, '/app/investimentos');

    const cartao = (await screen.findByText('Tesouro Selic')).closest('li') as HTMLElement;
    await pessoa.click(within(cartao).getByRole('button', { name: 'Aportar' }));
    await pessoa.type(within(cartao).getByLabelText('Valor aplicado'), '250');
    await pessoa.click(within(cartao).getByRole('button', { name: 'Registrar aporte' }));

    await vi.waitFor(() => expect(chamadas.some((c) => c.chave === 'POST /investimentos/1/operacoes')).toBe(true));
    expect(chamadas.find((c) => c.chave === 'POST /investimentos/1/operacoes')?.corpo).toMatchObject({ tipo: 'aporte', valor_centavos: 25000, conta_id: null });
  });

  it('não deixa resgatar investimento sem valor', async () => {
    instalarApiFalsa({
      'GET /sessao': SESSAO_ABERTA,
      'GET /investimentos': {
        corpo: {
          itens: [{ ...BASE, id: 3, nome: 'Zerado', avaliado: false, valor_atual_centavos: 0, aportado_centavos: 0, resultado_centavos: 0 }],
          totais: { valor_atual_centavos: 0, aportado_centavos: 0, resultado_centavos: null, sem_avaliacao: 1 },
        },
      },
    });
    renderizarComRotas(<Investimentos />, '/app/investimentos');

    const cartao = (await screen.findByText('Zerado')).closest('li') as HTMLElement;
    expect(within(cartao).getByRole('button', { name: 'Resgatar' })).toBeDisabled();
  });
});
