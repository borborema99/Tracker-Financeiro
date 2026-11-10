import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { caminhoDeLogin } from '@/lib/redirecionamento';
import { useSessao } from '@/lib/sessao';

// Protege /app/*. Fica na entrada do site (não no chunk da casca) para quem não tem sessão ser mandado para o
// login sem baixar o código do tracker. A proteção real dos dados é do servidor: aqui só se decide o que mostrar.

export function GuardaDeRota({ children }: { children: ReactNode }) {
  const { sessao, carregando, erro, recarregar } = useSessao();
  const local = useLocation();

  if (carregando) {
    return (
      <div role="status" aria-label="Carregando" className="p-6">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (erro) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="font-display text-4xl font-black uppercase">Não deu para abrir</h1>
        <p role="alert" className="mt-3 text-muted-foreground">
          {erro.message}
        </p>
        <Button className="mt-6" onClick={() => void recarregar()}>
          Tentar de novo
        </Button>
      </main>
    );
  }

  if (!sessao?.autenticado) {
    // Lembra a página pedida; depois do login a pessoa volta para ela (só caminho interno de /app).
    return <Navigate to={caminhoDeLogin(`${local.pathname}${local.search}${local.hash}`)} replace />;
  }

  return <>{children}</>;
}
