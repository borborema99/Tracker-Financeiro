# ADR 001: parse e format de dinheiro ficam em `contratos/`

**Contexto.** A decisão pede "todo cálculo financeiro em `servidor/dominio/`" e "uma função única de parse e format, nos dois lados". O front precisa formatar valores e validar o campo digitado; o servidor valida e armazena.

**Decisão.** `contratos/dinheiro.js` guarda `parseDinheiro`, `formatarDinheiro` e `dividirEmParcelas`, importadas pelo servidor e pelo front. Elas não calculam indicadores (isso continua em `servidor/dominio/`); são conversão de representação e divisão de parcelas, que precisam ser idênticas nos dois lados.

**Consequência.** O front não pode importar nada de `servidor/`. `servidor/dominio/` importa de `contratos/`, nunca o contrário.
