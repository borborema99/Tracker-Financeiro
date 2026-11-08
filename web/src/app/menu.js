// Itens do menu. Um módulo só entra aqui quando funciona de verdade.
// `aba: true` = fica na barra de baixo do celular; os demais ficam na página "Mais".
export const ITENS_MENU = [
  { para: '/', rotulo: 'Início', icone: 'inicio', aba: true },
  { para: '/lancamentos', rotulo: 'Lançamentos', icone: 'lancamentos', aba: true },
  { para: '/compromissos', rotulo: 'Compromissos', icone: 'compromissos', aba: true },
  { para: '/fluxo', rotulo: 'Fluxo de caixa', icone: 'fluxo', aba: true },
  { para: '/contas', rotulo: 'Contas', icone: 'contas' },
  { para: '/cartoes', rotulo: 'Cartões', icone: 'cartoes' },
  { para: '/recorrencias', rotulo: 'Recorrências', icone: 'recorrencias' },
  { para: '/orcamento', rotulo: 'Orçamento', icone: 'orcamento' },
  { para: '/metas', rotulo: 'Metas', icone: 'metas' },
  { para: '/dividas', rotulo: 'Dívidas', icone: 'dividas' },
  { para: '/assinaturas', rotulo: 'Assinaturas', icone: 'assinaturas' },
  { para: '/categorias', rotulo: 'Categorias', icone: 'categorias' },
  { para: '/alertas', rotulo: 'Alertas', icone: 'alertas' },
  { para: '/config', rotulo: 'Config.', icone: 'config' },
];

export const ITENS_ABAS = ITENS_MENU.filter((i) => i.aba);
export const ITENS_MAIS = ITENS_MENU.filter((i) => !i.aba);

/** A aba "Mais" fica ativa em qualquer tela que não tenha aba própria. */
export function pertenceAoMais(pathname) {
  return pathname === '/mais' || ITENS_MAIS.some((i) => pathname === i.para || pathname.startsWith(`${i.para}/`));
}
