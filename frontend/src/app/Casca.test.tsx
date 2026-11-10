import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definirCsrf } from '@/lib/api';
import { instalarApiFalsa, renderizarComRotas, SESSAO_ABERTA } from '@/teste/api-falsa';
import Casca from './Casca';

const CONTAS = {
  corpo: {
    itens: [{ id: 1, nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 0, saldo_centavos: 123456, arquivada: false }],
  },
};

function montar(alertas = 0) {
  instalarApiFalsa({
    'GET /sessao': SESSAO_ABERTA,
    'GET /contas': CONTAS,
    'GET /categorias': { corpo: { itens: [] } },
    'GET /cartoes': { corpo: { itens: [] } },
    'GET /alertas': { corpo: { total: alertas, alertas: [] } },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  definirCsrf(null);
  localStorage.clear();
});

describe('casca do tracker', () => {
  it('mantém o atalho "Novo lançamento" à mão nas telas e o esconde no próprio formulário', async () => {
    montar();
    const { unmount } = renderizarComRotas(
      <Routes>
        <Route path="/app/*" element={<Casca />} />
      </Routes>,
      '/app/contas',
    );
    const atalho = await screen.findByRole('link', { name: 'Novo lançamento' });
    expect(atalho).toHaveAttribute('href', '/app/lancamentos/novo');
    unmount();

    montar();
    renderizarComRotas(
      <Routes>
        <Route path="/app/*" element={<Casca />} />
      </Routes>,
      '/app/lancamentos/novo',
    );
    expect(await screen.findByRole('heading', { name: 'Novo lançamento' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Novo lançamento' })).not.toBeInTheDocument();
  });

  it('mostra no sino quantos alertas existem', async () => {
    montar(3);
    renderizarComRotas(
      <Routes>
        <Route path="/app/*" element={<Casca />} />
      </Routes>,
      '/app/contas',
    );
    expect(await screen.findByRole('link', { name: 'Alertas (3)' })).toHaveAttribute('href', '/app/alertas');
  });

  it('oculta e mostra os valores, e lembra a escolha neste navegador', async () => {
    montar();
    const pessoa = userEvent.setup();
    renderizarComRotas(
      <Routes>
        <Route path="/app/*" element={<Casca />} />
      </Routes>,
      '/app/contas',
    );
    expect(await screen.findByText(/1\.234,56/)).toBeInTheDocument();

    await pessoa.click(screen.getByRole('button', { name: 'Ocultar valores' }));
    expect(screen.queryByText(/1\.234,56/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/R\$\s•+/).length).toBeGreaterThan(0);
    expect(localStorage.getItem('tracker.ocultarValores')).toBe('1');

    await pessoa.click(screen.getByRole('button', { name: 'Mostrar valores' }));
    expect(screen.getByText(/1\.234,56/)).toBeInTheDocument();
  });

  it('na barra inferior fica o essencial e o resto vai para "Mais"', async () => {
    montar();
    const pessoa = userEvent.setup();
    renderizarComRotas(
      <Routes>
        <Route path="/app/*" element={<Casca />} />
      </Routes>,
      '/app/contas',
    );
    const barra = (await screen.findAllByRole('navigation', { name: 'Navegação' }))[0] as HTMLElement;
    const nomes = within(barra).getAllByRole('link').map((l) => l.textContent);
    expect(nomes).toEqual(['Início', 'Lançamentos', 'Compromissos', 'Fluxo de caixa', 'Mais']);

    await pessoa.click(within(barra).getByRole('link', { name: 'Mais' }));
    const lista = await screen.findByRole('heading', { name: 'Mais' });
    expect(lista).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Cartões' }).length).toBeGreaterThan(0);
  });
});
