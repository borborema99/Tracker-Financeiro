// Revisão de segurança do build (ADR 013, Onda 5): nenhum segredo pode ter ido parar no que o navegador baixa.
// Procura em frontend/dist: nomes das variáveis de ambiente do servidor, qualquer `VITE_*`, `service_role`, chaves no
// formato JWT (as do Supabase), endereços de Postgres e os valores reais dessas variáveis (do ambiente ou do .env).
// Roda no `npm run verify`, depois do build.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, carregarEnv } from '../servidor/config.js';

export const VARIAVEIS_DO_SERVIDOR = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SEGREDO_SESSAO',
  'SENHA_PEPPER',
  'HMAC_CHAVE_IP',
  'CADASTRO_ABERTO',
  'SITE_URL',
  'ORIGENS_PERMITIDAS',
];

const PADROES = [
  [new RegExp(`\\b(${VARIAVEIS_DO_SERVIDOR.join('|')})\\b`), 'nome de variável de ambiente do servidor'],
  [/\bVITE_[A-Z0-9_]+/, 'variável VITE_ (vai para o navegador)'],
  [/service_role/, 'service_role do Supabase'],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/, 'chave no formato JWT'],
  [/postgres(?:ql)?:\/\/[^\s"'`]+/, 'endereço de Postgres'],
];

/** Valores curtos demais casariam com texto comum; só procuramos valores que pareçam segredo. */
const TAMANHO_MINIMO_VALOR = 12;

function arquivosDe(pasta) {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(pasta, e.name);
    return e.isDirectory() ? arquivosDe(caminho) : [caminho];
  });
}

/** Devolve a lista de achados `{ arquivo, motivo }` (vazia = limpo). `valores` são os segredos reais a procurar. */
export function procurarSegredos(pasta, valores = []) {
  if (!existsSync(pasta)) throw new Error(`${pasta} não existe. Rode primeiro: npm run build`);
  const achados = [];
  const procurados = valores.filter((v) => v && v.length >= TAMANHO_MINIMO_VALOR);
  for (const arquivo of arquivosDe(pasta)) {
    if (!/\.(js|css|html|json|webmanifest|svg|txt|map)$/.test(arquivo)) continue;
    const texto = readFileSync(arquivo, 'utf8');
    const rel = arquivo.slice(pasta.length + 1).replaceAll('\\', '/');
    for (const [padrao, motivo] of PADROES) {
      const m = texto.match(padrao);
      if (m) achados.push({ arquivo: rel, motivo: `${motivo}: ${m[0].slice(0, 24)}` });
    }
    for (const valor of procurados) {
      if (texto.includes(valor)) achados.push({ arquivo: rel, motivo: 'valor de um segredo do servidor' });
    }
  }
  return achados;
}

if (process.argv[1]?.endsWith('verificar-dist.js')) {
  carregarEnv();
  const valores = VARIAVEIS_DO_SERVIDOR.map((nome) => process.env[nome] ?? '');
  const pasta = join(RAIZ, 'frontend', 'dist');
  const achados = procurarSegredos(pasta, valores);
  if (achados.length) {
    for (const a of achados) console.error(`SEGREDO NO BUILD: ${a.arquivo} (${a.motivo})`);
    process.exit(1);
  }
  console.log('frontend/dist sem segredos nem variáveis do servidor.');
}
