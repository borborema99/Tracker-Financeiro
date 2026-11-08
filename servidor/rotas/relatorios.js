import { esquemaEvolucao, esquemaPeriodo } from '../../contratos/relatorios.js';
import { evolucaoDoRealizado, relatorioMaioresDespesas, relatorioPorCategoria } from '../banco/repositorios/relatorios.js';
import { intervaloDoMes } from '../dominio/datas.js';
import { hojeDe } from './util.js';

export async function rotasRelatorios(app) {
  const { db } = app;

  /** Sem datas, o período é o mês atual no fuso configurado. */
  const periodoDe = (consulta) => {
    if (consulta.de) return { de: consulta.de, ate: consulta.ate };
    return intervaloDoMes(hojeDe(db).slice(0, 7));
  };

  // Receitas, despesas e resultado realizados dos últimos N meses (padrão 6).
  app.get('/api/relatorios/evolucao', async (request) => {
    const { meses } = esquemaEvolucao.parse(request.query);
    return evolucaoDoRealizado(db, hojeDe(db), meses);
  });

  // Despesas (ou receitas) realizadas por categoria principal, comparadas com o período anterior.
  app.get('/api/relatorios/categorias', async (request) => {
    const consulta = esquemaPeriodo.parse(request.query);
    return relatorioPorCategoria(db, { ...periodoDe(consulta), tipo: consulta.tipo });
  });

  app.get('/api/relatorios/maiores-despesas', async (request) => {
    const consulta = esquemaPeriodo.parse(request.query);
    return relatorioMaioresDespesas(db, { ...periodoDe(consulta), limite: consulta.limite });
  });
}
