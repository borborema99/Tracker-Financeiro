# ADR 005: decisões da Onda 3 (compromissos, recorrências, fluxo e alertas)

**Contexto.** O escopo original continua indisponível (ADR 002). Estas decisões completam o que o pedido deixou em aberto; se o escopo original divergir, ele vale e a diferença vira novo ADR.

**Decisões.**
- **Compromisso é movimentação pendente.** Não há tabela de "contas a pagar": receita/despesa pendente já tem vencimento, conta, categoria, auditoria e entra nas visões prevista e projetada. Liquidar e reabrir seguem os endpoints de movimentações.
- **Atrasada é calculada** (RF-07): nem coluna, nem status, nem aceita no contrato. A listagem de lançamentos devolve `atrasada` calculada contra hoje.
- **Baixa parcial divide o lançamento.** O original fica liquidado pelo valor baixado (mantém a ligação com a recorrência, então a série não gera de novo) e o restante é um novo pendente com `baixa_de_id`. Não vale para dividido entre categorias nem para despesa com reembolso ligado: partir esses casos exigiria regras novas que o pedido não definiu.
- **Recorrência gera ocorrências reais, não virtuais.** Cada ocorrência é um lançamento pendente (até hoje + 90 dias, o maior horizonte da projeção), para que baixa, edição, histórico e relatórios funcionem sem caso especial. Geração sob demanda ao abrir o app e ao listar, idempotente por índice único; sem processo em segundo plano.
- **Apagar uma ocorrência é decisão do dono** e é lembrada (`recorrencias_puladas`); editar a recorrência refaz só as pendentes de hoje em diante.
- **Fluxo é visão de caixa.** Realizado = liquidado (e pagamento de fatura); transferência é neutra; compra no cartão só sai do caixa quando a fatura é paga. Projeção = saldo atual + pendentes + faturas em aberto no vencimento da fatura.
- **Alertas só dentro do app**, calculados na hora, sem estado guardado: aviso de 3 dias; projeção de 30 dias para o saldo negativo.
- **Barra de baixo com 5 itens** (Início, Lançamentos, Compromissos, Fluxo, Mais) para manter alvos de toque de 44px; o restante fica em `/mais`. O sino do cabeçalho leva aos alertas.
- **Recharts e a CSP.** Os gráficos usam Recharts (decisão fixa) carregado sob demanda. A biblioteca não injeta `<style>` nem atributos `style` no HTML (conferido no código do pacote); estilos de elementos são aplicados pelo React via DOM, o que a CSP `style-src 'self'` permite. Isso **não foi conferido num navegador** nesta onda (sem abrir navegador, por combinação); entra no roteiro de teste no celular da Onda 4. Se algum gráfico falhar sob a CSP, a saída é gráfico em SVG próprio, sem afrouxar a CSP.

**Fora desta onda.** Parcelamento de conta a pagar, juros e multa de atraso, lembrete fora do app, pagamento em lote, recorrência com valor variável, ocorrência única editada separada da série (editar o lançamento pendente da série vale só para ele; editar a recorrência refaz as futuras pendentes).
