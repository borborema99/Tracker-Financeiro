# ADR 004: decisões da Onda 2 (cartões)

**Contexto.** O escopo original continua indisponível (ADR 002). Estas decisões completam o que o pedido deixou em aberto nos cartões; se o escopo original divergir, ele vale e a diferença vira novo ADR.

**Decisões.**
- **Compra de cartão fora de `movimentacoes`.** Fica em `compras_cartao` (+ parcelas, estornos). Assim não entra no saldo de nenhuma conta, e o resumo a soma ao realizado pela data da compra. Em troca, ela não aparece na tela Lançamentos: o caminho é Cartões.
- **Pagamento de fatura não é lançamento.** Tabela própria, só o cálculo de saldo a enxerga. Não conta como despesa (RF-04) e não polui a listagem.
- **Fatura sob demanda.** Nasce na primeira linha que cai nela e guarda as datas do ciclo. Total, pago, saldo, situação e limite são calculados.
- **Dias de 1 a 28** para fechamento e vencimento, para existirem em todos os meses.
- **Fechamento inclusivo.** Compra feita no próprio dia de fechamento entra na fatura que fecha naquele dia.
- **Estorno como crédito.** Cai na fatura aberta de hoje (a primeira sem pagamento), com transporte do que sobrar para a fatura seguinte. A despesa realizada cai na data do estorno.
- **Antecipação sem desconto.** Só traz a parcela para a fatura aberta. Desconto de juros não existe nesta fase.
- **Compra acima do limite avisa e não bloqueia.**
- **Reembolso** é a receita com `reembolso_de_id` (migration 003), validado até o valor da despesa.
- **Invariante.** Toda mudança em compra, estorno ou pagamento termina conferindo que nenhuma fatura ficou com pagamento maior que o total; senão a transação é desfeita (409).

**Fora desta onda.** Divisão de compra entre categorias, troca de cartão numa compra, desconto na antecipação, cartão adicional ou virtual, juros e multa de atraso.
