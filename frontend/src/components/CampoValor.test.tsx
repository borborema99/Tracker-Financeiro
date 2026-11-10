import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CampoValor, limparTextoDeValor } from './CampoValor';

describe('máscara de dinheiro (CampoValor)', () => {
  it('abre o teclado numérico no celular e já traz o rótulo ligado ao campo', () => {
    render(<CampoValor id="v" rotulo="Valor" aoMudar={() => {}} />);
    const campo = screen.getByLabelText('Valor');
    expect(campo).toHaveAttribute('inputmode', 'decimal');
    expect(campo).toHaveAttribute('placeholder', '0,00');
  });

  it('entrega centavos inteiros ao pai enquanto a pessoa digita', async () => {
    const aoMudar = vi.fn();
    render(<CampoValor id="v" rotulo="Valor" aoMudar={aoMudar} />);
    await userEvent.setup().type(screen.getByLabelText('Valor'), '1.234,56');
    expect(aoMudar).toHaveBeenLastCalledWith(123456);
  });

  it('ao sair do campo reescreve no formato do contrato ("12,5" vira "12,50")', async () => {
    const pessoa = userEvent.setup();
    render(<CampoValor id="v" rotulo="Valor" aoMudar={() => {}} />);
    const campo = screen.getByLabelText('Valor');
    await pessoa.type(campo, '12,5');
    await pessoa.tab();
    expect(campo).toHaveValue('12,50');
  });

  it('descarta letras e símbolos que não fazem parte de um valor', async () => {
    const aoMudar = vi.fn();
    render(<CampoValor id="v" rotulo="Valor" aoMudar={aoMudar} />);
    const campo = screen.getByLabelText('Valor');
    await userEvent.setup().type(campo, 'abc9x0');
    expect(campo).toHaveValue('90');
    expect(aoMudar).toHaveBeenLastCalledWith(9000);
    expect(limparTextoDeValor('R$ 1.000,00 !#')).toBe('R$ 1.000,00 ');
  });

  it('valor inválido avisa o erro e entrega null', async () => {
    const aoMudar = vi.fn();
    render(<CampoValor id="v" rotulo="Valor" aoMudar={aoMudar} />);
    await userEvent.setup().type(screen.getByLabelText('Valor'), '1,2,3');
    expect(await screen.findByRole('alert')).toHaveTextContent('Valor inválido');
    expect(aoMudar).toHaveBeenLastCalledWith(null);
  });

  it('não aceita negativo, a não ser que o campo permita (saldo inicial)', async () => {
    const semNegativo = vi.fn();
    const { unmount } = render(<CampoValor id="a" rotulo="Valor" aoMudar={semNegativo} />);
    await userEvent.setup().type(screen.getByLabelText('Valor'), '-10');
    expect(semNegativo).toHaveBeenLastCalledWith(null);
    unmount();

    const comNegativo = vi.fn();
    render(<CampoValor id="b" rotulo="Saldo" aoMudar={comNegativo} permitirNegativo />);
    await userEvent.setup().type(screen.getByLabelText('Saldo'), '-10');
    expect(comNegativo).toHaveBeenLastCalledWith(-1000);
  });

  it('começa com o valor inicial formatado e campo vazio vira null', async () => {
    const aoMudar = vi.fn();
    render(<CampoValor id="v" rotulo="Valor" inicial={150000} aoMudar={aoMudar} />);
    const campo = screen.getByLabelText('Valor');
    expect(campo).toHaveValue('1500,00');
    await userEvent.setup().clear(campo);
    expect(aoMudar).toHaveBeenLastCalledWith(null);
  });
});
