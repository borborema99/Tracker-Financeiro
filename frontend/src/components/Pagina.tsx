import type { ReactNode } from 'react';

/** Cabeçalho padrão de tela: título grande, ação principal à direita e o conteúdo embaixo. */
export function Pagina({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-black tracking-tight uppercase sm:text-5xl">{titulo}</h1>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">{titulo}</h2>
      {children}
    </div>
  );
}
