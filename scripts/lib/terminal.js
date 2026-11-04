import { createInterface } from 'node:readline/promises';

/** Lê uma linha sem eco quando há terminal. Sem terminal, usa a primeira linha do stdin. */
export async function perguntarSenha(pergunta) {
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin });
    for await (const linha of rl) {
      rl.close();
      return linha.charCodeAt(0) === 0xfeff ? linha.slice(1) : linha; // o PowerShell 5.1 prefixa um BOM ao redirecionar texto
    }
    return '';
  }
  process.stdout.write(pergunta);
  return new Promise((resolve, reject) => {
    let texto = '';
    const { stdin } = process;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const terminar = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', aoReceber);
      process.stdout.write('\n');
    };
    const aoReceber = (dados) => {
      for (const c of dados) {
        if (c === '\r' || c === '\n') {
          terminar();
          return resolve(texto);
        }
        if (c === '\u0003') {
          terminar();
          return reject(new Error('Cancelado.'));
        }
        if (c === '\u007f' || c === '\b') texto = texto.slice(0, -1);
        else if (c >= ' ') texto += c;
      }
    };
    stdin.on('data', aoReceber);
  });
}

export async function perguntar(pergunta) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(pergunta)).trim();
  } finally {
    rl.close();
  }
}
