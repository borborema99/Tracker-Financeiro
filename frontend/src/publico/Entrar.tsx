import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { destinoSeguro } from '@/lib/redirecionamento';
import { useSessao } from '@/lib/sessao';
import { FormularioAcesso, PaginaAcesso } from './FormularioAcesso';

export default function Entrar() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const { sessao } = useSessao();
  // Volta para a página que a pessoa tentou abrir. Só caminho interno de /app vale (nunca URL externa).
  const destino = destinoSeguro(params.get('voltar'));

  if (sessao?.autenticado) return <Navigate to={destino} replace />;

  return (
    <PaginaAcesso titulo="Entrar" apoio="Abra o seu tracker com o usuário e a senha da sua conta.">
      <FormularioAcesso modo="entrar" aoConcluir={() => navegar(destino, { replace: true })} />
      <div className="mt-8 space-y-3 text-sm text-muted-foreground">
        <p>
          Esqueceu a senha? Este site não envia e-mail: quem administra o site a redefine com o comando{' '}
          <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs text-foreground">npm run redefinir-senha</code>.
        </p>
        {sessao?.cadastroAberto ? (
          <p>
            Ainda não tem conta?{' '}
            <Link to="/criar-conta" className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
              Criar conta
            </Link>
          </p>
        ) : null}
        <p>
          <Link to="/" className="underline underline-offset-4 hover:no-underline">
            Voltar ao início
          </Link>
        </p>
      </div>
    </PaginaAcesso>
  );
}
