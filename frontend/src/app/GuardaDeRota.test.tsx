import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definirCsrf } from '@/lib/api';
import { EnderecoAtual, instalarApiFalsa, renderizarComRotas, SESSAO_ABERTA, SESSAO_ANONIMA } from '@/teste/api-falsa';
import { GuardaDeRota } from './GuardaDeRota';

function Telas() {
  return (
    <Routes>
      <Route path="/entrar" element={<EnderecoAtual />} />
      <Route
        path="/app/*"
        element={
          <GuardaDeRota>
            <p>Conteúdo do tracker</p>
          </GuardaDeRota>
        }
      />
    </Routes>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  definirCsrf(null);
});

describe('guarda de rota de /app', () => {
  it('mostra o estado de carregando enquanto confere a sessão', () => {
    instalarApiFalsa({ 'GET /sessao': SESSAO_ABERTA });
    renderizarComRotas(<Telas />, '/app');
    expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
  });

  it('sem sessão, vai para /entrar lembrando a página pedida', async () => {
    instalarApiFalsa({ 'GET /sessao': SESSAO_ANONIMA });
    renderizarComRotas(<Telas />, '/app/lancamentos?tipo=despesa');
    await waitFor(() =>
      expect(screen.getByTestId('endereco')).toHaveTextContent('/entrar?voltar=%2Fapp%2Flancamentos%3Ftipo%3Ddespesa'),
    );
    expect(screen.queryByText('Conteúdo do tracker')).toBeNull();
  });

  it('sem sessão e em /app puro, vai para /entrar sem parâmetro', async () => {
    instalarApiFalsa({ 'GET /sessao': SESSAO_ANONIMA });
    renderizarComRotas(<Telas />, '/app');
    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent(/^\/entrar$/));
  });

  it('com sessão, mostra o conteúdo', async () => {
    instalarApiFalsa({ 'GET /sessao': SESSAO_ABERTA });
    renderizarComRotas(<Telas />, '/app/contas');
    expect(await screen.findByText('Conteúdo do tracker')).toBeInTheDocument();
  });

  it('se a consulta da sessão falha, mostra o erro e deixa tentar de novo, sem mandar para o login', async () => {
    instalarApiFalsa({
      'GET /sessao': [{ status: 500, corpo: { erro: 'Algo deu errado.' } }, SESSAO_ABERTA],
    });
    renderizarComRotas(<Telas />, '/app');
    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Conteúdo do tracker')).toBeInTheDocument();
  });
});
