import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definirCsrf } from '@/lib/api';
import { EnderecoAtual, instalarApiFalsa, renderizarComRotas, SESSAO_ABERTA } from '@/teste/api-falsa';
import FormularioLancamento from './FormularioLancamento';

const CONTAS = {
  corpo: {
    itens: [
      { id: 1, nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 0, saldo_centavos: 100000, arquivada: false },
      { id: 2, nome: 'Poupança', tipo: 'poupanca', saldo_inicial_centavos: 0, saldo_centavos: 0, arquivada: false },
    ],
  },
};
const CATEGORIAS = {
  corpo: {
    itens: [
      { id: 10, nome: 'Mercado', tipo: 'despesa', pai_id: null, arquivada: false, papel: null, usos: 0 },
      { id: 11, nome: 'Salário', tipo: 'receita', pai_id: null, arquivada: false, papel: null, usos: 0 },
    ],
  },
};

function base(extras: Record<string, { corpo: unknown; status?: number }> = {}) {
  return instalarApiFalsa({
    'GET /sessao': SESSAO_ABERTA,
    'GET /contas': CONTAS,
    'GET /categorias': CATEGORIAS,
    'GET /cartoes': { corpo: { itens: [] } },
    ...extras,
  });
}

function Telas() {
  return (
    <Routes>
      <Route path="/app/lancamentos/novo" element={<FormularioLancamento />} />
      <Route path="*" element={<EnderecoAtual />} />
    </Routes>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  definirCsrf(null);
  localStorage.clear();
});

describe('formulário de lançamento', () => {
  it('lança uma despesa e volta para a lista', async () => {
    const { chamadas } = base({ 'POST /movimentacoes': { corpo: { id: 7 } } });
    const pessoa = userEvent.setup();
    renderizarComRotas(<Telas />, '/app/lancamentos/novo');

    await pessoa.type(await screen.findByLabelText('Valor'), '25,90');
    await pessoa.selectOptions(screen.getByLabelText('Categoria'), '10');
    await pessoa.type(screen.getByLabelText('Descrição'), 'Feira');
    await pessoa.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent('/app/lancamentos'));
    const envio = chamadas.find((c) => c.chave === 'POST /movimentacoes');
    expect(envio?.corpo).toMatchObject({
      tipo: 'despesa',
      valor_centavos: 2590,
      conta_id: 1,
      categoria_id: 10,
      descricao: 'Feira',
      status: 'liquidada',
    });
  });

  it('sem valor, mostra a mensagem do contrato e não chama a API', async () => {
    const { chamadas } = base();
    const pessoa = userEvent.setup();
    renderizarComRotas(<Telas />, '/app/lancamentos/novo');

    await pessoa.click(await screen.findByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(chamadas.some((c) => c.chave === 'POST /movimentacoes')).toBe(false);
  });

  it('transferência pede a conta de destino e esconde a categoria', async () => {
    base();
    const pessoa = userEvent.setup();
    renderizarComRotas(<Telas />, '/app/lancamentos/novo');

    await pessoa.click(await screen.findByRole('radio', { name: 'Transferência' }));

    expect(screen.getByLabelText('Conta de destino')).toBeInTheDocument();
    expect(screen.getByLabelText('Conta de origem')).toBeInTheDocument();
    expect(screen.queryByLabelText('Categoria')).not.toBeInTheDocument();
    const destino = screen.getByLabelText('Conta de destino');
    expect(within(destino).queryByRole('option', { name: 'Corrente' })).not.toBeInTheDocument();
  });

  it('mostra os avisos do servidor (duplicidade) depois de salvar', async () => {
    base({
      'POST /movimentacoes': {
        corpo: { id: 8, avisos: [{ codigo: 'possivel_duplicidade', mensagem: 'Já existe um lançamento parecido.' }] },
      },
    });
    const pessoa = userEvent.setup();
    renderizarComRotas(<Telas />, '/app/lancamentos/novo');

    await pessoa.type(await screen.findByLabelText('Valor'), '10');
    await pessoa.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Já existe um lançamento parecido.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lançamento salvo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver lançamentos' })).toBeInTheDocument();
  });

  it('com cartão cadastrado, sugere registrar como compra no cartão', async () => {
    base({
      'GET /cartoes': {
        corpo: { itens: [{ id: 3, nome: 'Roxinho', limite_centavos: 100000, dia_fechamento: 5, dia_vencimento: 12, conta_pagamento_id: 1, arquivado: false, limite: { limite_centavos: 100000, usado_centavos: 0, disponivel_centavos: 100000, faturas_nao_pagas_centavos: 0, parcelas_futuras_centavos: 0 }, ciclo_atual: { referencia: '2026-11', data_fechamento: '2026-11-05', data_vencimento: '2026-11-12' }, fatura_atual: null }] },
      },
    });
    renderizarComRotas(<Telas />, '/app/lancamentos/novo');
    expect(await screen.findByRole('link', { name: 'Registre como compra no cartão' })).toBeInTheDocument();
  });

  it('sem conta ativa, manda criar uma antes de lançar', async () => {
    base({ 'GET /contas': { corpo: { itens: [] } } });
    renderizarComRotas(<Telas />, '/app/lancamentos/novo');
    expect(await screen.findByText('Antes de lançar, crie uma conta.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para Contas' })).toHaveAttribute('href', '/app/contas');
  });
});
