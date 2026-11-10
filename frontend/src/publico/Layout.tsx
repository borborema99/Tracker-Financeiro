import { Tag } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSessao } from '@/lib/sessao';
import { cn } from '@/lib/utils';

// Peças comuns das páginas públicas (landing, entrar, criar conta, privacidade, termos). Tudo aqui é leve de
// propósito: a landing não pode puxar o código do tracker.

export function Marca({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn('inline-flex min-h-11 items-center gap-2 font-display text-2xl font-black tracking-wide uppercase', className)}
    >
      <span
        className="grid size-8 shrink-0 place-items-center rounded-sm bg-tinta text-amarelo outline-1 outline-amarelo/70"
        aria-hidden="true"
      >
        <Tag className="size-4" />
      </span>
      Tracker Financeiro
    </Link>
  );
}

const botaoSobreAmarelo =
  'h-12 bg-tinta px-6 font-display text-xl font-extrabold tracking-wide text-amarelo uppercase hover:bg-tinta/85';
const botaoContornoSobreAmarelo =
  'h-12 border-2 border-tinta bg-transparent px-6 font-display text-xl font-extrabold tracking-wide text-amarelo-foreground uppercase hover:bg-tinta hover:text-amarelo';

/** Botões de acesso. Enquanto a sessão carrega mostra "Entrar": /entrar leva quem já está logado para /app. */
export function BotoesDeAcesso({ className }: { className?: string }) {
  const { sessao } = useSessao();
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      {sessao?.autenticado ? (
        <Button asChild className={botaoSobreAmarelo}>
          <Link to="/app">Abrir meu tracker</Link>
        </Button>
      ) : (
        <>
          <Button asChild className={botaoSobreAmarelo}>
            <Link to="/entrar">Entrar</Link>
          </Button>
          {sessao?.cadastroAberto ? (
            <Button asChild className={botaoContornoSobreAmarelo}>
              <Link to="/criar-conta">Criar conta</Link>
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

export function Rodape({ className }: { className?: string }) {
  return (
    <footer className={cn('bg-tinta text-amarelo', className)}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-6 sm:px-8">
        <p className="font-display text-xl font-extrabold tracking-wide uppercase">Tracker Financeiro</p>
        <nav aria-label="Documentos" className="flex flex-wrap gap-x-6">
          <Link to="/privacidade" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:no-underline">
            Política de Privacidade
          </Link>
          <Link to="/termos" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:no-underline">
            Termos de Uso
          </Link>
        </nav>
      </div>
    </footer>
  );
}

/** Página de texto legal. O texto é rascunho: a faixa avisa que precisa de revisão jurídica antes de valer. */
export function LayoutLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-amarelo text-amarelo-foreground [--ring:var(--tinta)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-8">
          <Marca />
          <Link to="/" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:no-underline">
            Voltar ao início
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-8">
        <p
          role="note"
          className="mb-8 rounded-md border-2 border-aviso bg-card px-4 py-3 text-sm font-medium text-aviso"
        >
          Rascunho para revisão jurídica. Este texto ainda não foi revisado por advogado e não vale como documento final.
        </p>
        <h1 className="font-display text-5xl font-black tracking-tight uppercase sm:text-6xl">{titulo}</h1>
        <div className="mt-8 space-y-4 leading-relaxed [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-3xl [&_h2]:font-extrabold [&_h2]:tracking-wide [&_h2]:uppercase [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-2">
          {children}
        </div>
      </main>
      <Rodape />
    </div>
  );
}
