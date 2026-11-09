import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Tokens do front novo (frontend/src/estilos/tailwind.css): contraste AA (4,5:1) nos pares de texto, nos dois temas.
const RAIZ_SRC = fileURLToPath(new URL('../frontend/src', import.meta.url));
const css = readFileSync(join(RAIZ_SRC, 'estilos', 'tailwind.css'), 'utf8');

function bloco(seletor) {
  const inicio = css.indexOf(`${seletor} {`);
  assert.ok(inicio >= 0, `bloco ${seletor} não encontrado`);
  return css.slice(inicio, css.indexOf('}', inicio));
}

function variaveis(texto) {
  return Object.fromEntries([...texto.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

const claro = variaveis(bloco(':root'));
const soEscuro = variaveis(bloco('.dark'));
const escuro = { ...claro, ...soEscuro };

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
  ['foreground', 'background'], ['card-foreground', 'card'], ['popover-foreground', 'popover'],
  ['secondary-foreground', 'secondary'], ['accent-foreground', 'accent'],
  ['muted-foreground', 'background'], ['muted-foreground', 'card'], ['muted-foreground', 'muted'],
  ['primary-foreground', 'primary'], ['primary', 'background'], ['primary', 'card'],
  ['destructive-foreground', 'destructive'], ['destructive', 'background'], ['destructive', 'card'],
  ['entrada', 'background'], ['entrada', 'card'],
  ['saida', 'background'], ['saida', 'card'],
  ['aviso', 'background'], ['aviso', 'card'],
  ['background', 'aviso'], // faixa "dados de demonstração": texto de fundo sobre o âmbar
];

for (const [tema, cores] of [['claro', claro], ['escuro', escuro]]) {
  test(`design (front novo): contraste AA (>= 4,5) no tema ${tema}`, () => {
    for (const [texto, fundo] of PARES) {
      assert.ok(cores[texto] && cores[fundo], `token ausente: ${texto} ou ${fundo}`);
      const razao = contraste(cores[texto], cores[fundo]);
      assert.ok(razao >= 4.5, `${texto} sobre ${fundo} no tema ${tema}: ${razao.toFixed(2)}`);
    }
  });
}

test('design (front novo): o tema escuro redefine todas as cores do claro', () => {
  const faltam = Object.keys(claro).filter((k) => !(k in soEscuro));
  assert.deepEqual(faltam, []);
});

function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? arquivos(join(dir, n)) : [join(dir, n)]));
}

test('design (front novo): sem style inline nem <style> no código do front (CSP sem unsafe-inline)', () => {
  const ofensas = arquivos(RAIZ_SRC)
    .filter((f) => /\.(tsx?|css)$/.test(f) && !/\.test\./.test(f))
    .filter((f) => /\sstyle=\{|\sstyle="|<style[\s>]/.test(readFileSync(f, 'utf8')))
    .map((f) => f.replace(/\\/g, '/'));
  assert.deepEqual(ofensas, []);
});

test('design (front novo): o único CSS é a entrada do Tailwind, sem .module.css', () => {
  const css = arquivos(RAIZ_SRC).filter((f) => f.endsWith('.css')).map((f) => f.replace(/\\/g, '/'));
  assert.equal(css.length, 1);
  assert.ok(css[0]?.endsWith('estilos/tailwind.css'));
});
