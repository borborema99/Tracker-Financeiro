import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { esquemaCadastro, esquemaLogin } from '../../../contratos/sessao.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErroApi } from '@/lib/api';
import { useCriarConta, useEntrar } from '@/lib/sessao';
import { Marca } from './Layout';

// Formulário de usuário e senha das páginas /entrar e /criar-conta. Os esquemas são os mesmos do servidor
// (contratos/sessao.js), então a mensagem de validação é a mesma nas duas pontas.

interface Campos {
  usuario: string;
  senha: string;
}

interface Props {
  modo: 'entrar' | 'cadastrar';
  aoConcluir: () => void;
}

export function FormularioAcesso({ modo, aoConcluir }: Props) {
  const entrando = modo === 'entrar';
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const entrar = useEntrar();
  const criar = useCriarConta();
  const envio = entrando ? entrar : criar;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Campos>({ resolver: zodResolver(entrando ? esquemaLogin : esquemaCadastro) });

  const aoEnviar = handleSubmit(async (valores) => {
    try {
      await envio.mutateAsync(valores);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.campos) {
        for (const [campo, mensagem] of Object.entries(erro.campos)) {
          if (campo === 'usuario' || campo === 'senha') setError(campo, { message: mensagem });
        }
        return;
      }
      setError('root.servidor', { message: erro instanceof Error ? erro.message : 'Algo deu errado.' });
      return;
    }
    aoConcluir();
  });

  const erroDoServidor = errors.root?.servidor?.message;

  return (
    <form onSubmit={aoEnviar} noValidate className="space-y-5">
      {erroDoServidor ? (
        <p role="alert" className="rounded-md border-2 border-destructive bg-card px-4 py-3 text-sm font-medium text-destructive">
          {erroDoServidor}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="usuario">Usuário</Label>
        <Input
          id="usuario"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={errors.usuario ? true : undefined}
          aria-describedby={errors.usuario ? 'usuario-erro' : undefined}
          {...register('usuario')}
        />
        {errors.usuario ? (
          <p id="usuario-erro" className="text-sm text-destructive">
            {errors.usuario.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="senha">Senha</Label>
        <div className="relative">
          <Input
            id="senha"
            type={senhaVisivel ? 'text' : 'password'}
            autoComplete={entrando ? 'current-password' : 'new-password'}
            className="pr-12"
            aria-invalid={errors.senha ? true : undefined}
            aria-describedby={errors.senha ? 'senha-erro' : undefined}
            {...register('senha')}
          />
          <button
            type="button"
            onClick={() => setSenhaVisivel((v) => !v)}
            aria-pressed={senhaVisivel}
            aria-label={senhaVisivel ? 'Esconder a senha' : 'Mostrar a senha'}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground"
          >
            {senhaVisivel ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
        {errors.senha ? (
          <p id="senha-erro" className="text-sm text-destructive">
            {errors.senha.message}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" className="w-full font-display text-xl font-extrabold tracking-wide uppercase" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : null}
        {isSubmitting ? (entrando ? 'Entrando…' : 'Criando…') : entrando ? 'Entrar' : 'Criar conta'}
      </Button>
    </form>
  );
}

/** Moldura das páginas de acesso: faixa amarela com o título e, ao lado (embaixo no celular), o formulário. */
export function PaginaAcesso({ titulo, apoio, children }: { titulo: string; apoio: string; children: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <section className="flex flex-col justify-between gap-12 bg-amarelo px-4 pt-2 pb-10 text-amarelo-foreground [--ring:var(--tinta)] sm:px-8 lg:px-12 lg:pb-16">
        <Marca />
        <div>
          <h1 className="font-display text-6xl font-black tracking-tight uppercase lg:text-8xl">{titulo}</h1>
          <p className="mt-3 max-w-sm text-lg">{apoio}</p>
        </div>
      </section>
      <main className="flex items-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
