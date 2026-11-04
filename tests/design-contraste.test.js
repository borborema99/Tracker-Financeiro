import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../web/src/estilos/tokens.css', import.meta.url), 'utf8');

function variaveis(bloco) {
  return Object.fromEntries([...bloco.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

const claro = variaveis(css.split('@media')[0]);
const escuro = { ...claro, ...variaveis(css.split('@media')[1]) };

function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const PARES = [
  ['tinta', 'fundo'], ['tinta', 'superficie'], ['tinta', 'superficie-2'],
  ['tinta-suave', 'fundo'], ['tinta-suave', 'superficie'], ['tinta-suave', 'superficie-2'],
  ['acento-texto', 'acento'], ['acento', 'fundo'], ['acento', 'superficie'],
  ['entrada', 'fundo'], ['entrada', 'superficie'],
  ['saida', 'fundo'], ['saida', 'superficie'],
  ['aviso', 'fundo'], ['aviso', 'superficie'],
];

for (const [tema, cores] of [['claro', claro], ['escuro', escuro]]) {
  test(`design: contraste AA (>= 4,5) no tema ${tema}`, () => {
    for (const [texto, fundo] of PARES) {
      const razao = contraste(cores[texto], cores[fundo]);
      assert.ok(razao >= 4.5, `${texto} sobre ${fundo} no tema ${tema}: ${razao.toFixed(2)}`);
    }
  });
}

test('design: faixa de demonstração tem contraste AA (texto fundo sobre aviso)', () => {
  for (const cores of [claro, escuro]) assert.ok(contraste(cores.fundo, cores.aviso) >= 4.5);
});
