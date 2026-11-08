import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Alertas } from '../alertas/Alertas.jsx';
import { Login } from '../auth/Login.jsx';
import { useSessao } from '../auth/useSessao.js';
import { CartaoDetalhe } from '../cartoes/CartaoDetalhe.jsx';
import { Cartoes } from '../cartoes/Cartoes.jsx';
import { Compra } from '../cartoes/Compra.jsx';
import { Fatura } from '../cartoes/Fatura.jsx';
import { Categorias } from '../categorias/Categorias.jsx';
import { Compromissos } from '../compromissos/Compromissos.jsx';
import { FormularioRecorrencia, Recorrencias } from '../compromissos/Recorrencias.jsx';
import { Config } from '../config/Config.jsx';
import { Contas } from '../contas/Contas.jsx';
import { Dashboard } from '../dashboard/Dashboard.jsx';
import { FormularioMovimentacao } from '../movimentacoes/FormularioMovimentacao.jsx';
import { Historico } from '../movimentacoes/Historico.jsx';
import { Lancamentos } from '../movimentacoes/Lancamentos.jsx';
import { Metas } from '../metas/Metas.jsx';
import { Orcamento } from '../orcamento/Orcamento.jsx';
import { Assinaturas } from '../assinaturas/Assinaturas.jsx';
import { Investimentos } from '../investimentos/Investimentos.jsx';
import { Patrimonio } from '../patrimonio/Patrimonio.jsx';
import { DividaDetalhe, Dividas, FormularioDivida } from '../dividas/Dividas.jsx';
import { Layout } from './Layout.jsx';
import { Mais } from './Mais.jsx';

// Recharts só é baixado quando se abre uma tela com gráfico.
const Fluxo = lazy(() => import('../fluxo/Fluxo.jsx').then((m) => ({ default: m.Fluxo })));

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
        <Route path="compromissos" element={<Compromissos fuso={sessao.fuso} />} />
        <Route path="recorrencias" element={<Recorrencias />} />
        <Route path="recorrencias/nova" element={<FormularioRecorrencia fuso={sessao.fuso} />} />
        <Route path="recorrencias/:id" element={<FormularioRecorrencia fuso={sessao.fuso} />} />
        <Route
          path="fluxo"
          element={
            <Suspense fallback={<p className="carregando">Carregando…</p>}>
              <Fluxo fuso={sessao.fuso} />
            </Suspense>
          }
        />
        <Route path="orcamento" element={<Orcamento fuso={sessao.fuso} />} />
        <Route path="metas" element={<Metas fuso={sessao.fuso} />} />
        <Route path="dividas" element={<Dividas />} />
        <Route path="dividas/nova" element={<FormularioDivida fuso={sessao.fuso} />} />
        <Route path="dividas/:id" element={<DividaDetalhe />} />
        <Route path="assinaturas" element={<Assinaturas />} />
        <Route path="investimentos" element={<Investimentos fuso={sessao.fuso} />} />
        <Route path="patrimonio" element={<Patrimonio />} />
        <Route path="alertas" element={<Alertas />} />
        <Route path="mais" element={<Mais />} />
        <Route path="categorias" element={<Categorias />} />
        <Route path="config" element={<Config fusoInicial={sessao.fuso} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
