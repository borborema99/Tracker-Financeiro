import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('é type="button" por padrão (não envia formulário sem querer)', () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveAttribute('type', 'button');
  });

  it('todo tamanho tem alvo de toque de pelo menos 44px (2.75rem)', () => {
    render(
      <>
        <Button>Padrão</Button>
        <Button size="sm">Pequeno</Button>
        <Button size="lg">Grande</Button>
        <Button size="icon" aria-label="Ícone" />
      </>,
    );
    for (const nome of ['Padrão', 'Pequeno', 'Grande', 'Ícone']) {
      expect(screen.getByRole('button', { name: nome }).className).toMatch(/\b(h-11|h-12|size-11)\b/);
    }
  });

  it('dispara o clique e respeita disabled', async () => {
    const aoClicar = vi.fn();
    const usuario = userEvent.setup();
    const { rerender } = render(<Button onClick={aoClicar}>Ir</Button>);
    await usuario.click(screen.getByRole('button', { name: 'Ir' }));
    expect(aoClicar).toHaveBeenCalledTimes(1);
    rerender(
      <Button onClick={aoClicar} disabled>
        Ir
      </Button>,
    );
    await usuario.click(screen.getByRole('button', { name: 'Ir' }));
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it('asChild vira o elemento filho (link com cara de botão)', () => {
    render(
      <Button asChild>
        <a href="/entrar">Entrar</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Entrar' });
    expect(link).toHaveAttribute('href', '/entrar');
    expect(link).not.toHaveAttribute('type');
  });
});
