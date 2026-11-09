import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Alvo de toque mínimo de 44px (h-11) em todos os tamanhos: o tracker é mobile-first.
const variantes = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border bg-card hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-4',
        sm: 'h-11 px-3',
        lg: 'h-12 px-6 text-base',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

type Props = ComponentProps<'button'> & VariantProps<typeof variantes> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, ...props }: Props) {
  const Componente = asChild ? Slot : 'button';
  return (
    <Componente
      data-slot="button"
      {...(asChild ? {} : { type: props.type ?? 'button' })}
      className={cn(variantes({ variant, size }), className)}
      {...props}
    />
  );
}

export { variantes as variantesDeBotao };
