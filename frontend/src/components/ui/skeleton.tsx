import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Estado de carregando: bloco neutro que pulsa. Quem usa descreve o que carrega em `aria-label` no contêiner. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  );
}
