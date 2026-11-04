const CAMINHOS = {
  inicio: 'M3 11.5 12 4l9 7.5M5.5 10v10h13V10',
  lancamentos: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  contas: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0V6a2 2 0 0 1 2-2h12M16 14h2',
  cartoes: 'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm-1 4h20M6 15h4',
  categorias:'M3 12V4h8l10 10-8 8L3 12ZM7.5 8.5h.01',
  config: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6',
  mais: 'M12 5v14M5 12h14',
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
