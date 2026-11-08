# ADR 009: relatórios (Fase 3, Onda 2)

Status: aceito.

## Contexto

Última onda da Fase 3 (ADR 006 e 008). O escopo original continua indisponível (ADR 002), então o conteúdo dos relatórios foi definido por mim com o que o app já registra.

## Decisões

1. **Três relatórios, todos do realizado:** evolução mês a mês (receitas, despesas e resultado), despesas ou receitas por categoria com comparação ao período anterior, e as maiores despesas. Nada é gravado e não há migration.
2. **Mesma base do resumo (RF-02, RF-12).** O relatório reaproveita as consultas do resumo e do orçamento. Assim cada mês da evolução é igual ao `realizado` de `/api/resumo?mes=` e a soma por categoria é a despesa realizada do período. Pagar fatura e transferência não entram (RF-03, RF-04). Previsto e projetado ficam fora: misturá-los criaria um segundo número para a mesma coisa.
3. **Período anterior.** Meses cheios (do dia 1 ao último dia de um ou mais meses) comparam com os mesmos meses imediatamente antes; qualquer outro intervalo compara com o mesmo número de dias logo antes. Variação é `null` quando o anterior é zero, porque não existe percentual sobre zero. Categoria que só teve valor no anterior aparece com zero.
4. **Média da evolução** só a partir do primeiro mês com movimento, para meses anteriores ao uso do app não puxarem a média para baixo. Sem nenhum movimento, `null`.
5. **Receitas por categoria** usam só receita liquidada, com divisão expandida; o reembolso é receita, como já decidido no orçamento.
6. **Maiores despesas** contam o lançamento inteiro (uma divisão entre categorias aparece como "Várias categorias") e a compra no cartão pelo valor total, na data da compra. Estorno não abate o ranking.
7. **Sem gráfico novo.** Barras são `progress`, a tela é carregada por rota e o JS inicial não cresce. Um gráfico de linhas ou barras com Recharts pode vir depois, reaproveitando o chunk do Fluxo.
8. **Período** com as duas datas juntas ou nenhuma, no máximo 2 anos, para a consulta não ficar sem limite.

## Fora desta onda

Relatório por conta, por cartão ou por tag; comparação entre dois períodos livres; exportação do relatório (a exportação CSV e JSON da Fase 1 continua valendo); gráficos; relatório de previsto ou projetado; evolução do patrimônio (ADR 008).

## Consequências

- Nenhuma tabela nova. `expandirDivisoes` de `orcamentos.js` passa a ser exportada.
- Nada a acrescentar na demonstração: ela já tem lançamentos, cartão e categorias para os relatórios mostrarem.
