# Escopo (versão provisória)

> **PROVISÓRIO.** O escopo original de 34 seções não estava no disco quando o projeto foi iniciado. Este arquivo foi reconstruído a partir do pedido de implementação (Fase 1, ondas 0 a 4 e regras financeiras RF-01 a RF-10). Substitua pelo escopo original quando o tiver; onde ele divergir, ele vale. Itens marcados **[PENDENTE]** dependem do original (tipos de conta, categorias e subcategorias padrão).

## Fase 1 (implementada em ondas)

1. **Fundação**: autenticação local, casca do app, tema, ocultar valores, PWA condicional, modo demo.
2. **Base de lançamentos**: contas e carteiras **[PENDENTE: tipos da seção 4]**; categorias e subcategorias **[PENDENTE: padrão das seções 2 e 3]**; receitas, despesas e transferências (CRUD, status, filtros, busca, ordenação, paginação no servidor, duplicar, dividir entre categorias); histórico de alterações por lançamento.
3. **Cartões**: cartões, faturas (aberta, fechada, parcial, paga, atrasada), compra à vista e parcelada, pagamento total e parcial, estorno, antecipação de parcelas, limite disponível, projeção das próximas faturas.
4. **Compromissos e visão geral**: contas a pagar e a receber, recorrências, fluxo de caixa (diário a anual, projeção de 7, 15, 30, 60 e 90 dias), dashboard, alertas dentro do app.
5. **Fechamento**: exportação CSV e JSON, backup e restauração, revisão de segurança.

## Regras financeiras

Ver `docs/regras-financeiras.md` (RF-01 a RF-10).

## Fase 2: planejamento (implementada, ver ADR 006 e 007)

1. **Onda 1 (pronta):** orçamento mensal por categoria e metas com aportes.
2. **Onda 2 (pronta):** dívidas parceladas e assinaturas.

## Fora das Fases 1 e 2

- **Fase 3 (divisão provisória, ADR 006):** relatórios, patrimônio líquido, investimentos.
- **Fase 4 (divisão provisória, ADR 006):** múltiplas moedas, importação OFX, anexos e comprovantes, IA, integração bancária, cotações automáticas.
- **Sem fase definida:** notificações push e por e-mail.
