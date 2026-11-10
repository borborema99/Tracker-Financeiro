import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// Os três estados que toda tela de dados precisa ter: carregando, vazio e erro.

export function Carregando() {
  return (
    <div role="status" aria-label="Carregando" className="space-y-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-card p-6 text-center">
      <p className="font-medium">{titulo}</p>
      {children ? <div className="mt-2 text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function ErroDeTela({ erro, aoTentar }: { erro: Error; aoTentar?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border-2 border-destructive bg-card p-4">
      <p className="font-medium text-destructive">{erro.message}</p>
      {aoTentar ? (
        <Button className="mt-3" variant="outline" onClick={aoTentar}>
          Tentar de novo
        </Button>
      ) : null}
    </div>
  );
}

/** Mensagem de erro de uma ação (salvar, excluir) dentro de um cartão. */
export function ErroDeAcao({ erro }: { erro: Error | null | undefined }) {
  if (!erro) return null;
  return (
    <p role="alert" className="text-sm font-medium text-destructive">
      {erro.message}
    </p>
  );
}
