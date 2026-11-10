import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definirCsrf } from '@/lib/api';
import { EnderecoAtual, instalarApiFalsa, renderizarComRotas, SESSAO_ABERTA, SESSAO_ANONIMA } from '@/teste/api-falsa';
import CriarConta from './CriarConta';
import Entrar from './Entrar';

function Telas() {
  return (
    <Routes>
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/criar-conta" element={<CriarConta />} />
      <Route path="*" element={<EnderecoAtual />} />
    </Routes>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  definirCsrf(null);
});

async function preencherEEnviar(usuario: string, senha: string) {
  const pessoa = userEvent.setup();
  if (usuario) await pessoa.type(await screen.findByLabelText('Usuário'), usuario);
  if (senha) await pessoa.type(screen.getByLabelText('Senha'), senha);
  await pessoa.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('tela de login', () => {
  it('mostra as mensagens de validação em português e não chama a API de login', async () => {
    const { chamadas } = instalarApiFalsa({ 'GET /sessao': SESSAO_ANONIMA });
    renderizarComRotas(<Telas />, '/entrar');
    await preencherEEnviar('', '');
    expect(await screen.findByText('Digite o usuário.')).toBeInTheDocument();
    expect(screen.getByText('Digite a senha.')).toBeInTheDocument();
    expect(chamadas.some((c) => c.chave === 'POST /login')).toBe(false);
  });

  it('com a senha certa, entra e vai para /app', async () => {
    const { chamadas } = instalarApiFalsa({
      'GET /sessao': [SESSAO_ANONIMA, SESSAO_ABERTA],
      'POST /login': { corpo: { ok: true } },
    });
    renderizarComRotas(<Telas />, '/entrar');
    await preencherEEnviar('ana', 'senha-de-teste');
    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent('/app'));
    expect(chamadas.find((c) => c.chave === 'POST /login')?.corpo).toEqual({ usuario: 'ana', senha: 'senha-de-teste' });
  });

  it('depois do login volta para a página que a pessoa tentou abrir', async () => {
    instalarApiFalsa({
      'GET /sessao': [SESSAO_ANONIMA, SESSAO_ABERTA],
      'POST /login': { corpo: { ok: true } },
    });
    renderizarComRotas(<Telas />, '/entrar?voltar=%2Fapp%2Flancamentos%3Fpagina%3D2');
    await preencherEEnviar('ana', 'senha-de-teste');
    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent('/app/lancamentos?pagina=2'));
  });

  it.each(['https://exemplo.com/roubo', '//exemplo.com', '/entrar', '/app/../exemplo'])(
    'recusa o destino %s e cai em /app',
    async (voltar) => {
      instalarApiFalsa({
        'GET /sessao': [SESSAO_ANONIMA, SESSAO_ABERTA],
        'POST /login': { corpo: { ok: true } },
      });
      renderizarComRotas(<Telas />, `/entrar?voltar=${encodeURIComponent(voltar)}`);
      await preencherEEnviar('ana', 'senha-de-teste');
      await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent(/^\/app$/));
    },
  );

  it('mostra a mensagem do servidor quando a senha está errada e continua na tela', async () => {
    instalarApiFalsa({
      'GET /sessao': SESSAO_ANONIMA,
      'POST /login': { status: 401, corpo: { erro: 'Usuário ou senha incorretos.' } },
    });
    renderizarComRotas(<Telas />, '/entrar');
    await preencherEEnviar('ana', 'errada');
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha incorretos.');
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('mostra o bloqueio por excesso de tentativas', async () => {
    instalarApiFalsa({
      'GET /sessao': SESSAO_ANONIMA,
      'POST /login': { status: 429, corpo: { erro: 'Muitas tentativas. Tente de novo em 15 min.' } },
    });
    renderizarComRotas(<Telas />, '/entrar');
    await preencherEEnviar('ana', 'errada');
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas. Tente de novo em 15 min.');
  });

  it('explica em uma linha como redefinir a senha', async () => {
    instalarApiFalsa({ 'GET /sessao': SESSAO_ANONIMA });
    renderizarComRotas(<Telas />, '/entrar');
    expect(await screen.findByText(/não envia e-mail/)).toHaveTextContent('npm run redefinir-senha');
  });

  it('quem já está logado e abre /entrar vai direto para o destino', async () => {
    instalarApiFalsa({ 'GET /sessao': SESSAO_ABERTA });
    renderizarComRotas(<Telas />, '/entrar?voltar=%2Fapp%2Fcontas');
    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent('/app/contas'));
  });

  it('só oferece "Criar conta" com o cadastro aberto', async () => {
    instalarApiFalsa({ 'GET /sessao': SESSAO_ANONIMA });
    const { unmount } = renderizarComRotas(<Telas />, '/entrar');
    await screen.findByLabelText('Usuário');
    expect(screen.queryByRole('link', { name: 'Criar conta' })).toBeNull();
    unmount();

    instalarApiFalsa({ 'GET /sessao': { corpo: { autenticado: false, demo: false, cadastroAberto: true } } });
    renderizarComRotas(<Telas />, '/entrar');
    expect(await screen.findByRole('link', { name: 'Criar conta' })).toBeInTheDocument();
  });
});

describe('tela de criar conta', () => {
  it('com o cadastro fechado, volta para a página inicial', async () => {
    instalarApiFalsa({ 'GET /sessao': SESSAO_ANONIMA });
    renderizarComRotas(<Telas />, '/criar-conta');
    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent(/^\/$/));
  });

  it('com o cadastro aberto, cria a conta e entra em /app', async () => {
    const aberta = { corpo: { autenticado: false, demo: false, cadastroAberto: true } };
    const { chamadas } = instalarApiFalsa({
      'GET /sessao': [aberta, SESSAO_ABERTA],
      'POST /cadastro': { status: 201, corpo: { ok: true } },
    });
    renderizarComRotas(<Telas />, '/criar-conta');
    const pessoa = userEvent.setup();
    await pessoa.type(await screen.findByLabelText('Usuário'), 'ana');
    await pessoa.type(screen.getByLabelText('Senha'), 'senha-de-teste');
    await pessoa.click(screen.getByRole('button', { name: 'Criar conta' }));
    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent(/^\/app$/));
    expect(chamadas.find((c) => c.chave === 'POST /cadastro')?.corpo).toEqual({ usuario: 'ana', senha: 'senha-de-teste' });
  });

  it('valida a senha curta com a mensagem do contrato, igual à do servidor', async () => {
    instalarApiFalsa({ 'GET /sessao': { corpo: { autenticado: false, demo: false, cadastroAberto: true } } });
    renderizarComRotas(<Telas />, '/criar-conta');
    const pessoa = userEvent.setup();
    await pessoa.type(await screen.findByLabelText('Usuário'), 'ana');
    await pessoa.type(screen.getByLabelText('Senha'), 'curta');
    await pessoa.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText('A senha precisa ter pelo menos 8 caracteres.')).toBeInTheDocument();
  });
});
