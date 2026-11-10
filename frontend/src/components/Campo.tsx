import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

interface Props {
  id: string;
  rotulo: string;
  erro?: string | undefined;
  dica?: string;
  children: ReactNode;
}

/** Rótulo, controle e mensagem de erro de um campo. O controle precisa usar o mesmo `id`. */
export function Campo({ id, rotulo, erro, dica, children }: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {dica && !erro ? <p className="text-sm text-muted-foreground">{dica}</p> : null}
      {erro ? (
        <p id={`${id}-erro`} role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
