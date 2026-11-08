# ADR 007: dívidas e assinaturas (Fase 2, Onda 2)

Status: aceito.

## Contexto

A Onda 2 da Fase 2 entrega dívidas parceladas e assinaturas. Os dois módulos precisam herdar atraso (RF-07), fluxo, projeção, alertas e orçamento, sem criar uma segunda fonte de verdade para o que já existe nos lançamentos.

## Decisões

1. **Dívida = parcelas como despesas pendentes.** Criar uma dívida gera N despesas pendentes (`movimentacoes.divida_id` e `divida_parcela`), com descrição "Nome (n/N)". Soma das parcelas = total, com os centavos que sobram na primeira (mesma regra do cartão). Vencimentos mensais; o dia é ajustado ao fim do mês quando o mês é mais curto.
2. **Nada de saldo devedor gravado.** Pago, restante, atrasado, parcelas pagas, percentual, próxima parcela e situação (`em_dia`, `atrasada`, `quitada`, `sem_parcelas`) saem dos lançamentos ligados (`dominio/divida.js`). `valor_total_centavos` é o valor contratado. Baixa parcial divide a parcela em duas linhas com o mesmo `divida_parcela`; a parcela só conta como paga quando nenhuma linha dela está pendente.
3. **Só texto é editável depois de criada.** Nome, credor e observação (o nome propaga para as descrições, com auditoria). Valor, número de parcelas e vencimento não mudam: para isso, excluir e criar de novo.
4. **Excluir apaga a dívida e as parcelas pendentes; as pagas ficam nos lançamentos.** Não sobra parcela órfã (RF-16).
5. **Assinatura = recorrência de despesa com `recorrencias.assinatura = 1`.** Só despesa pode ser assinatura. Cada cobrança já nasce como conta a pagar pelo mecanismo de recorrências, então atraso, fluxo, alertas e orçamento vêm de graça.
6. **Custo calculado.** Custo anual = valor × cobranças por ano (semanal 52, quinzenal 26, mensal 12, anual 1). Equivalente mensal = anual ÷ 12 arredondado. O total mensal sai do total anual das ativas (e não da soma dos arredondados), para não acumular erro. Pausadas não entram.
7. **Correção que vale para toda recorrência (RF-18).** Ao reativar uma recorrência pausada, as datas anteriores a hoje sem lançamento viram "puladas" em `recorrencias_puladas`. Sem isso, reativar recriaria como atrasadas as cobranças do período em que ela esteve pausada.
8. **Menu e Início só mostram o que existe (RF-10).** Os blocos `dividas` e `assinaturas` do `/api/resumo` só vêm com dívida em aberto ou assinatura ativa.

## Fora desta onda

Juros, amortização e quitação antecipada; renegociação; edição de valor ou prazo; assinatura no cartão de crédito; detecção automática de assinaturas a partir de lançamentos.

## Consequências

- Migration `006_dividas_assinaturas.sql` (tabela `dividas`, colunas em `movimentacoes` e `recorrencias`). `dividas` entra na cópia JSON.
- A demonstração ganhou uma dívida e três assinaturas (flag `demo_dados_v5`).
