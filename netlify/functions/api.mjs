import { criarApp } from '../../servidor/app.js';
import { criarArmazenamentoSupabase } from '../../servidor/armazenamento/index.js';
import { abrirBanco } from '../../servidor/banco/pg/conexao.js';
import { lerAmbiente, variaveisFaltando } from '../../servidor/config.js';
import { criarManipulador } from '../../servidor/netlify.js';

// API em /api/* (ADR 013). Só o driver de produção é importado aqui: o PGlite fica de fora do pacote.
// As migrations NÃO rodam na função: são aplicadas pelo `npm run setup` (docs/deploy-netlify.md).

const ambiente = lerAmbiente();
let promessa;

function iniciar() {
  const faltando = [
    ...variaveisFaltando(ambiente),
    ...(ambiente.bancoUrl ? [] : ['DATABASE_URL']),
    ...(ambiente.supabaseUrl ? [] : ['SUPABASE_URL']),
    ...(ambiente.supabaseChave ? [] : ['SUPABASE_SERVICE_KEY']),
    ...(ambiente.siteUrl ? [] : ['SITE_URL']),
  ];
  if (faltando.length) throw new Error(`Variáveis de ambiente ausentes: ${faltando.join(', ')}`);
  return criarApp({
    config: ambiente,
    banco: abrirBanco(ambiente.bancoUrl),
    armazenamento: criarArmazenamentoSupabase({ url: ambiente.supabaseUrl, chave: ambiente.supabaseChave }),
    trustProxy: true,
    servirFront: false,
  }).then(async (app) => {
    await app.ready();
    return app;
  });
}

// A instância vive fora do handler e é reaproveitada enquanto a função está quente. Se a inicialização falhar,
// a próxima invocação tenta de novo.
const obterApp = () => {
  promessa ??= iniciar().catch((erro) => {
    promessa = undefined;
    throw erro;
  });
  return promessa;
};

export default criarManipulador(obterApp);

export const config = { path: '/api/*' };
