import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Cor nunca é o único sinal: o texto da etiqueta diz o estado (entrada, saída, aviso).
const variantes = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        entrada: 'border-entrada/40 bg-card text-entrada',
        saida: 'border-saida/40 bg-card text-saida',
        aviso: 'border-aviso/40 bg-card text-aviso',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge({ className, variant, ...props }: ComponentProps<'span'> & VariantProps<typeof variantes>) {
  return <span data-slot="badge" className={cn(variantes({ variant }), className)} {...props} />;
}
