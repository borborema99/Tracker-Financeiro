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

if (process.argv[1]?.endsWith('orcamento-js.js')) {
  const medicao = medirDist();
  const kb = (bytes) => `${(bytes / KB).toFixed(1)} kB`;
  console.log('JavaScript do front (gzip):');
  for (const c of [...medicao.chunks].sort((a, b) => b.gz - a.gz)) {
    console.log(`  ${medicao.nomesIniciais.includes(c.nome) ? '* ' : '  '}${c.nome.padEnd(40)} ${kb(c.gz)}`);
  }
  console.log(`  inicial (*) ${kb(medicao.inicial)} de ${LIMITES.inicial_kb} kB · total ${kb(medicao.total)} de ${LIMITES.total_kb} kB`);
  const estouros = avaliar(medicao);
  if (estouros.length) {
    for (const e of estouros) console.error(`ORÇAMENTO ESTOURADO: ${e}`);
    process.exit(1);
  }
  console.log('Dentro do orçamento.');
}
