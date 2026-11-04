# ADR 003: padrões e decisões da Onda 1

**Contexto.** O escopo original não estava disponível (ADR 002). O dono escolheu usar padrões próprios, editáveis na interface, e conferir depois contra o escopo.

**Decisões.**
- Tipos de conta: corrente, poupança, carteira, investimento (`contratos/contas.js`).
- Categorias de despesa e receita com até dois níveis, semeadas uma vez por `servidor/banco/padroes.js` e editáveis na tela. "Tarifas bancárias" é categoria do sistema (`papel = 'tarifa'`): não se exclui e não aparece na escolha manual.
- Tarifa de transferência é uma despesa vinculada (`transferencia_id`). Ela nasce, muda, é liquidada e some junto com a transferência; não se edita nem exclui sozinha (409).
- Duplicar lançamento acontece no cliente: abre o formulário preenchido (`?duplicar=ID`) com a data de hoje; nada é gravado até salvar.
- Divisão entre categorias: o servidor valida que a soma fecha com o valor; a tela não recalcula nada.
- Possível duplicidade avisa depois de salvar, sem bloquear (RF-09).
- "Atrasada" não existe nesta onda: só aparece com contas a pagar e receber (Onda 3, RF-07).

**Consequência.** Ao conferir com o escopo original, diferenças em tipos de conta ou categorias se corrigem em `padroes.js` e `contratos/contas.js` (a semente só vale para instalações novas; as existentes editam pela tela) e a divergência vira novo ADR.
