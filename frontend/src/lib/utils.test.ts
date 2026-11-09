import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('junta classes e ignora valores vazios', () => {
    expect(cn('a', false, undefined, 'b', null)).toBe('a b');
  });

  it('resolve conflito do Tailwind: a última vence', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });
});
