# Regras financeiras

Cada regra vira teste cujo nome começa com o ID (`RF-01 ...`). A coluna "Testes" só é preenchida quando o teste existe.

| ID | Regra | Entra em | Testes |
| --- | --- | --- | --- |
| RF-01 | Só movimentação liquidada altera saldo e conta como receita ou despesa realizada. Prevista não altera saldo. | Onda 1 | `tests/rf-01-saldo.test.js` |
| RF-02 | Realizado, previsto e projetado são visões separadas e nunca se misturam em um mesmo número. | Onda 1 | `tests/rf-02-visoes.test.js` |
| RF-03 | Transferência entre contas próprias não é receita nem despesa. A tarifa da transferência é despesa. | Onda 1 | `tests/rf-03-transferencia.test.js` |
| RF-04 | Compra no cartão é despesa uma vez, na data da compra (competência), e entra na fatura pelo dia de fechamento. Pagar a fatura debita a conta e abate a fatura, sem nova despesa. | Onda 2 | `tests/rf-04-cartao.test.js`, `tests/dominio-cartao.test.js` |
| RF-05 | Compra parcelada gera uma parcela por fatura, cada uma com seu vencimento. Estorno reverte ou ajusta o lançamento original. Reembolso fica ligado à despesa original. | Onda 2 | `tests/rf-05-parcelas-estorno.test.js` |
| RF-06 | Limite do cartão e saldo bancário são separados. Limite disponível = limite total − faturas não pagas − parcelas futuras ainda não pagas. | Onda 2 | `tests/rf-06-limite.test.js` |
| RF-07 | Atrasada é estado calculado (pendente com vencimento passado), nunca digitado. | Onda 3 | `tests/rf-07-atraso.test.js`, "RF-07 (fatura)" em `tests/dominio-cartao.test.js` |
| RF-08 | Editar ou excluir atualiza todos os indicadores. Excluir não deixa parcelas, faturas ou transferências órfãs. | Onda 1 e 2 | `tests/rf-08-edicao-exclusao.test.js` (lançamentos), `tests/rf-08-cartoes.test.js` (compras, parcelas, faturas, reembolso) |
| RF-09 | Uma movimentação nunca é contada duas vezes. Possível duplicidade (mesmo valor, data, conta e descrição) avisa sem bloquear. | Onda 1 e 2 | `tests/rf-09-duplicidade.test.js`, `tests/rf-09-compra-duplicada.test.js` (cartão) |
| RF-10 | Indicadores de módulos que não existem não aparecem: nada de zero falso, dado fictício como real, botão sem efeito ou integração fingida. | todas | Onda 0: ver abaixo |

## Dinheiro (base das regras)

Centavos inteiros; parse e format únicos em `contratos/dinheiro.js`; em parcelas a soma fecha com o total e o resto vai para a primeira. Testes: `tests/dinheiro.test.js`.

## Cartões (Onda 2)

Todo o cálculo está em `servidor/dominio/cartao.js` (funções puras); a tela só formata.

- **Fatura pelo fechamento (RF-04).** Compra feita até o dia de fechamento (inclusive) entra na fatura que fecha naquele mês; depois, na do mês seguinte. O vencimento é no mesmo mês se o dia de vencimento for depois do fechamento, senão no seguinte. Dias vão de 1 a 28. A fatura guarda as datas do ciclo em que nasceu: mudar o fechamento do cartão só vale para as faturas novas.
- **Despesa uma vez (RF-04).** A compra no cartão conta como despesa realizada pelo valor total, na data da compra. As parcelas só distribuem o pagamento pelas faturas e não viram despesa de novo. Pagar a fatura debita a conta (`pagamentos_fatura`, que só o cálculo de saldo enxerga) e não aparece como lançamento nem como despesa.
- **Parcelas (RF-05).** Uma por fatura, cada uma com seu vencimento; a soma fecha com o total e o resto de centavos vai para a primeira.
- **Estorno (RF-05).** Ajusta a compra original (valor líquido = total − estornos), reduz a despesa realizada na data do estorno e cai como crédito na fatura aberta de hoje (ou na primeira seguinte sem pagamento). Crédito maior que a fatura passa para a seguinte do mesmo cartão. Estornar tudo reverte a compra; a fatura que já fechou continua devida.
- **Reembolso (RF-05).** Receita ligada à despesa original (`reembolso_de_id`). A soma dos reembolsos não passa do valor da despesa; a despesa com reembolso não se exclui nem fica menor que ele. O reembolso entra como receita realizada (não abate a despesa).
- **Antecipação.** Traz parcelas futuras para a fatura aberta de hoje; o valor não muda. Não vale para parcela que já está na fatura aberta ou antes.
- **Limite (RF-06).** Disponível = limite − faturas não pagas (da aberta para trás) − parcelas futuras não pagas (faturas depois da aberta). Saldo bancário não entra na conta. Passar do limite avisa e não bloqueia (o disponível fica negativo).
- **Situação da fatura (calculada, nunca digitada).** `paga` > `atrasada` (vencimento passou) > `parcial` > `fechada` > `aberta`. Teste: "RF-07 (fatura)" em `tests/dominio-cartao.test.js`; a regra RF-07 de contas a pagar está em "Compromissos (Onda 3)".
- **Nada órfão (RF-08).** Excluir compra tira as parcelas e os estornos; fatura sem linha deixa de aparecer. Nenhuma mudança pode deixar uma fatura com mais pagamento do que o total (a operação é recusada com 409). Cartão com compras só se arquiva; conta com pagamento de fatura ou escolhida por um cartão só se arquiva; categoria usada em compra só se arquiva.
- **Duplicidade (RF-09).** Mesma compra (cartão, valor total, data e descrição) avisa sem bloquear.

## Compromissos (Onda 3)

Cálculo em `servidor/dominio/compromisso.js`, `recorrencia.js`, `fluxo.js` e `alertas.js` (funções puras); a tela só formata.

- **Compromisso (RF-07).** Conta a pagar ou a receber é uma receita/despesa **pendente**; o vencimento que vale é `data_vencimento` ou, na falta dela, a competência. **Atrasada** é pendente com vencimento antes de hoje, calculada a cada leitura contra a data de hoje no fuso configurado: não existe coluna nem status "atrasada", e o contrato recusa esse valor. Vence hoje não é atraso. Liquidada nunca é atrasada. Reagendar o vencimento tira do atraso.
- **Totais separados.** Atrasado, vence nos próximos 7 dias e depois disso, em três números que somam o total pendente. Não se misturam com o realizado (RF-02).
- **Baixa parcial.** Pagar ou receber parte do valor: o lançamento original vira liquidado pelo valor baixado e o restante nasce como novo pendente (`baixa_de_id` aponta para o original), com o mesmo vencimento. Baixar o valor inteiro é a liquidação comum. Não vale para lançamento dividido entre categorias, despesa com reembolso ligado, liquidado ou transferência. Baixa não pode ter data futura. A soma baixada + restante é sempre o valor original.
- **Reagendar.** Muda só o vencimento do pendente; a competência não muda. Fica no `audit_log`.
- **Recorrência.** Semanal, quinzenal (14 dias), mensal ou anual, com data inicial e final opcional. A i-ésima data é calculada a partir do início (sem acumular erro); mensal e anual no dia que não existe no mês (31, 29/02) usam o último dia do mês e voltam ao dia original depois. As ocorrências viram compromissos pendentes até hoje + 90 dias.
- **Geração idempotente, sem processo em segundo plano.** Roda ao abrir o app (`/api/sessao`) e ao listar (lançamentos, compromissos, recorrências, resumo, fluxo, calendário, alertas). Rodar de novo não cria nada: o banco tem índice único `(recorrencia_id, data_ocorrencia)` para ocorrências ativas. Ocorrência apagada pelo dono entra em `recorrencias_puladas` e não volta. Se a data de início já passou, as ocorrências até hoje entram como pendentes (atrasadas), para dar baixa ou apagar. Conta arquivada: não gera.
- **Editar, pausar ou excluir recorrência** vale daqui para frente: as ocorrências pendentes de hoje em diante são refeitas (ou removidas); o que já venceu ou foi liquidado não muda.
- **Fluxo realizado (RF-02).** Visão de caixa: liquidadas por data de liquidação e pagamentos de fatura por data de pagamento, por dia, semana (começa na segunda), mês ou ano. Transferência entre contas não entra; compra no cartão só entra quando a fatura é paga (RF-04).
- **Projeção.** Saldo total de hoje (contas não arquivadas) mais compromissos pendentes no vencimento e faturas de cartão em aberto no vencimento da fatura, para 7, 15, 30, 60 ou 90 dias. O que já venceu e não foi baixado pesa em hoje. Detecta períodos de saldo negativo e o menor saldo. É a visão "projetada" do RF-02, separada do realizado e do previsto.
- **Alertas.** Calculados na hora, só dentro do app: conta a pagar ou recebimento atrasado, vencimento em até 3 dias, fatura atrasada ou vencendo, fechamento de fatura em até 3 dias e saldo projetado negativo nos próximos 30 dias. Sem pendência não há alerta (RF-10); o selo do sino some.
- **Início (RF-10).** O bloco de compromissos e o gráfico de projeção só aparecem se existir compromisso pendente ou cartão; o bloco `compromissos` do `/api/resumo` só vem nesse caso.

## RF-10 na Onda 0

Na Onda 0 o início era um estado vazio e o menu só tinha Início e Configurações, sem botão de lançamento. Na Onda 1 o botão "Novo lançamento" e os valores existem de verdade; sem nenhuma conta, o início mostra só o convite para criar uma, sem zeros.
