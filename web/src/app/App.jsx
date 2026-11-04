import { Navigate, Route, Routes } from 'react-router-dom';
import { Login } from '../auth/Login.jsx';
import { useSessao } from '../auth/useSessao.js';
import { CartaoDetalhe } from '../cartoes/CartaoDetalhe.jsx';
import { Cartoes } from '../cartoes/Cartoes.jsx';
import { Compra } from '../cartoes/Compra.jsx';
import { Fatura } from '../cartoes/Fatura.jsx';
import { Categorias } from '../categorias/Categorias.jsx';
import { Config } from '../config/Config.jsx';
import { Contas } from '../contas/Contas.jsx';
import { Dashboard } from '../dashboard/Dashboard.jsx';
import { FormularioMovimentacao } from '../movimentacoes/FormularioMovimentacao.jsx';
import { Historico } from '../movimentacoes/Historico.jsx';
import { Lancamentos } from '../movimentacoes/Lancamentos.jsx';
import { Layout } from './Layout.jsx';

export function App() {
  const { data: sessao, isPending, error } = useSessao();

  if (isPending) return <p className="carregando">Carregando…</p>;
  if (error) return <p className="carregando erro">{error.message}</p>;
  if (!sessao.autenticado) return <Login senhaDefinida={sessao.senhaDefinida} demo={sessao.demo} />;

  return (
    <Routes>
      <Route element={<Layout demo={sessao.demo} />}>
        <Route index element={<Dashboard />} />
        <Route path="lancamentos" element={<Lancamentos />} />
        <Route path="lancamentos/novo" element={<FormularioMovimentacao fuso={sessao.fuso} />} />
        <Route path="lancamentos/:id" element={<FormularioMovimentacao fuso={sessao.fuso} />} />
        <Route path="lancamentos/:id/historico" element={<Historico fuso={sessao.fuso} />} />
        <Route path="contas" element={<Contas />} />
        <Route path="cartoes" element={<Cartoes />} />
        <Route path="cartoes/compras/nova" element={<Compra fuso={sessao.fuso} />} />
        <Route path="cartoes/compras/:id" element={<Compra fuso={sessao.fuso} />} />
        <Route path="cartoes/:id" element={<CartaoDetalhe />} />
        <Route path="faturas/:id" element={<Fatura fuso={sessao.fuso} />} />
        <Route path="categorias" element={<Categorias />} />
        <Route path="config" element={<Config fusoInicial={sessao.fuso} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
