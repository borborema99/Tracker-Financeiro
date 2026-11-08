# ADR 008: investimentos e patrimônio líquido (Fase 3, Onda 1)

Status: aceito.

## Contexto

O escopo original continua indisponível (ADR 002) e a Fase 3 só existe como divisão provisória do ADR 006: relatórios, patrimônio líquido e investimentos. Divisão em ondas: **Onda 1** = investimentos e patrimônio líquido (o patrimônio depende da carteira); **Onda 2** = relatórios. Cotação automática é da Fase 4, então a carteira é manual.

## Decisões

1. **Investimento é um ativo com três coisas:** cadastro (nome, tipo, instituição), operações (aporte e resgate) e avaliações (quanto vale numa data, informado pela pessoa). Aportado, resgatado, valor atual, resultado e rentabilidade não são colunas.
2. **Valor atual = última avaliação + aportes − resgates depois dela.** Operações até a data da avaliação já estão dentro do valor informado. Por isso a data de uma operação não pode ser anterior à última avaliação (409 com a explicação: registrar depois ou excluir a avaliação). Sem avaliação o valor é o custo e **não existe resultado** (nada de zero falso, RF-10). Resultado = valor atual + resgatado − aportado: o que já foi tirado conta como ganho. O total da carteira só soma resultado dos avaliados.
3. **Aporte e resgate podem ter conta.** Com conta, mexem no saldo (aporte debita, resgate credita) mas não são despesa nem receita, como a transferência (RF-03). Ficam fora de resumo, orçamento e fluxo de resultado. Sem conta, só o investimento muda (útil para registrar o que já existia). Escolhi isso em vez de exigir uma transferência para uma conta do tipo `investimento` para evitar contar o mesmo dinheiro duas vezes no patrimônio. Contas do tipo `investimento` continuam existindo e contam como conta; quem usa o módulo não deve duplicar o mesmo dinheiro nos dois.
4. **Nunca negativo.** Resgate maior que o valor atual, remoção de operação ou de avaliação que deixaria o valor negativo: 409.
5. **Exclusão.** Investimento com operações não é excluído (RF-08): encerra-se com resgate total (`encerrado`). Conta com aporte ou resgate de investimento só pode ser arquivada.
6. **Patrimônio líquido = contas ativas + investimentos − (faturas não pagas + parcelas futuras do cartão) − restante das dívidas.** Faturas e parcelas futuras são disjuntas (RF-06), então não há contagem dupla. Contas a pagar comuns e assinaturas não são dívida contraída e ficam de fora. Contas arquivadas ficam de fora, como no saldo total do início, para não haver dois saldos diferentes. Investimentos sem valor informado entram pelo custo (a tela avisa quantos).
7. **Início.** Bloco `investimentos` só com algum investimento que valha mais que zero; bloco `patrimonio` só quando há investimento, cartão ou dívida (senão repetiria o saldo total). A tela `/patrimonio` sempre funciona.

## Fora desta onda

Evolução do patrimônio mês a mês (exigiria reconstruir faturas e dívidas no passado); preço e quantidade de cotas, proventos, imposto e come-cotas; meta ligada a investimento; importação de extrato da corretora; cotação automática (Fase 4); relatórios (Onda 2).

## Consequências

- Migration `007_investimentos.sql` (tabelas `investimentos`, `investimentos_operacoes`, `investimentos_avaliacoes`). Entram na cópia JSON.
- `saldo.js` ganha os tipos `aporte_investimento` e `resgate_investimento`.
- A demonstração ganhou dois investimentos (flag `demo_dados_v6`).
