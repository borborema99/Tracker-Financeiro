import { Button } from '@/components/ui/button';
import { nomeDoMes, somarMesesIso } from '@/lib/datas';

/** Mês atual, anterior e próximo ('AAAA-MM'). Usado por Orçamento e pelas telas que olham um mês de cada vez. */
export function NavegacaoMes({ mes, aoMudar }: { mes: string; aoMudar: (mes: string) => void }) {
  return (
    <div className="flex max-w-xl items-center justify-between gap-2">
      <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => aoMudar(somarMesesIso(mes, -1))}>
        ‹
      </Button>
      <strong className="font-display text-2xl tracking-wide uppercase">{nomeDoMes(mes)}</strong>
      <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => aoMudar(somarMesesIso(mes, 1))}>
        ›
      </Button>
    </div>
  );
}
