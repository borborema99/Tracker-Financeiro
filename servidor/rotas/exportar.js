import { esquemaFiltros } from '../../contratos/movimentacoes.js';
import { copiaCompleta, linhasDeComprasCartao, linhasDeLancamentos } from '../banco/repositorios/exportacao.js';
import { montarCsv } from '../dominio/csv.js';
import { hojeDe } from './util.js';

// Planilhas em pt-BR abrem UTF-8 corretamente quando o arquivo começa com BOM.
const BOM = '﻿';

const COLUNAS_LANCAMENTOS = [
  { titulo: 'ID', valor: (m) => m.id },
  { titulo: 'Data (competência)', valor: (m) => m.data_competencia },
  { titulo: 'Vencimento', valor: (m) => m.data_vencimento },
  { titulo: 'Liquidação', valor: (m) => m.data_liquidacao },
  { titulo: 'Tipo', valor: (m) => m.tipo },
  { titulo: 'Descrição', valor: (m) => m.descricao },
  { titulo: 'Categoria', valor: (m) => m.categoria },
  { titulo: 'Conta', valor: (m) => m.conta },
  { titulo: 'Conta de destino', valor: (m) => m.conta_destino },
  { titulo: 'Valor (R$)', valor: (m) => m.valor_centavos, dinheiro: true },
  { titulo: 'Situação', valor: (m) => m.situacao },
  { titulo: 'Observação', valor: (m) => m.observacao },
];

const COLUNAS_COMPRAS = [
  { titulo: 'ID', valor: (c) => c.id },
  { titulo: 'Data da compra', valor: (c) => c.data_compra },
  { titulo: 'Cartão', valor: (c) => c.cartao },
  { titulo: 'Descrição', valor: (c) => c.descricao },
  { titulo: 'Categoria', valor: (c) => c.categoria },
  { titulo: 'Valor total (R$)', valor: (c) => c.valor_total_centavos, dinheiro: true },
  { titulo: 'Parcelas', valor: (c) => c.parcelas_total },
  { titulo: 'Estornado (R$)', valor: (c) => c.estornado_centavos, dinheiro: true },
  { titulo: 'Observação', valor: (c) => c.observacao },
];

const filtrosDeExportacao = esquemaFiltros.omit({ pagina: true, por_pagina: true });

function anexo(reply, tipo, nome, corpo) {
  return reply
    .header('Content-Type', `${tipo}; charset=utf-8`)
    .header('Content-Disposition', `attachment; filename="${nome}"`)
    .header('Cache-Control', 'no-store')
    .send(corpo);
}

export async function rotasExportar(app) {
  const { db } = app;
  const sufixo = () => new Date().toISOString().slice(0, 10);

  // Os mesmos filtros da tela de lançamentos (menos a paginação). Sem filtro, exporta tudo.
  app.get('/api/exportar/lancamentos.csv', async (request, reply) => {
    const filtros = filtrosDeExportacao.parse(request.query);
    const linhas = linhasDeLancamentos(db, filtros, hojeDe(db));
    return anexo(reply, 'text/csv', `lancamentos-${sufixo()}.csv`, BOM + montarCsv(COLUNAS_LANCAMENTOS, linhas));
  });

  app.get('/api/exportar/compras-cartao.csv', async (request, reply) =>
    anexo(reply, 'text/csv', `compras-cartao-${sufixo()}.csv`, BOM + montarCsv(COLUNAS_COMPRAS, linhasDeComprasCartao(db))),
  );

  app.get('/api/exportar/tudo.json', async (request, reply) =>
    anexo(reply, 'application/json', `tracker-${sufixo()}.json`, JSON.stringify(copiaCompleta(db), null, 2)),
  );
}
