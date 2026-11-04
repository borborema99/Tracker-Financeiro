// Gera os ícones PNG do app (sem dependências). Rode só se mudar o desenho: node scripts/gerar-icones.js
import { crc32, deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from '../servidor/config.js';

const FUNDO = [0x2f, 0x4a, 0x73];
const TRACO = [0xf3, 0xef, 0xe6];

function chunk(tipo, dados) {
  const t = Buffer.from(tipo);
  const corpo = Buffer.concat([t, dados]);
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo) >>> 0);
  return Buffer.concat([tam, corpo, crc]);
}

// Um "T" sólido dentro da zona segura (60% central), para funcionar como ícone mascarável.
function pixel(x, y, n) {
  const u = x / n;
  const v = y / n;
  const barra = u >= 0.25 && u <= 0.75 && v >= 0.28 && v <= 0.4;
  const haste = u >= 0.45 && u <= 0.55 && v >= 0.28 && v <= 0.74;
  return barra || haste ? TRACO : FUNDO;
}

function png(n) {
  const linhas = [];
  for (let y = 0; y < n; y++) {
    const linha = Buffer.alloc(1 + n * 3);
    for (let x = 0; x < n; x++) linha.set(pixel(x, y, n), 1 + x * 3);
    linhas.push(linha);
  }
  const cab = Buffer.alloc(13);
  cab.writeUInt32BE(n, 0);
  cab.writeUInt32BE(n, 4);
  cab.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', cab),
    chunk('IDAT', deflateSync(Buffer.concat(linhas))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const n of [180, 192, 512]) {
  writeFileSync(join(RAIZ, 'web', 'public', `icone-${n}.png`), png(n));
}
console.log('Ícones gerados em web/public/.');
