import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { LIMITES, avaliar, medirDist } from '../scripts/orcamento-js.js';

function distFalso(t, arquivos, indexHtml) {
  const pasta = mkdtempSync(join(tmpdir(), 'tracker-dist-'));
  t.after(() => rmSync(pasta, { recursive: true, force: true }));
  mkdirSync(join(pasta, 'assets'));
  writeFileSync(join(pasta, 'index.html'), indexHtml);
  for (const [nome, conteudo] of Object.entries(arquivos)) writeFileSync(join(pasta, 'assets', nome), conteudo);
  return pasta;
}

// Texto aleatório quase não comprime: o tamanho gzip fica perto do tamanho original.
const ruido = (bytes) => Array.from({ length: bytes }, () => String.fromCharCode(33 + Math.floor(Math.random() * 90))).join('');

test('orçamento de JS: separa a carga inicial dos chunks sob demanda e soma tudo', (t) => {
  const pasta = distFalso(
    t,
    { 'index-a.js': ruido(2000), 'Grafico-b.js': ruido(3000) },
    '<script type="module" src="/assets/index-a.js"></script><link rel="modulepreload" href="/assets/index-a.js">',
  );
  const m = medirDist(pasta);
  assert.deepEqual(m.nomesIniciais, ['index-a.js']);
  assert.ok(m.inicial > 1500 && m.inicial < m.total);
  assert.equal(m.maior.nome, 'Grafico-b.js');
  assert.deepEqual(avaliar(m), []);
});

test('orçamento de JS: avisa quando a carga inicial, um pedaço ou o total passam do limite', (t) => {
  const pasta = distFalso(t, { 'index-a.js': ruido(5000), 'Grande-b.js': ruido(9000) }, '<script type="module" src="/assets/index-a.js"></script>');
  const m = medirDist(pasta);
  const justo = { inicial_kb: 1, maior_chunk_kb: 1, total_kb: 1 };
  const estouros = avaliar(m, justo);
  assert.equal(estouros.length, 3);
  assert.match(estouros.join('\n'), /carga inicial/);
  assert.match(estouros.join('\n'), /Grande-b\.js/);
  assert.match(estouros.join('\n'), /total/);
});

test('orçamento de JS: build sem script no index.html é medição inválida, e sem dist é erro claro', (t) => {
  const pasta = distFalso(t, { 'x.js': 'a' }, '<html></html>');
  assert.match(avaliar(medirDist(pasta)).join(), /medição inválida/);
  assert.throws(() => medirDist(join(pasta, 'nao-existe')), /npm run build/);
});

test('orçamento de JS: os limites são positivos e coerentes entre si', () => {
  assert.ok(LIMITES.inicial_kb > 0 && LIMITES.maior_chunk_kb > 0);
  assert.ok(LIMITES.total_kb >= LIMITES.inicial_kb && LIMITES.total_kb >= LIMITES.maior_chunk_kb);
});
