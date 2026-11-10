import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Suspense, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { AlternarTema } from '@/components/AlternarTema';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSair, useSessao } from '@/lib/sessao';
import { cn } from '@/lib/utils';
import { Marca } from '@/publico/Layout';
import { enderecoDoModulo, MODULOS } from './modulos';

// Casca do tracker (/app/*): menu lateral recolhível a partir de 900 px, barra inferior abaixo disso, topo com
// tema e sair. Menu, barra e rotas saem de MODULOS: só aparece o que funciona. A guarda de rota fica em rotas.tsx.

const CHAVE_MENU = 'tracker.menuRecolhido';

function lerMenuRecolhido(): boolean {
  try {
    return localStorage.getItem(CHAVE_MENU) === '1';
  } catch {
    return false;
  }
}

function classeDoItem({ isActive }: { isActive: boolean }): string {
  return cn(
    'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
    isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground',
  );
}

export default function Casca() {
  const { sessao } = useSessao();
  const navegar = useNavigate();
  const sair = useSair();
  const [recolhido, setRecolhido] = useState(lerMenuRecolhido);

  const alternarMenu = () => {
    const novo = !recolhido;
    setRecolhido(novo);
    try {
      localStorage.setItem(CHAVE_MENU, novo ? '1' : '0');
    } catch {
      // sem armazenamento: vale só nesta aba
    }
  };

  return (
    <div className="min-h-svh min-[900px]:flex">
      <aside
        className={cn(
          'sticky top-0 hidden h-svh shrink-0 flex-col gap-4 border-r bg-card p-3 min-[900px]:flex',
          recolhido ? 'w-[4.5rem]' : 'w-60',
        )}
      >
        {recolhido ? (
          <NavLink
            to="/"
            aria-label="Tracker Financeiro, página inicial"
            className="grid size-11 place-items-center self-center font-display text-2xl font-black"
          >
            TF
          </NavLink>
        ) : (
          <Marca />
        )}
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-1">
          {MODULOS.map((m) => (
            <NavLink
              key={m.caminho}
              to={enderecoDoModulo(m)}
              end
              className={classeDoItem}
              title={recolhido ? m.rotulo : undefined}
            >
              <m.icone className="size-5 shrink-0" aria-hidden="true" />
              <span className={cn(recolhido && 'sr-only')}>{m.rotulo}</span>
            </NavLink>
          ))}
        </nav>
        <Button
          variant="ghost"
          className="justify-start"
          onClick={alternarMenu}
          aria-pressed={recolhido}
          aria-label={recolhido ? 'Expandir o menu' : 'Recolher o menu'}
        >
          {recolhido ? (
            <PanelLeftOpen className="size-5" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-5" aria-hidden="true" />
          )}
          <span className={cn(recolhido && 'sr-only')}>Recolher menu</span>
        </Button>
      </aside>

      <div className="flex min-h-svh min-w-0 flex-1 flex-col">
        {sessao?.demo ? (
          <p role="note" className="bg-aviso px-4 py-2 text-center text-sm font-medium text-background">
            Dados de demonstração: nada aqui é real.
          </p>
        ) : null}
        <header className="flex items-center justify-between gap-2 border-b px-4 min-[900px]:justify-end">
          <Marca className="text-xl whitespace-nowrap min-[900px]:hidden" />
          <div className="flex items-center gap-1">
            <span className="hidden max-w-40 truncate text-sm text-muted-foreground sm:inline">{sessao?.usuario}</span>
            <AlternarTema />
            <Button
              variant="ghost"
              disabled={sair.isPending}
              onClick={() => sair.mutate(undefined, { onSettled: () => navegar('/', { replace: true }) })}
            >
              <LogOut className="size-5" aria-hidden="true" />
              Sair
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 py-8 pb-28 sm:px-8 min-[900px]:pb-10">
          <Suspense
            fallback={
              <div role="status" aria-label="Carregando">
                <Skeleton className="h-8 w-48" />
              </div>
            }
          >
            <Routes>
              {MODULOS.map((m) => (
                <Route key={m.caminho} path={m.caminho || undefined} index={m.caminho === ''} element={<m.tela />} />
              ))}
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      <nav
        aria-label="Navegação"
        className="fixed inset-x-0 bottom-0 z-10 flex border-t bg-card pb-[env(safe-area-inset-bottom)] min-[900px]:hidden"
      >
        {MODULOS.map((m) => (
          <NavLink
            key={m.caminho}
            to={enderecoDoModulo(m)}
            end
            className={({ isActive }) =>
              cn(
                'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )
            }
          >
            <m.icone className="size-5" aria-hidden="true" />
            {m.rotulo}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
