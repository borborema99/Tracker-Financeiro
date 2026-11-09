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
| RF-22 | Evolução mensal: cada mês soma o realizado do próprio mês, na mesma base do resumo (cartão pela compra, estorno pela data dele; pendente, pagamento de fatura e transferência não entram). A média só conta a partir do primeiro mês com movimento. | Fase 3, Onda 2 | `tests/rf-22-relatorio-evolucao.test.js` |
| RF-23 | Por categoria: subcategorias somam na principal, a soma dos itens é a despesa (ou receita) realizada do resumo, e o período anterior são os mesmos meses antes (meses cheios) ou o mesmo número de dias. Variação é null sem valor anterior. | Fase 3, Onda 2 | `tests/rf-23-relatorio-categorias.test.js` |
| RF-24 | Maiores despesas: ranking das despesas realizadas (lançamentos liquidados e compras no cartão pelo valor total), da maior para a menor, limitado; as rotas exigem sessão e validam o período. | Fase 3, Onda 2 | `tests/rf-24-relatorio-api.test.js` |
| RF-25 | Anexo (comprovante) só em lançamento existente; o tipo vem dos bytes (PDF, PNG, JPG, WEBP), com limite de tamanho e de quantidade, sem repetir o mesmo arquivo. Remover apaga o conteúdo e deixa o registro no audit_log; lançamento excluído esconde os anexos; o backup leva o conteúdo e o JSON não. | Fase 4, Onda 1 | `tests/rf-25-anexos.test.js` |
| RF-26 | Leitura de OFX 1.x e 2.x: valor em centavos inteiros e com sinal (positivo é receita, negativo é despesa), data só AAAAMMDD, FITID repetido e linha ilegível vão para a lista de inválidas, e só extrato em BRL é aceito. | Fase 4, Onda 1 | `tests/rf-26-ofx.test.js` |
| RF-27 | Importar extrato cria lançamentos liquidados que entram no saldo e no realizado uma única vez: o mesmo FITID nunca entra duas vezes (RF-09 só avisa, não bloqueia), o lote é tudo ou nada e quem exclui o lançamento pode importar de novo. | Fase 4, Onda 1 | `tests/rf-27-importacao-ofx.test.js` |
| RF-28 | Conta em moeda estrangeira: o saldo é calculado na própria moeda (saldo inicial + depósitos e compras − saques e vendas), nunca fica negativo, e moedas diferentes nunca são somadas entre si. A conversão usa inteiros e arredonda para o centavo mais próximo. | Fase 4, Onda 2 | `tests/rf-28-moeda-saldo.test.js` |
| RF-29 | Comprar moeda debita a conta em reais e vender credita, pelo valor em reais que a pessoa informou; não é despesa nem receita e não entra no realizado. Conta em reais com compra ou venda só arquiva. | Fase 4, Onda 2 | `tests/rf-29-moeda-compra-venda.test.js` |
| RF-30 | A cotação é informada à mão (uma por moeda e data, nunca futura); vale a mais recente até hoje. Sem cotação o valor em reais é nulo, não zero: a conta fica fora do patrimônio, com aviso. | Fase 4, Onda 2 | `tests/rf-30-moeda-cotacao-patrimonio.test.js` |

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

## Relatórios (Fase 3, Onda 2)

Cálculo em `servidor/dominio/relatorio.js` (puro). Decisões em `docs/adr/009-relatorios.md`.

- **Base única (RF-22, RF-23).** Relatórios só leem o realizado, com as mesmas consultas do resumo e do orçamento (`despesasRealizadasPorCategoria`, `movimentacoesDoPeriodo`, `movimentosDeCartaoDoPeriodo`). Não existe número de relatório que concorra com o do Início.
- **Evolução (RF-22).** `/api/relatorios/evolucao?meses=N` (1 a 24, padrão 6; o mês atual é o último).
- **Categorias (RF-23).** `/api/relatorios/categorias?de&ate&tipo` (despesa ou receita; sem datas, o mês atual). Receita usa só receita liquidada, com divisão. Categoria que só teve valor no período anterior aparece com valor zero.
- **Maiores despesas (RF-24).** `/api/relatorios/maiores-despesas?de&ate&limite` (1 a 50, padrão 10).
- **Período.** As duas datas juntas ou nenhuma, a final não antes da inicial, no máximo 2 anos (731 dias).

## Anexos e importação OFX (Fase 4, Onda 1)

Cálculo em `servidor/dominio/anexo.js` e `ofx.js` (puras). Decisões em `docs/adr/010-anexos-e-importacao-ofx.md`.

- **Anexos (RF-25).** Corpo cru na requisição (sem dependência nova), nome no cabeçalho `x-nome-arquivo`. Limites: 5 MB por arquivo e 10 por lançamento. Imagem abre na tela; PDF baixa. O conteúdo fica no SQLite (`anexos_arquivos`), por isso o backup e a restauração o levam sem pasta à parte.
- **OFX (RF-26).** Codificação pelo cabeçalho do arquivo (`CHARSET:1252`) ou, sem ele, UTF-8 com queda para Windows-1252. Sem FITID, a chave é derivada de data, valor, descrição e da ordem entre idênticas.
- **Importação (RF-27).** Duas etapas: a prévia marca cada transação (`nova`, `ja_importada`, `possivel_duplicidade`) sem gravar; a confirmação revalida no servidor. Cada lançamento importado fica ligado ao FITID em `importacoes_ofx` (único por conta). Só BRL, mesmo com moedas (ADR 011).

## Múltiplas moedas (Fase 4, Onda 2)

Cálculo em `servidor/dominio/moeda.js` (puro). Decisões em `docs/adr/011-multiplas-moedas.md`.

- **Base em reais (RF-28).** Lançamentos, resumo, orçamento, fluxo e relatórios seguem só em BRL, sem nenhuma mudança. Dinheiro em outra moeda vive em `contas_moeda`, com saldo na própria moeda; o saldo em reais das contas nunca soma moeda estrangeira. Moedas aceitas: USD, EUR, GBP, CAD, AUD, CHF, ARS, UYU e MXN (2 casas decimais).
- **Conversão (RF-28).** `converterParaBrl(valor, taxa)` multiplica em BigInt e arredonda para o mais próximo (metade se afasta do zero). A taxa é "reais por 1 unidade" em milionésimos (5,4321 vira 5432100), com teto de R$ 1.000 por unidade.
- **Compra e venda (RF-29).** Exigem conta em reais e o valor em reais efetivamente pago ou recebido; a cotação embutida (`taxaImplicita`) é só informação. Depósito e saque não tocam em conta em reais. Saque e venda maiores que o saldo, e remover o que deixaria o saldo negativo, são recusados.
- **Cotação (RF-30).** Informada à mão, nunca no futuro. Sem cotação a conta fica sem valor em reais e fora do patrimônio, com aviso (nada de zero falso). O Início e o patrimônio só trazem a parte de moedas quando há saldo.
- **Fora desta onda.** Receita e despesa em moeda estrangeira com categoria, orçamento ou relatório; transferência entre conta em reais e em moeda (é compra ou venda); cartão em moeda; cotação automática.

## RF-10 na Onda 0

Na Onda 0 o início era um estado vazio e o menu só tinha Início e Configurações, sem botão de lançamento. Na Onda 1 o botão "Novo lançamento" e os valores existem de verdade; sem nenhuma conta, o início mostra só o convite para criar uma, sem zeros.
