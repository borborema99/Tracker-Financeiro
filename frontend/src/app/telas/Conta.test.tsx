import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definirCsrf } from '@/lib/api';
import { EnderecoAtual, instalarApiFalsa, renderizarComRotas, SESSAO_ABERTA } from '@/teste/api-falsa';
import Conta from './Conta';

function Telas() {
  return (
    <Routes>
      <Route path="/app/conta" element={<Conta />} />
      <Route path="*" element={<EnderecoAtual />} />
    </Routes>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  definirCsrf(null);
  localStorage.clear();
});

describe('conta', () => {
  it('só libera "Excluir minha conta" depois de digitar o nome de usuário exato', async () => {
    instalarApiFalsa({ 'GET /sessao': SESSAO_ABERTA });
    const pessoa = userEvent.setup();
    renderizarComRotas(<Telas />, '/app/conta');

    const botao = await screen.findByRole('button', { name: 'Excluir minha conta para sempre' });
    expect(botao).toBeDisabled();
    await pessoa.type(screen.getByLabelText(/Digite seu nome de usuário/), 'an');
    expect(botao).toBeDisabled();
    await pessoa.type(screen.getByLabelText(/Digite seu nome de usuário/), 'a');
    expect(botao).toBeEnabled();
  });

  it('exclui a conta com usuário e senha e volta para a página inicial', async () => {
    const { chamadas } = instalarApiFalsa({ 'GET /sessao': SESSAO_ABERTA, 'DELETE /conta': { status: 200, corpo: null } });
    const pessoa = userEvent.setup();
    renderizarComRotas(<Telas />, '/app/conta');

    await pessoa.type(await screen.findByLabelText(/Digite seu nome de usuário/), 'ana');
    await pessoa.type(screen.getByLabelText('Senha', { selector: '#excluir-senha' }), 'senha-secreta');
    await pessoa.click(screen.getByRole('button', { name: 'Excluir minha conta para sempre' }));

    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent('/'));
    expect(chamadas.find((c) => c.chave === 'DELETE /conta')?.corpo).toEqual({ confirmacao: 'ana', senha: 'senha-secreta' });
  });

  it('mostra a mensagem do servidor quando a senha não confere e continua na tela', async () => {
    instalarApiFalsa({
      'GET /sessao': SESSAO_ABERTA,
      'DELETE /conta': { status: 401, corpo: { erro: 'Senha incorreta.' } },
    });
    const pessoa = userEvent.setup();
    renderizarComRotas(<Telas />, '/app/conta');

    await pessoa.type(await screen.findByLabelText(/Digite seu nome de usuário/), 'ana');
    await pessoa.type(screen.getByLabelText('Senha', { selector: '#excluir-senha' }), 'errada');
    await pessoa.click(screen.getByRole('button', { name: 'Excluir minha conta para sempre' }));

    expect(await screen.findByText('Senha incorreta.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Excluir a conta' })).toBeInTheDocument();
  });

  it('troca a senha: valida o mínimo antes de enviar e depois avisa que deu certo', async () => {
    const { chamadas } = instalarApiFalsa({ 'GET /sessao': SESSAO_ABERTA, 'POST /senha': { corpo: { ok: true } } });
    const pessoa = userEvent.setup();
    renderizarComRotas(<Telas />, '/app/conta');

    await pessoa.type(await screen.findByLabelText('Senha atual'), 'antiga-123');
    await pessoa.type(screen.getByLabelText('Senha nova'), 'curta');
    await pessoa.click(screen.getByRole('button', { name: 'Trocar senha' }));
    expect(await screen.findByText('A senha precisa ter pelo menos 8 caracteres.')).toBeInTheDocument();
    expect(chamadas.some((c) => c.chave === 'POST /senha')).toBe(false);

    await pessoa.clear(screen.getByLabelText('Senha nova'));
    await pessoa.type(screen.getByLabelText('Senha nova'), 'nova-senha-forte');
    await pessoa.click(screen.getByRole('button', { name: 'Trocar senha' }));

    expect(await screen.findByText('Senha alterada.')).toBeInTheDocument();
    expect(chamadas.find((c) => c.chave === 'POST /senha')?.corpo).toEqual({ senha_atual: 'antiga-123', senha_nova: 'nova-senha-forte' });
  });

  it('encerra as outras sessões e diz quantas foram', async () => {
    instalarApiFalsa({ 'GET /sessao': SESSAO_ABERTA, 'POST /sessoes/encerrar-outras': { corpo: { encerradas: 2 } } });
    const pessoa = userEvent.setup();
    renderizarComRotas(<Telas />, '/app/conta');

    await pessoa.click(await screen.findByRole('button', { name: 'Encerrar as outras sessões' }));
    expect(await screen.findByText('2 sessões encerradas.')).toBeInTheDocument();
  });
});
