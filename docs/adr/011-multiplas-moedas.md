# ADR 011: múltiplas moedas com o BRL como base (Fase 4, Onda 2)

Status: aceito.

## Contexto

O projeto decidiu "moeda BRL" e dinheiro em centavos inteiros. A Fase 4 provisória (ADR 006) pede múltiplas moedas. Somar valores de moedas diferentes dá número errado, e converter tudo no lançamento exigiria uma cotação em cada despesa, mexendo em saldo, resumo, orçamento, fluxo e relatórios (dezenas de consultas que hoje estão corretas).

## Decisão

1. **O BRL continua sendo a base.** `movimentacoes`, resumo, orçamento, fluxo, relatórios, cartões e dívidas não mudam de cálculo. O que muda é só o saldo das contas em reais (que enxerga compra e venda de moeda), o patrimônio e o `/api/resumo`, que ganha o bloco `moedas`.
2. **Moeda estrangeira vive em contas próprias** (`contas_moeda`), com saldo na própria moeda, calculado das operações (depósito, saque, compra e venda). Segue o molde dos investimentos (ADR 008): módulo separado, pseudo-movimentos para o saldo em reais, nenhum cálculo no front.
3. **Nunca somamos moedas diferentes.** O saldo em reais das contas não inclui moeda estrangeira. O valor em reais de uma conta em moeda só existe com cotação, e só entra no patrimônio convertido.
4. **Compra e venda trocam moeda por reais** de uma conta em reais, pelo valor em reais que a pessoa informa (o que pagou ou recebeu de fato, com tarifa e IOF incluídos). Não são despesa nem receita, como o aporte em investimento. A cotação embutida aparece só como informação. Ganho ou perda cambial não é calculado nesta onda.
5. **A cotação é informada à mão**, uma por moeda e data, nunca no futuro; vale a mais recente até hoje. Fica como `taxa_micros` (reais por unidade × 1.000.000), inteiro. A conversão usa BigInt e arredonda para o centavo mais próximo. Limites (1e12 centavos × 1e9 micros) mantêm o resultado dentro de um inteiro seguro.
6. **Sem cotação, sem zero falso.** A conta aparece com o saldo na moeda e o aviso "sem cotação"; fica fora da soma e do patrimônio, que avisa quantas contas ficaram de fora.
7. **Moedas de 2 casas decimais** (USD, EUR, GBP, CAD, AUD, CHF, ARS, UYU, MXN), para o dinheiro seguir em "centavos". Moedas sem casas (JPY, CLP) ou com 3 casas ficam fora; a lista fica na migration (CHECK) e em `contratos/moedas.js`.
8. **A moeda e o saldo inicial não mudam** depois de criada a conta (o saldo se ajusta com depósito e saque); só nome e observação editam. Exclusão só sem operações; com operações, o caminho é sacar ou vender tudo (a conta aparece como "Encerrada"). Conta em reais com compra ou venda só arquiva.
9. **Importação OFX continua só BRL** (ADR 010).

## Fora desta onda

Receita e despesa em moeda estrangeira com categoria, orçamento e relatório; cartão de crédito em moeda; lançamento em moeda com conversão na data; ganho ou perda cambial; transferência direta entre conta em reais e em moeda (use compra ou venda); cotação automática (precisa de serviço externo, ver ADR 010).

## Consequências

- Migration `009_moedas.sql` (`contas_moeda`, `moeda_operacoes`, `moeda_cotacoes`); as três tabelas entram no JSON e no backup.
- Tela `Moedas` carregada por rota; Início e patrimônio ganham a parte de moedas só quando há saldo.
- Regras RF-28 a RF-30, com testes.
