import {
  Bell,
  CalendarClock,
  ChartNoAxesCombined,
  Coins,
  CreditCard,
  FileChartColumn,
  FileUp,
  FolderTree,
  HandCoins,
  House,
  Landmark,
  PiggyBank,
  ReceiptText,
  Repeat,
  Repeat2,
  Scale,
  Settings,
  Target,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type Tela = LazyExoticComponent<ComponentType>;

export interface Modulo {
  caminho: string;
  rotulo: string;
  icone: LucideIcon;
  tela: Tela;
  /** Telas filhas (formulários, detalhes), com caminho relativo a /app. Não aparecem no menu. */
  subrotas?: { caminho: string; tela: Tela }[];
  /** Entra na barra inferior do celular; os demais ficam em "Mais". */
  barra?: boolean;
}

// Registro dos módulos do tracker. Um módulo só entra aqui quando a tela funciona de verdade: o menu lateral, a
// barra inferior, a página "Mais" e as rotas saem desta lista.
export const MODULOS: Modulo[] = [
  { caminho: '', rotulo: 'Início', icone: House, tela: lazy(() => import('./telas/Inicio')), barra: true },
  {
    caminho: 'lancamentos',
    rotulo: 'Lançamentos',
    icone: ReceiptText,
    tela: lazy(() => import('./telas/Lancamentos')),
    subrotas: [
      { caminho: 'lancamentos/novo', tela: lazy(() => import('./telas/FormularioLancamento')) },
      { caminho: 'lancamentos/:id', tela: lazy(() => import('./telas/FormularioLancamento')) },
      { caminho: 'lancamentos/:id/historico', tela: lazy(() => import('./telas/HistoricoLancamento')) },
      { caminho: 'lancamentos/:id/anexos', tela: lazy(() => import('./telas/Anexos')) },
    ],
    barra: true,
  },
  {
    caminho: 'compromissos',
    rotulo: 'Compromissos',
    icone: CalendarClock,
    tela: lazy(() => import('./telas/Compromissos')),
    barra: true,
  },
  {
    caminho: 'cartoes',
    rotulo: 'Cartões',
    icone: CreditCard,
    tela: lazy(() => import('./telas/Cartoes')),
    subrotas: [
      { caminho: 'cartoes/compras/nova', tela: lazy(() => import('./telas/CompraCartao')) },
      { caminho: 'cartoes/compras/:id', tela: lazy(() => import('./telas/CompraCartao')) },
      { caminho: 'cartoes/:id', tela: lazy(() => import('./telas/CartaoDetalhe')) },
      { caminho: 'faturas/:id', tela: lazy(() => import('./telas/Fatura')) },
    ],
  },
  { caminho: 'fluxo', rotulo: 'Fluxo de caixa', icone: ChartNoAxesCombined, tela: lazy(() => import('./telas/Fluxo')), barra: true },
  {
    caminho: 'recorrencias',
    rotulo: 'Recorrências',
    icone: Repeat,
    tela: lazy(() => import('./telas/Recorrencias')),
    subrotas: [
      { caminho: 'recorrencias/nova', tela: lazy(() => import('./telas/FormularioRecorrencia')) },
      { caminho: 'recorrencias/:id', tela: lazy(() => import('./telas/FormularioRecorrencia')) },
    ],
  },
  { caminho: 'orcamento', rotulo: 'Orçamento', icone: PiggyBank, tela: lazy(() => import('./telas/Orcamento')) },
  { caminho: 'metas', rotulo: 'Metas', icone: Target, tela: lazy(() => import('./telas/Metas')) },
  {
    caminho: 'dividas',
    rotulo: 'Dívidas',
    icone: HandCoins,
    tela: lazy(() => import('./telas/Dividas')),
    subrotas: [
      { caminho: 'dividas/nova', tela: lazy(() => import('./telas/FormularioDivida')) },
      { caminho: 'dividas/:id', tela: lazy(() => import('./telas/DividaDetalhe')) },
    ],
  },
  { caminho: 'assinaturas', rotulo: 'Assinaturas', icone: Repeat2, tela: lazy(() => import('./telas/Assinaturas')) },
  { caminho: 'investimentos', rotulo: 'Investimentos', icone: TrendingUp, tela: lazy(() => import('./telas/Investimentos')) },
  { caminho: 'moedas', rotulo: 'Moedas', icone: Coins, tela: lazy(() => import('./telas/Moedas')) },
  { caminho: 'patrimonio', rotulo: 'Patrimônio', icone: Scale, tela: lazy(() => import('./telas/Patrimonio')) },
  { caminho: 'relatorios', rotulo: 'Relatórios', icone: FileChartColumn, tela: lazy(() => import('./telas/Relatorios')) },
  { caminho: 'importar', rotulo: 'Importar extrato', icone: FileUp, tela: lazy(() => import('./telas/ImportarOfx')) },
  { caminho: 'contas', rotulo: 'Contas', icone: Landmark, tela: lazy(() => import('./telas/Contas')) },
  { caminho: 'categorias', rotulo: 'Categorias', icone: FolderTree, tela: lazy(() => import('./telas/Categorias')) },
  { caminho: 'alertas', rotulo: 'Alertas', icone: Bell, tela: lazy(() => import('./telas/Alertas')) },
  { caminho: 'conta', rotulo: 'Conta', icone: UserRound, tela: lazy(() => import('./telas/Conta')) },
  { caminho: 'configuracoes', rotulo: 'Configurações', icone: Settings, tela: lazy(() => import('./telas/Configuracoes')) },
];

/** O link (no formato do servidor, ex.: '/orcamento?mes=2026-11') leva a uma tela que já existe? */
export function destinoExiste(link: string): boolean {
  const semAnchor = (link.split(/[?#]/)[0] ?? '').replace(/^\/app(?=\/|$)/, '');
  const primeiro = semAnchor.split('/').filter(Boolean)[0] ?? '';
  return MODULOS.some(
    (m) => m.caminho === primeiro || (m.subrotas ?? []).some((s) => s.caminho.split('/')[0] === primeiro),
  );
}

export function enderecoDoModulo(modulo: Modulo): string {
  return modulo.caminho ? `/app/${modulo.caminho}` : '/app';
}
