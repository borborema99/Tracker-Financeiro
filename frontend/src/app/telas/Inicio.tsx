import { useSessao } from '@/lib/sessao';

// Tela inicial provisória da Onda 2: as telas do tracker entram nas Ondas 3 e 4 e aparecem no menu uma a uma.
export default function Inicio() {
  const { sessao } = useSessao();
  return (
    <section className="max-w-xl">
      <h1 className="font-display text-5xl font-black tracking-tight uppercase">Olá, {sessao?.usuario}</h1>
      <p className="mt-4 text-muted-foreground">
        Sua conta está aberta. As telas do tracker estão sendo migradas para esta versão e vão aparecendo no menu à
        medida que ficam prontas.
      </p>
    </section>
  );
}
