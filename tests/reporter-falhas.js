// Reporter do node:test que só imprime as falhas e uma linha de resumo.
export default async function* reporterFalhas(fonte) {
  let passou = 0;
  let falhou = 0;
  let pulou = 0;
  for await (const evento of fonte) {
    const { type, data } = evento;
    if (type !== 'test:pass' && type !== 'test:fail') continue;
    if (data.details?.type === 'suite') continue;
    if (type === 'test:pass') {
      if (data.skip || data.todo) pulou++;
      else passou++;
      continue;
    }
    falhou++;
    const erro = data.details?.error;
    const causa = erro?.cause ?? erro;
    yield `FALHOU: ${data.name} (${data.file ?? ''})\n  ${String(causa?.message ?? causa).split('\n').join('\n  ')}\n`;
  }
  yield `\nTestes: ${passou} ok, ${falhou} com falha${pulou ? `, ${pulou} ignorados` : ''}\n`;
}
