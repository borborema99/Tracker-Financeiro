# Product

<!-- impeccable:product-schema 1 -->

> Registro inferido do pedido de migração (Onda 2) e do repositório, sem entrevista: o dono pediu para seguir sem esperar. Fatos marcados como "não decidido" ficam em aberto.

## Platform

web

## Users

Pessoas físicas no Brasil que querem controlar o próprio dinheiro sem entregar acesso bancário a terceiros. Usam principalmente o celular, em instantes curtos (lançar uma despesa logo depois de pagar), e o computador para revisar o mês. Cada conta é de uma pessoa; não há compartilhamento entre contas.

## Product Purpose

Controle financeiro pessoal hospedado: contas, lançamentos, cartões e faturas, contas a pagar e receber, recorrências, fluxo de caixa, orçamento, metas, dívidas, assinaturas, investimentos, patrimônio, relatórios, comprovantes, importação de extrato OFX e moedas estrangeiras. Sucesso é lançar uma despesa em até 3 toques e abrir o mês com números que batem com o extrato.

## Positioning

Todo o cálculo financeiro acontece no servidor, com regras documentadas e testadas (RF-01 a RF-30); a tela só mostra. Sem integração bancária, sem IA, sem cotação automática: o que está na tela foi lançado ou importado pela própria pessoa.

## Operating Context

Português do Brasil, moeda BRL, datas AAAA-MM-DD, dinheiro em centavos inteiros. Front estático no Netlify, API em Netlify Function, Postgres no Supabase, comprovantes em bucket privado. Instalável como PWA no celular. Contas criadas por convite (script) ou por cadastro aberto quando `CADASTRO_ABERTO=1`. Sem e-mail: senha esquecida se redefine pelo dono do site.

## Capabilities and Constraints

- Só existe na landing o que existe de verdade no tracker. Fora por decisão: 2FA, e-mail, push, IA, integração bancária, cotação automática.
- CSP sem `unsafe-inline`: nada de `style=""` nem `<style>` inline; fontes só do próprio domínio.
- Landing carrega sem o código do tracker e sem Recharts (até 120 KB gzip); app inicial até 180 KB gzip.
- Mobile-first, alvos de 44px, contraste AA, tema claro e escuro, verde para entrada e vermelho para saída.
- Política de Privacidade e Termos de Uso são rascunho para revisão jurídica.

## Brand Commitments

Nome: Tracker Financeiro. Identidade anterior "papel e tinta" era provisória; a identidade final é decidida na Onda 2.

## Evidence on Hand

Nenhum depoimento, cliente, número de usuários ou print com dado real. Demonstrações na landing usam dados visivelmente fictícios. Existe o usuário `demo` (script) com dados de exemplo.

## Product Principles

- O número na tela é o número do servidor: nunca recalcular no front.
- Honestidade sobre o que existe: menu e landing só mostram módulos que funcionam.
- Lançar rápido vence enfeitar: o caminho curto para registrar vem antes de qualquer gráfico.
- Os dados são da pessoa: exportar tudo e excluir a conta são recursos de primeira classe.

## Accessibility & Inclusion

WCAG AA de contraste, alvos de toque de 44px, `inputmode="decimal"` em valores, ocultar valores na tela, suporte a tema claro e escuro e a `prefers-reduced-motion`.
