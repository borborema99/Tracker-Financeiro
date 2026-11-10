import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { esquemaExclusaoConta, esquemaTrocaSenha } from '../../../../contratos/sessao.js';
import { Campo } from '@/components/Campo';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, definirCsrf } from '@/lib/api';
import { erroDoCampo, useFormulario } from '@/lib/formulario';
import { useSair, useSessao } from '@/lib/sessao';
import { ErroGeral } from './comumFormulario';

const Secao = ({ titulo, children, perigo = false }: { titulo: string; children: React.ReactNode; perigo?: boolean }) => (
  <section className={`max-w-xl space-y-4 rounded-lg border bg-card p-4 ${perigo ? 'border-destructive' : ''}`}>
    <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">{titulo}</h2>
    {children}
  </section>
);

function TrocarSenha() {
  const form = useFormulario<{ senha_atual: string; senha_nova: string }>(esquemaTrocaSenha, { senha_atual: '', senha_nova: '' });
  const [feito, setFeito] = useState(false);
  const trocar = useMutation({ mutationFn: (corpo: { senha_atual: string; senha_nova: string }) => api('/senha', { metodo: 'POST', corpo }) });
  const erros = form.formState.errors;

  const enviar = form.handleSubmit(async (valores) => {
    setFeito(false);
    try {
      await trocar.mutateAsync(valores);
      form.reset();
      setFeito(true);
    } catch (erro) {
      form.aplicarErro(erro);
    }
  });

  return (
    <Secao titulo="Trocar a senha">
      <form noValidate className="space-y-4" onSubmit={enviar}>
        <Campo id="senha-atual" rotulo="Senha atual" erro={erroDoCampo(erros, 'senha_atual')}>
          <Input id="senha-atual" type="password" autoComplete="current-password" {...form.register('senha_atual')} />
        </Campo>
        <Campo id="senha-nova" rotulo="Senha nova" erro={erroDoCampo(erros, 'senha_nova')}>
          <Input id="senha-nova" type="password" autoComplete="new-password" {...form.register('senha_nova')} />
        </Campo>
        <ErroGeral texto={form.erroDoServidor ?? null} />
        {feito ? (
          <p role="status" className="text-sm font-medium text-entrada">
            Senha alterada.
          </p>
        ) : null}
        <Button type="submit" disabled={trocar.isPending}>
          Trocar senha
        </Button>
      </form>
    </Secao>
  );
}

function OutrasSessoes() {
  const encerrar = useMutation({ mutationFn: () => api<{ encerradas: number }>('/sessoes/encerrar-outras', { metodo: 'POST' }) });
  return (
    <Secao titulo="Outros aparelhos">
      <p className="text-sm text-muted-foreground">
        Se você entrou em outro celular ou computador e quer garantir que ninguém mais use a sua conta, encerre as outras sessões. Esta continua aberta.
      </p>
      <Button variant="outline" disabled={encerrar.isPending} onClick={() => encerrar.mutate()}>
        Encerrar as outras sessões
      </Button>
      {encerrar.isSuccess ? (
        <p role="status" className="text-sm font-medium text-entrada">
          {encerrar.data.encerradas === 0
            ? 'Não havia outras sessões abertas.'
            : `${encerrar.data.encerradas} ${encerrar.data.encerradas === 1 ? 'sessão encerrada' : 'sessões encerradas'}.`}
        </p>
      ) : null}
      <ErroGeral texto={encerrar.error?.message ?? null} />
    </Secao>
  );
}

function Exportar() {
  return (
    <Secao titulo="Exportar seus dados">
      <p className="text-sm text-muted-foreground">Os arquivos são gerados na hora e baixados para este aparelho.</p>
      <ul className="space-y-2">
        <li>
          <a className="inline-flex min-h-11 items-center underline underline-offset-4" href="/api/exportar/lancamentos.csv" download>
            Lançamentos (CSV, para planilha)
          </a>
        </li>
        <li>
          <a className="inline-flex min-h-11 items-center underline underline-offset-4" href="/api/exportar/compras-cartao.csv" download>
            Compras no cartão (CSV)
          </a>
        </li>
        <li>
          <a className="inline-flex min-h-11 items-center underline underline-offset-4" href="/api/exportar/tudo.json" download>
            Cópia completa (JSON)
          </a>
        </li>
      </ul>
      <p className="text-sm text-muted-foreground">O JSON não inclui a senha.</p>
    </Secao>
  );
}

function ExcluirConta({ usuario }: { usuario: string }) {
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const form = useFormulario<{ confirmacao: string; senha: string }>(esquemaExclusaoConta, { confirmacao: '', senha: '' });
  const excluir = useMutation({ mutationFn: (corpo: { confirmacao: string; senha: string }) => api('/conta', { metodo: 'DELETE', corpo }) });
  const erros = form.formState.errors;
  const digitado = form.watch('confirmacao');

  const enviar = form.handleSubmit(async (valores) => {
    try {
      await excluir.mutateAsync(valores);
    } catch (erro) {
      form.aplicarErro(erro);
      return;
    }
    definirCsrf(null);
    cliente.clear();
    navegar('/', { replace: true });
  });

  return (
    <Secao titulo="Excluir a conta" perigo>
      <p className="text-sm">
        Apaga a conta e <strong>todos</strong> os seus dados: contas, lançamentos, cartões, metas, comprovantes. Não dá para desfazer. Antes, exporte uma
        cópia acima.
      </p>
      <form noValidate className="space-y-4" onSubmit={enviar}>
        <Campo id="excluir-usuario" rotulo={`Digite seu nome de usuário (${usuario}) para confirmar`} erro={erroDoCampo(erros, 'confirmacao')}>
          <Input
            id="excluir-usuario"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            {...form.register('confirmacao')}
          />
        </Campo>
        <Campo id="excluir-senha" rotulo="Senha" erro={erroDoCampo(erros, 'senha')}>
          <Input id="excluir-senha" type="password" autoComplete="current-password" {...form.register('senha')} />
        </Campo>
        <ErroGeral texto={form.erroDoServidor ?? null} />
        <Button type="submit" variant="destructive" disabled={excluir.isPending || digitado !== usuario}>
          Excluir minha conta para sempre
        </Button>
      </form>
    </Secao>
  );
}

export default function Conta() {
  const { sessao } = useSessao();
  const navegar = useNavigate();
  const sair = useSair();
  return (
    <Pagina titulo="Conta">
      <p className="text-muted-foreground">
        Entrou como <strong className="text-foreground">{sessao?.usuario ?? '—'}</strong>.
      </p>
      <Button
        variant="outline"
        className="self-start"
        disabled={sair.isPending}
        onClick={() => sair.mutate(undefined, { onSettled: () => navegar('/', { replace: true }) })}
      >
        Sair
      </Button>
      <TrocarSenha />
      <OutrasSessoes />
      <Exportar />
      {sessao?.usuario ? <ExcluirConta usuario={sessao.usuario} /> : null}
    </Pagina>
  );
}
