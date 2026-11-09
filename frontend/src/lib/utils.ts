import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Junta classes do Tailwind resolvendo conflitos (a última vence). Usada por todos os componentes. */
export function cn(...entradas: ClassValue[]): string {
  return twMerge(clsx(entradas));
}
