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
| RF-10 | Indicadores de módulos que não existem não aparecem: nada de zero falso, dado fictício como real, botão sem efeito ou integração fingida. | todas | Onda 0: ver abaixo; blocos de orçamento e metas em `tests/rf-11-orcamento.test.js`, `tests/rf-13-metas.test.js` e `tests/planejamento-api.test.js` |
| RF-11 | Orçamento: limite mensal por categoria principal, com vigência (vale do mês de início em diante, sem mudar meses anteriores). O gasto é o realizado; previsto e projetado ficam em campos próprios e a situação olha só o realizado. | Fase 2, Onda 1 | `tests/rf-11-orcamento.test.js` |
| RF-12 | A soma do gasto por categoria (com e sem orçamento) é a despesa realizada do resumo: nada é contado duas vezes nem some (cartão, estorno, divisão, tarifa; fatura paga e transferência não entram). | Fase 2, Onda 1 | `tests/rf-12-orcamento-soma.test.js` |
| RF-13 | Meta é reserva virtual: aporte e resgate não alteram saldo nem viram receita ou despesa. O acumulado é aportes − resgates e nunca fica negativo. | Fase 2, Onda 1 | `tests/rf-13-metas.test.js` |
| RF-14 | Situação da meta (concluída, atrasada, em andamento) e valor necessário por mês são calculados, nunca digitados; sem prazo, prazo vencido ou meta concluída não há valor por mês. | Fase 2, Onda 1 | `tests/rf-14-meta-progresso.test.js` |
| RF-15 | Dívida parcelada: as parcelas somam o total (centavos que sobram na primeira), vencem uma por mês, e pago + restante = total. Baixa parcial mantém a ligação com a dívida e a parcela. | Fase 2, Onda 2 | `tests/rf-15-dividas.test.js` |
| RF-16 | A dívida herda o que já existe dos lançamentos: atraso, fluxo e projeção, orçamento e alertas. Excluir a dívida não deixa parcela pendente órfã. | Fase 2, Onda 2 | `tests/rf-16-divida-integracao.test.js` |
| RF-17 | Custo da assinatura: anual = valor × cobranças por ano; equivalente mensal = anual ÷ 12 arredondado; só as ativas entram nos totais. | Fase 2, Onda 2 | `tests/rf-17-assinaturas.test.js` |
| RF-18 | Assinatura pausada não gera cobranças. Reativar não recria as cobranças do período pausado (vale para toda recorrência). | Fase 2, Onda 2 | `tests/rf-18-assinatura-pausa.test.js`, `tests/dividas-assinaturas-api.test.js` |
| RF-19 | Aporte em investimento com conta debita a conta e resgate credita, sem virar despesa nem receita (como a transferência, RF-03). Resgate maior que o valor atual é recusado; investimento ou conta com operações não são excluídos. | Fase 3, Onda 1 | `tests/rf-19-investimento-conta.test.js` |
| RF-20 | Valor atual = última avaliação + aportes − resgates depois dela; resultado = valor atual + resgatado − aportado. Sem avaliação o valor é o custo e não existe resultado nem rentabilidade; o total da carteira só soma o resultado dos avaliados. | Fase 3, Onda 1 | `tests/rf-20-investimento-valor.test.js` |
| RF-21 | Patrimônio líquido = contas + investimentos − (faturas não pagas + parcelas futuras do cartão) − restante das dívidas. Parte de módulo que não existe fica fora; contas a pagar comuns não entram. | Fase 3, Onda 1 | `tests/rf-21-patrimonio.test.js` |

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

## Orçamento e metas (Fase 2, Onda 1)

Cálculo em `servidor/dominio/orcamento.js` e `meta.js` (funções puras); a tela só formata. Decisões em `docs/adr/006-fase-2-planejamento.md`.

- **Limite com vigência (RF-11).** Só a categoria principal de despesa tem limite; subcategorias somam nela. O limite de um mês é o registro de `mes_inicio` mais recente que não passa dele; limite 0 tira o orçamento daquele mês em diante. Alterar o limite não muda meses anteriores.
- **Gasto (RF-11 e RF-12).** Mesma base do resumo: despesas liquidadas pela data de liquidação, compras no cartão pela data da compra e estornos (negativos) pela data do estorno. Lançamento dividido soma em cada categoria; o sem categoria aparece em "Sem categoria". Pagar fatura e transferência não são gasto.
- **Três números separados (RF-02).** `realizado_centavos` (gasto), `previsto_centavos` (pendente do mês) e `projetado_centavos` (soma dos dois, só como projeção). `restante` e `percentual` usam só o realizado.
- **Situação.** `estourado` se o realizado passa do limite; `atencao` a partir de 80% (inclusive o limite exato); senão `ok`. Contas em centavos, sem arredondar percentual. `vai_estourar` é verdadeiro quando o projetado passa do limite e a situação ainda não é `estourado`.
- **Totais.** Só somam categorias com orçamento; o gasto de categoria sem limite aparece à parte (`sem_orcamento`).
- **Alertas.** Orçamento estourado (nível médio) e perto do limite (informativo), só do mês de hoje.
- **Meta (RF-13 e RF-14).** Reserva virtual sem efeito em saldo. Acumulado = aportes − resgates; resgate acima do acumulado e remoção de aporte que o deixaria negativo são recusados (409); aporte no futuro é recusado. Situação calculada: concluída (acumulado ≥ alvo), atrasada (prazo anterior a hoje e não concluída), em andamento. Valor por mês = falta ÷ meses restantes (mês de hoje e do prazo contam), arredondado para cima.
- **Início (RF-10).** O bloco `orcamento` do `/api/resumo` só vem com limite em vigor no mês; o bloco `metas`, só com meta em aberto.

## Dívidas e assinaturas (Fase 2, Onda 2)

Cálculo em `servidor/dominio/divida.js` e `assinatura.js` (puras). Decisões em `docs/adr/007-dividas-e-assinaturas.md`.

- **Parcelas (RF-15).** `gerarParcelas` divide o total com `dividirEmParcelas` e vence uma por mês (dia ajustado ao fim do mês). Cada parcela é uma despesa pendente ligada à dívida.
- **Saldo devedor (RF-15).** Não é gravado: pago = parcelas liquidadas, restante = pendentes, atrasado = pendentes vencidas antes de hoje. Pago + restante = total. Parcela com baixa parcial só conta como paga quando nenhuma linha dela está pendente.
- **Integração (RF-16).** Por serem despesas pendentes comuns, as parcelas entram em atraso, fluxo, projeção, alertas e no previsto do orçamento. Excluir a dívida apaga as pendentes e mantém as pagas.
- **Assinatura (RF-17).** Custo anual = valor × cobranças/ano (semanal 52, quinzenal 26, mensal 12, anual 1); equivalente mensal = anual ÷ 12 arredondado; totais somam só as ativas e derivam o mensal do anual total.
- **Pausa (RF-18).** Pausada não gera cobranças. Ao reativar, as datas passadas sem lançamento viram puladas, para não aparecerem como atrasadas.
- **Início (RF-10).** Os blocos `dividas` e `assinaturas` do `/api/resumo` só vêm com dívida em aberto ou assinatura ativa.

## Investimentos e patrimônio (Fase 3, Onda 1)

Cálculo em `servidor/dominio/investimento.js` e `patrimonio.js` (puras). Decisões em `docs/adr/008-investimentos-e-patrimonio.md`.

- **Operações (RF-19).** Aporte e resgate podem ter conta. `saldo.js` os trata como `aporte_investimento` (debita) e `resgate_investimento` (credita), tipos que nunca entram em receita, despesa, orçamento nem fluxo de resultado. Sem conta, só o investimento muda. A data não pode ser futura nem anterior à última avaliação (que já inclui as operações até a data dela).
- **Valor e resultado (RF-20).** Nada disso é coluna. Rentabilidade = resultado ÷ aportado, em %, com duas casas. `encerrado` = teve operação e vale zero. Excluir exige investimento sem operações; para encerrar um com movimento, registra-se o resgate total.
- **Patrimônio (RF-21).** Contas ativas (as arquivadas ficam de fora, como no saldo total do início) + investimentos − cartões − dívidas. Sem investimento, cartão ou dívida, o `/api/resumo` não traz o bloco `patrimonio` (repetiria o saldo total); `/api/patrimonio` sempre responde.
- **Início (RF-10).** O bloco `investimentos` só vem com algum investimento que valha mais que zero.

## RF-10 na Onda 0

Na Onda 0 o início era um estado vazio e o menu só tinha Início e Configurações, sem botão de lançamento. Na Onda 1 o botão "Novo lançamento" e os valores existem de verdade; sem nenhuma conta, o início mostra só o convite para criar uma, sem zeros.
