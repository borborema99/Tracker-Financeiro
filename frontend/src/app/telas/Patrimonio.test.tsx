import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definirCsrf } from '@/lib/api';
import { instalarApiFalsa, renderizarComRotas, SESSAO_ABERTA } from '@/teste/api-falsa';
import Patrimonio from './Patrimonio';

afterEach(() => {
  vi.unstubAllGlobals();
  definirCsrf(null);
  localStorage.clear();
});

describe('patrimônio', () => {
  it('só mostra investimentos, moedas, cartões e dívidas quando o servidor os devolve (sem zero falso)', async () => {
    instalarApiFalsa({
      'GET /sessao': SESSAO_ABERTA,
      'GET /patrimonio': {
        corpo: {
          patrimonio_liquido_centavos: 100000,
          ativos: { contas_centavos: 100000, investimentos_centavos: null, moedas_centavos: null, total_centavos: 100000 },
          passivos: { cartoes_centavos: null, dividas_centavos: null, total_centavos: 0 },
          contas: [{ id: 1, nome: 'Corrente', saldo_centavos: 100000 }],
          moedas_sem_cotacao: 0,
        },
      },
    });
    renderizarComRotas(<Patrimonio />, '/app/patrimonio');

    expect(await screen.findByText('Corrente')).toBeInTheDocument();
    expect(screen.queryByText('Investimentos')).not.toBeInTheDocument();
    expect(screen.queryByText(/Moedas/)).not.toBeInTheDocument();
    expect(screen.getByText('Nenhuma fatura de cartão nem dívida em aberto.')).toBeInTheDocument();
  });

  it('avisa quando há conta em moeda estrangeira sem cotação, que ficou fora do total', async () => {
    instalarApiFalsa({
      'GET /sessao': SESSAO_ABERTA,
      'GET /patrimonio': {
        corpo: {
          patrimonio_liquido_centavos: 50000,
          ativos: { contas_centavos: 50000, investimentos_centavos: 0, moedas_centavos: null, total_centavos: 50000 },
          passivos: { cartoes_centavos: 20000, dividas_centavos: null, total_centavos: 20000 },
          contas: [],
          moedas_sem_cotacao: 2,
        },
      },
    });
    renderizarComRotas(<Patrimonio />, '/app/patrimonio');

    expect(await screen.findByText(/2 contas em moeda estrangeira estão sem cotação e ficaram fora do total/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver moedas' })).toBeInTheDocument();
  });
});
