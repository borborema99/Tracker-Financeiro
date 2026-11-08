const CAMINHOS = {
  inicio: 'M3 11.5 12 4l9 7.5M5.5 10v10h13V10',
  lancamentos: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  contas: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0V6a2 2 0 0 1 2-2h12M16 14h2',
  cartoes: 'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm-1 4h20M6 15h4',
  categorias:'M3 12V4h8l10 10-8 8L3 12ZM7.5 8.5h.01',
  config: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6',
  mais: 'M12 5v14M5 12h14',
  compromissos: 'M4 6h16v14H4V6Zm0 5h16M8 3v4M16 3v4M9 15.5l2 2 4-4',
  fluxo: 'M3 18l5-6 4 3 8-9M16 6h4v4',
  recorrencias: 'M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5',
  alertas: 'M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17ZM10 21h4',
  orcamento: 'M12 3a9 9 0 1 0 9 9h-9V3ZM15 3.5A9 9 0 0 1 20.5 9H15V3.5Z',
  metas: 'M5 21V4M5 5h12l-2 4 2 4H5',
  dividas: 'M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.8 4.5 3.5 4.5 1.8 4.5 3.5-2 3-4.5 3-4.5-1.3-4.5-3',
  assinaturas: 'M5 6h14v12H5V6Zm0 4h14M8 14h3',
  outros: 'M5 12h.01M12 12h.01M19 12h.01',
  olho: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12ZM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z',
  'olho-fechado': 'M3 4l18 16M2 12s3.6-6.5 10-6.5c1.5 0 2.8.3 4 .9M22 12s-3.6 6.5-10 6.5c-1.5 0-2.8-.3-4-.9',
  menu: 'M4 6h16M4 12h16M4 18h16',
};

export function Icone({ nome }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}
