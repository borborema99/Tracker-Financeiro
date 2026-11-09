// Orçamento de JavaScript do front, medido em gzip sobre o build (`web/dist`).
// "Inicial" = o que o index.html carrega antes de qualquer tela; o resto são chunks sob demanda (rotas e gráficos).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const KB = 1024;
export const LIMITES = {
  inicial_kb: 160, // celular em rede ruim: o app precisa abrir sem baixar gráfico
  maior_chunk_kb: 120, // nenhum pedaço sob demanda maior que isso (hoje o maior é o Recharts, ~100 kB)
  total_kb: 320, // tudo junto, para o app não crescer sem ninguém perceber
};

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

/** Mede os .js de `pasta`/assets e separa o que o index.html carrega de início. */
export function medirDist(pasta = join(RAIZ, 'web', 'dist')) {
  const assets = join(pasta, 'assets');
  if (!existsSync(assets)) throw new Error('web/dist/assets não existe. Rode primeiro: npm run build');
  const chunks = readdirSync(assets)
    .filter((nome) => nome.endsWith('.js'))
    .map((nome) => ({ nome, gz: gzipSync(readFileSync(join(assets, nome))).length }));

  const html = readFileSync(join(pasta, 'index.html'), 'utf8');
  const iniciais = new Set(
    [...html.matchAll(/(?:src|href)="[^"]*\/assets\/([^"]+\.js)"/g)].map((m) => m[1]),
  );
  const inicial = chunks.filter((c) => iniciais.has(c.nome)).reduce((soma, c) => soma + c.gz, 0);
  const total = chunks.reduce((soma, c) => soma + c.gz, 0);
  // O limite por pedaço vale para o que é baixado sob demanda; a carga inicial tem limite próprio.
  const maior = chunks
    .filter((c) => !iniciais.has(c.nome))
    .reduce((m, c) => (c.gz > m.gz ? c : m), { nome: '', gz: 0 });
  return { chunks, inicial, total, maior, nomesIniciais: [...iniciais] };
}

/** Devolve a lista de estouros (vazia = dentro do orçamento). */
export function avaliar(medicao, limites = LIMITES) {
  const estouros = [];
  const kb = (bytes) => (bytes / KB).toFixed(1);
  if (medicao.nomesIniciais.length === 0) estouros.push('index.html não carrega nenhum script: medição inválida');
  if (medicao.inicial > limites.inicial_kb * KB) {
    estouros.push(`carga inicial ${kb(medicao.inicial)} kB gzip passa de ${limites.inicial_kb} kB`);
  }
  if (medicao.maior.gz > limites.maior_chunk_kb * KB) {
    estouros.push(`${medicao.maior.nome} tem ${kb(medicao.maior.gz)} kB gzip e o limite por pedaço é ${limites.maior_chunk_kb} kB`);
  }
  if (medicao.total > limites.total_kb * KB) {
    estouros.push(`total ${kb(medicao.total)} kB gzip passa de ${limites.total_kb} kB`);
  }
  return estouros;
}

// ---- Front novo (frontend/): orçamento por rota, medido pelo manifest do Vite -------------------------------------
// "Landing inicial" = o que a rota `/` baixa (entrada + chunk da landing); "app inicial" = o que `/app` baixa
// (entrada + chunk da casca do tracker). Os dois contam só o grafo estático de imports, então o que é carregado
// sob demanda (telas e gráficos) fica de fora. A landing não pode puxar o código do tracker nem o Recharts.
export const LIMITES_FRONT = {
  landing_kb: 120,
  app_kb: 180,
  maior_chunk_kb: 120,
  total_kb: 450,
};

const ROTAS_DO_FRONT = { landing: 'src/landing/Landing.tsx', app: 'src/app/Casca.tsx' };

/** Soma o gzip de `chave` e de tudo que ela importa de forma estática (sem repetir chunk). */
function fechamento(manifesto, chave, visitados = new Set()) {
  if (visitados.has(chave)) return visitados;
  visitados.add(chave);
  for (const dep of manifesto[chave]?.imports ?? []) fechamento(manifesto, dep, visitados);
  return visitados;
}

export function medirFrontNovo(pasta = join(RAIZ, 'frontend', 'dist')) {
  const arquivoManifesto = join(pasta, '.vite', 'manifest.json');
  if (!existsSync(arquivoManifesto)) throw new Error('frontend/dist/.vite/manifest.json não existe. Rode primeiro: npm run build');
  const manifesto = JSON.parse(readFileSync(arquivoManifesto, 'utf8'));
  const gzDe = (chave) => gzipSync(readFileSync(join(pasta, manifesto[chave].file))).length;
  const entrada = Object.keys(manifesto).find((k) => manifesto[k].isEntry);
  if (!entrada) throw new Error('manifest sem entrada: medição inválida');

  const rotas = {};
  for (const [nome, chave] of Object.entries(ROTAS_DO_FRONT)) {
    if (!manifesto[chave]) throw new Error(`rota ${nome} (${chave}) não está no manifest`);
    const chaves = new Set([...fechamento(manifesto, entrada), ...fechamento(manifesto, chave)]);
    rotas[nome] = { chunks: [...chaves].map((k) => manifesto[k].file), gz: [...chaves].reduce((s, k) => s + gzDe(k), 0) };
  }
  const chunks = Object.keys(manifesto).filter((k) => manifesto[k].file.endsWith('.js')).map((k) => ({ nome: manifesto[k].file, gz: gzDe(k) }));
  const iniciais = new Set([...rotas.landing.chunks, ...rotas.app.chunks]);
  const maior = chunks.filter((c) => !iniciais.has(c.nome)).reduce((m, c) => (c.gz > m.gz ? c : m), { nome: '', gz: 0 });
  return { rotas, chunks, total: chunks.reduce((s, c) => s + c.gz, 0), maior };
}

export function avaliarFrontNovo(medicao, limites = LIMITES_FRONT) {
  const estouros = [];
  const kb = (bytes) => (bytes / KB).toFixed(1);
  if (medicao.rotas.landing.gz > limites.landing_kb * KB) {
    estouros.push(`landing inicial ${kb(medicao.rotas.landing.gz)} kB gzip passa de ${limites.landing_kb} kB`);
  }
  if (medicao.rotas.app.gz > limites.app_kb * KB) {
    estouros.push(`app inicial ${kb(medicao.rotas.app.gz)} kB gzip passa de ${limites.app_kb} kB`);
  }
  const proibidos = medicao.rotas.landing.chunks.filter((c) => /recharts|Casca/i.test(c));
  if (proibidos.length) estouros.push(`a landing baixa código que não é dela: ${proibidos.join(', ')}`);
  if (medicao.maior.gz > limites.maior_chunk_kb * KB) {
    estouros.push(`${medicao.maior.nome} tem ${kb(medicao.maior.gz)} kB gzip e o limite por pedaço é ${limites.maior_chunk_kb} kB`);
  }
  if (medicao.total > limites.total_kb * KB) {
    estouros.push(`total ${kb(medicao.total)} kB gzip passa de ${limites.total_kb} kB`);
  }
  return estouros;
}

if (process.argv[1]?.endsWith('orcamento-js.js')) {
  const kb = (bytes) => `${(bytes / KB).toFixed(1)} kB`;
  const estouros = [];

  if (existsSync(join(RAIZ, 'web', 'dist'))) {
    const medicao = medirDist();
    console.log('JavaScript do front antigo (web/, gzip):');
    for (const c of [...medicao.chunks].sort((a, b) => b.gz - a.gz)) {
      console.log(`  ${medicao.nomesIniciais.includes(c.nome) ? '* ' : '  '}${c.nome.padEnd(40)} ${kb(c.gz)}`);
    }
    console.log(`  inicial (*) ${kb(medicao.inicial)} de ${LIMITES.inicial_kb} kB · total ${kb(medicao.total)} de ${LIMITES.total_kb} kB`);
    estouros.push(...avaliar(medicao));
  }

  const novo = medirFrontNovo();
  console.log('JavaScript do front novo (frontend/, gzip):');
  for (const c of [...novo.chunks].sort((a, b) => b.gz - a.gz)) console.log(`    ${c.nome.padEnd(40)} ${kb(c.gz)}`);
  console.log(`  landing inicial ${kb(novo.rotas.landing.gz)} de ${LIMITES_FRONT.landing_kb} kB · app inicial ${kb(novo.rotas.app.gz)} de ${LIMITES_FRONT.app_kb} kB · total ${kb(novo.total)} de ${LIMITES_FRONT.total_kb} kB`);
  estouros.push(...avaliarFrontNovo(novo));

  if (estouros.length) {
    for (const e of estouros) console.error(`ORÇAMENTO ESTOURADO: ${e}`);
    process.exit(1);
  }
  console.log('Dentro do orçamento.');
}
