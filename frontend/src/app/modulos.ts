import { House, type LucideIcon } from 'lucide-react';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// Registro dos módulos do tracker. Regra do produto: o menu só mostra módulo que funciona. Por isso um módulo só
// entra aqui quando a tela está pronta, e menu, barra inferior e rotas saem todos desta lista.

export interface Modulo {
  /** Caminho depois de /app ('' é o início). */
  caminho: string;
  rotulo: string;
  icone: LucideIcon;
  tela: LazyExoticComponent<ComponentType>;
}

export const MODULOS: Modulo[] = [
  { caminho: '', rotulo: 'Início', icone: House, tela: lazy(() => import('./telas/Inicio')) },
];

export function enderecoDoModulo(modulo: Modulo): string {
  return modulo.caminho ? `/app/${modulo.caminho}` : '/app';
}
