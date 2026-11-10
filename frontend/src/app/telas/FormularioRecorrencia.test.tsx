import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definirCsrf } from '@/lib/api';
import { EnderecoAtual, instalarApiFalsa, renderizarComRotas, SESSAO_ABERTA } from '@/teste/api-falsa';
import FormularioRecorrencia from './FormularioRecorrencia';

const CONTAS = { corpo: { itens: [{ id: 1, nome: 'Corrente', tipo: 'corrente', saldo_inicial_centavos: 0, saldo_centavos: 0, arquivada: false }] } };
const CATEGORIAS = { corpo: { itens: [{ id: 10, nome: 'Streaming', tipo: 'despesa', pai_id: null, arquivada: false, papel: null, usos: 0 }] } };

function base(extras: Record<string, { corpo: unknown; status?: number }> = {}) {
  return instalarApiFalsa({ 'GET /sessao': SESSAO_ABERTA, 'GET /contas': CONTAS, 'GET /categorias': CATEGORIAS, ...extras });
}

function Telas() {
  return (
    <Routes>
      <Route path="/app/recorrencias/nova" element={<FormularioRecorrencia />} />
      <Route path="*" element={<EnderecoAtual />} />
    </Routes>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  definirCsrf(null);
  localStorage.clear();
});

describe('formulário de recorrência', () => {
  it('vindo de "Nova assinatura", já marca assinatura e volta para Assinaturas ao salvar', async () => {
    const { chamadas } = base({ 'POST /recorrencias': { corpo: { id: 5 } } });
    const pessoa = userEvent.setup();
    renderizarComRotas(<Telas />, '/app/recorrencias/nova?assinatura=1');

    expect(await screen.findByLabelText(/É uma assinatura/)).toBeChecked();
    await pessoa.type(screen.getByLabelText('Descrição'), 'Streaming');
    await pessoa.type(screen.getByLabelText('Valor de cada ocorrência'), '39,90');
    await pessoa.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent('/app/assinaturas'));
    expect(chamadas.find((c) => c.chave === 'POST /recorrencias')?.corpo).toMatchObject({ assinatura: true, tipo: 'despesa', valor_centavos: 3990 });
  });

  it('recorrência comum não vira assinatura e volta para Recorrências', async () => {
    const { chamadas } = base({ 'POST /recorrencias': { corpo: { id: 6 } } });
    const pessoa = userEvent.setup();
    renderizarComRotas(<Telas />, '/app/recorrencias/nova');

    expect(await screen.findByLabelText(/É uma assinatura/)).not.toBeChecked();
    await pessoa.type(screen.getByLabelText('Descrição'), 'Aluguel');
    await pessoa.type(screen.getByLabelText('Valor de cada ocorrência'), '1500');
    await pessoa.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent('/app/recorrencias'));
    expect(chamadas.find((c) => c.chave === 'POST /recorrencias')?.corpo).toMatchObject({ assinatura: false });
  });

  it('receita não tem a opção de assinatura e nunca é gravada como assinatura', async () => {
    const { chamadas } = base({ 'POST /recorrencias': { corpo: { id: 7 } } });
    const pessoa = userEvent.setup();
    renderizarComRotas(<Telas />, '/app/recorrencias/nova?assinatura=1');

    await screen.findByLabelText(/É uma assinatura/);
    await pessoa.click(screen.getByRole('button', { name: 'Receita' }));
    expect(screen.queryByLabelText(/É uma assinatura/)).not.toBeInTheDocument();
    await pessoa.type(screen.getByLabelText('Descrição'), 'Salário');
    await pessoa.type(screen.getByLabelText('Valor de cada ocorrência'), '3000');
    await pessoa.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(chamadas.some((c) => c.chave === 'POST /recorrencias')).toBe(true));
    expect(chamadas.find((c) => c.chave === 'POST /recorrencias')?.corpo).toMatchObject({ tipo: 'receita', assinatura: false });
  });
});
