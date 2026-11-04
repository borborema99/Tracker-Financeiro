import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLogout } from '../auth/useSessao.js';
import { api } from '../compartilhado/api.js';

const FUSOS = Intl.supportedValuesOf('timeZone');

export function Config({ fusoInicial }) {
  const cliente = useQueryClient();
  const logout = useLogout();
  const [fuso, setFuso] = useState(fusoInicial);
  const saude = useQuery({ queryKey: ['saude'], queryFn: () => api('/saude') });
  const salvar = useMutation({
    mutationFn: () => api('/config', { metodo: 'PUT', corpo: { fuso } }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['sessao'] }),
  });

  return (
    <section>
      <h1>Configurações</h1>

      <form
        className="cartao"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <label htmlFor="fuso">Fuso horário de exibição</label>
        <select id="fuso" value={fuso} onChange={(e) => setFuso(e.target.value)}>
          {FUSOS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        {salvar.error && (
          <p role="alert" className="erro">
            {salvar.error.message}
          </p>
        )}
        {salvar.isSuccess && <p className="ok">Salvo.</p>}
        <button type="submit" className="botao-primario" disabled={salvar.isPending || fuso === fusoInicial}>
          Salvar
        </button>
      </form>

      <div className="cartao">
        <h2>Sessão</h2>
        <button type="button" className="botao" onClick={() => logout.mutate()} disabled={logout.isPending}>
          Sair
        </button>
        <p className="suave">Para trocar a senha, rode <code>npm run redefinir-senha</code> no terminal.</p>
      </div>

      {saude.data && <p className="suave">Versão {saude.data.versao}</p>}
    </section>
  );
}
