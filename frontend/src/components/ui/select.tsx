import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Seletor nativo estilizado: o Select do Radix injeta estilo inline e quebra a CSP (ADR 013), e o nativo abre melhor no celular.
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-card-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive md:text-sm',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
