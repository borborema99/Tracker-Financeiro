import { useState } from 'react';
import { esquemaLogin } from '../../../contratos/sessao.js';
import { useLogin } from './useSessao.js';

export function Login({ senhaDefinida, demo }) {
  const [senha, setSenha] = useState('');
  const [erroLocal, setErroLocal] = useState('');
  const login = useLogin();

  function enviar(e) {
    e.preventDefault();
    const valida = esquemaLogin.safeParse({ senha });
    if (!valida.success) return setErroLocal(valida.error.issues[0].message);
    setErroLocal('');
    login.mutate(senha);
  }

  const erro = erroLocal || login.error?.message;

  return (
    <main className="login">
      <form className="cartao login-form" onSubmit={enviar}>
        <h1 className="titulo-marca">Tracker Financeiro</h1>
        {demo && <p className="aviso">Dados de demonstração. Senha: demonstracao</p>}
        {senhaDefinida ? (
          <>
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
            {erro && (
              <p role="alert" className="erro">
                {erro}
              </p>
            )}
            <button type="submit" className="botao-primario" disabled={login.isPending}>
              Entrar
            </button>
          </>
        ) : (
          <p>
            Nenhuma senha definida ainda. No terminal, na pasta do projeto, rode <code>npm run setup</code> e
            recarregue esta página.
          </p>
        )}
      </form>
    </main>
  );
}
