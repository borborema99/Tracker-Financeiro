# ADR 006: Fase 2 = planejamento (orçamento, metas, dívidas, assinaturas)

**Contexto.** O escopo original continua indisponível (ADR 002) e o `escopo-completo.md` só trazia uma lista solta de "Fases 2 a 4", sem dizer o que entra em cada uma. A regra "Fases seguintes" do CLAUDE.md pede a seção da Fase 2 do escopo. Como ela não existe, o dono escolheu a divisão abaixo.

**Decisão.**
- **Fase 2 (planejamento):** orçamento, metas, dívidas e assinaturas. Usam só dados que o app já tem. Onda 1: orçamento e metas. Onda 2: dívidas e assinaturas.
- **Fase 3:** relatórios, patrimônio líquido e investimentos. **Fase 4:** múltiplas moedas, importação OFX, anexos, IA e integração bancária.
- Se o escopo original aparecer e dividir diferente, ele vale e a diferença vira novo ADR.

**Decisões da Onda 1.**
- **Orçamento só na categoria principal de despesa.** Subcategorias somam na principal (a árvore tem dois níveis). Um limite na subcategoria criaria dois limites para o mesmo gasto e dois números concorrentes. Mover para subcategoria ou excluir uma categoria com limite em vigor é recusado até zerar o limite.
- **Limite com vigência, sem tabela por mês.** `orcamentos` guarda `(categoria, mes_inicio, limite)`; o limite de um mês é o registro mais recente que não passa dele, e 0 significa "sem orçamento daquele mês em diante". Meses anteriores nunca mudam ao alterar o limite (mesma ideia do ciclo de fatura do cartão). Registros não são apagados: cada mudança fica no `audit_log`.
- **Gasto = realizado, na mesma base do resumo (RF-02).** Despesas liquidadas pela data de liquidação, compras no cartão pela data da compra, estornos pela data do estorno; pagar fatura e transferência não entram. O gasto de uma categoria soma subcategorias e lançamentos divididos. O previsto (pendente) e o projetado (realizado + previsto) ficam em campos próprios; a situação (`ok`, `atencao` a partir de 80%, `estourado` acima de 100%) olha só o realizado, e `vai_estourar` avisa quando o projetado passa do limite.
- **Alertas de orçamento** só do mês de hoje, calculados na hora como os demais. Reembolso (receita) não abate a despesa, como já decidido na Onda 2.
- **Meta é reserva virtual.** Aporte e resgate não alteram saldo nem viram receita ou despesa: o dinheiro continua na conta. Ligar a meta a uma conta exigiria decidir se o aporte reduz o saldo disponível, o que o pedido não definiu. A tela diz isso em texto.
- **Meta nunca fica negativa.** Resgate maior que o acumulado e a remoção de um aporte que sustenta um resgate são recusados (409). Aporte com data futura é recusado.
- **Situação da meta é calculada** (`concluida`, `atrasada`, `em_andamento`); o valor por mês é o que falta dividido pelos meses restantes (contando o mês de hoje e o do prazo), arredondado para cima, e fica vazio sem prazo, com prazo vencido ou meta concluída.

**Fora desta onda.** Orçamento por subcategoria ou por total do mês; sobra de um mês passando para o seguinte; orçamento por conta ou por cartão; meta ligada a conta; aporte automático ou recorrente; edição de aporte (remove e registra de novo).
