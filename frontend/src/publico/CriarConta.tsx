import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useSessao } from '@/lib/sessao';
import { FormularioAcesso, PaginaAcesso } from './FormularioAcesso';

// A tela só existe com o cadastro aberto (CADASTRO_ABERTO=1 no servidor). Fechado, o servidor responde 404 a
// POST /api/cadastro e esta rota volta para a página inicial, como se não existisse.
export default function CriarConta() {
  const navegar = useNavigate();
  const { sessao, carregando, erro } = useSessao();

  if (carregando) {
    return (
      <div role="status" aria-label="Carregando" className="p-6">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }
  if (sessao?.autenticado) return <Navigate to="/app" replace />;
  if (erro || !sessao?.cadastroAberto) return <Navigate to="/" replace />;

  return (
    <PaginaAcesso titulo="Criar conta" apoio="Escolha um usuário e uma senha. Seus dados ficam separados dos de qualquer outra pessoa.">
      <FormularioAcesso modo="cadastrar" aoConcluir={() => navegar('/app', { replace: true })} />
      <div className="mt-8 space-y-3 text-sm text-muted-foreground">
        <p>
          Ao criar a conta você concorda com os{' '}
          <Link to="/termos" className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
            Termos de Uso
          </Link>{' '}
          e a{' '}
          <Link to="/privacidade" className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
            Política de Privacidade
          </Link>
          .
        </p>
        <p>
          Já tem conta?{' '}
          <Link to="/entrar" className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
            Entrar
          </Link>
        </p>
      </div>
    </PaginaAcesso>
  );
}
