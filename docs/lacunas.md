# Lacunas: escopo contra o código

Gerado em 2026-11-09 contra `docs/escopo-completo.md` (reconstruído, ver `docs/adr/012-escopo-reconstruido.md`). É o **único lugar** com o status das fases: o escopo não carrega status.

Situações: **feito**, **parcial**, **falta**, **fora por decisão** (com o ADR). Os caminhos são relativos à raiz.

Os itens "fora por decisão" não serão implementados. A decisão de produto está no ADR 012; a razão técnica de IA, banco e cotação está no ADR 010.

## Tabela

| Seção | Item | Situação | Onde está no código |
|---|---|---|---|
| 1 Princípios | 1.1 Várias contas, dados isolados por usuário | feito | `servidor/banco/pg/escopo.js`, `tests/isolamento.test.js`, ADR 013 |
| 1 Princípios | 1.2 Um processo (API + front) | feito | `servidor/app.js` |
| 1 Princípios | 1.3 Centavos, datas, UTC, fuso | feito | `contratos/dinheiro.js`, `servidor/dominio/datas.js`, `contratos/config.js` |
| 1 Princípios | 1.4 Saldo calculado, exclusão lógica, histórico | feito | `servidor/dominio/saldo.js`, `servidor/banco/auditoria.js` |
| 1 Princípios | 1.5 Menu só com módulo que funciona | feito | `frontend/src/app/modulos.ts` |
| 2 Categorias | 2.1 Conjunto padrão | feito | `servidor/banco/padroes.js`, migration `010_padroes_e_tipos_de_conta.sql` |
| 2 Categorias | 2.2 Criar, renomear, arquivar, excluir | feito | `servidor/banco/repositorios/categorias.js`, `frontend/src/app/telas/Categorias.tsx` |
| 2 Categorias | 2.3 Categoria de sistema (tarifas) | feito | coluna `papel` em `categorias`, `padroes.js` |
| 2 Categorias | 2.4 Cor ou ícone | falta | `contratos/categorias.js` só tem nome, tipo, pai, arquivada |
| 3 Subcategorias | 3.1 Conjunto padrão | feito | `servidor/banco/padroes.js`, migration 010 |
| 3 Subcategorias | 3.2 Criar, editar, arquivar, excluir, mover | feito | `repositorios/categorias.js` (`pai_id` editável) |
| 3 Subcategorias | 3.3 Relatório e orçamento agrupam no pai | feito | `servidor/dominio/relatorio.js`, `servidor/dominio/orcamento.js` |
| 4 Contas | 4.1 Tipos de conta | feito | `contratos/contas.js`, migration 010 (7 tipos) |
| 4 Contas | 4.2 Saldo inicial e saldo calculado | feito | `servidor/dominio/saldo.js`, `repositorios/contas.js` |
| 4 Contas | 4.3 Arquivar e excluir | feito | `repositorios/contas.js`, `frontend/src/app/telas/Contas.tsx` |
| 4 Contas | 4.4 Ajuste de saldo por conferência | falta | nenhum código |
| 4 Contas | 4.5 Saldo por conta e total no dashboard | feito | `servidor/rotas/resumo.js` (`por_conta`), `frontend/src/app/telas/Inicio.tsx` |
| 5 Receitas | 5.1 Campos e status | feito | `contratos/movimentacoes.js`, `repositorios/movimentacoes.js` |
| 5 Receitas | 5.2 Liquidar e reabrir | feito | `servidor/rotas/movimentacoes.js` (`liquidar`, `reabrir`) |
| 6 Despesas | 6.1 Campos e status | feito | `contratos/movimentacoes.js` |
| 6 Despesas | 6.2 Pendente fora do saldo | feito | `servidor/dominio/saldo.js` (RF-01, RF-02) |
| 7 Transferências | 7.1 Move saldo sem receita nem despesa | feito | `servidor/dominio/movimentacao.js` (RF-03) |
| 7 Transferências | 7.2 Origem diferente do destino | feito | CHECK em `002_lancamentos.sql`, validação em `repositorios/movimentacoes.js` |
| 8 Gestão | 8.1 Filtros, busca, ordenação | feito | `frontend/src/app/telas/Lancamentos.tsx`, `repositorios/movimentacoes.js` |
| 8 Gestão | 8.2 Paginação no servidor | feito | `contratos/movimentacoes.js`, `repositorios/movimentacoes.js` |
| 8 Gestão | 8.3 Duplicar | feito | `frontend/src/app/telas/FormularioLancamento.tsx` |
| 8 Gestão | 8.4 Dividir entre categorias | feito | tabela `movimentacao_divisoes` |
| 8 Gestão | 8.5 Histórico por lançamento | feito | `GET /api/movimentacoes/:id/historico`, `frontend/src/app/telas/HistoricoLancamento.tsx` |
| 8 Gestão | 8.6 Etiquetas | falta | nenhum código |
| 8 Gestão | 8.7 Edição e exclusão em lote | falta | nenhum código |
| 8 Gestão | 8.8 Aviso de duplicado | parcial | só em compra de cartão (RF-09) e na importação OFX; lançamento digitado não avisa (`servidor/dominio/duplicidade.js`) |
| 9 Cartões | 9.1 Cadastro com limite, fechamento e vencimento | feito | `contratos/cartoes.js`, `frontend/src/app/telas/Cartoes.tsx` |
| 9 Cartões | 9.2 Situação da fatura calculada | feito | `servidor/dominio/cartao.js` (RF-04, RF-07) |
| 9 Cartões | 9.3 Pagamento total e parcial | feito | `POST /api/faturas/:id/pagamentos` |
| 9 Cartões | 9.4 Cartão em outra moeda | falta | ADR 011 deixa fora |
| 10 Compras | 10.1 À vista e parcelada | feito | `servidor/dominio/cartao.js`, `contratos/dinheiro.js` (RF-05) |
| 10 Compras | 10.2 Estorno | feito | `POST /api/compras-cartao/:id/estornos` |
| 10 Compras | 10.3 Antecipação de parcelas | feito | `POST /api/compras-cartao/:id/antecipar` |
| 10 Compras | 10.4 Aviso de compra duplicada | feito | `encontrarComprasDuplicadas` (RF-09) |
| 10 Compras | 10.5 Comprovante em compra de cartão | falta | anexos só em lançamentos (ADR 010) |
| 11 Limite | 11.1 Limite disponível | feito | `servidor/dominio/cartao.js` (RF-06) |
| 11 Limite | 11.2 Projeção de faturas | feito | `GET /api/cartoes/:id/projecao` |
| 12 A pagar/receber | 12.1 Lista com atraso | feito | `servidor/dominio/compromisso.js`, `frontend/src/app/telas/Compromissos.tsx` |
| 12 A pagar/receber | 12.2 Baixa total e parcial | feito | `POST /api/compromissos/:id/baixa-parcial` |
| 12 A pagar/receber | 12.3 Reagendar | feito | `POST /api/compromissos/:id/reagendar` |
| 12 A pagar/receber | 12.4 Parcelar conta a pagar | falta | README "O que ainda não tem" |
| 12 A pagar/receber | 12.5 Juros e multa de atraso | falta | nenhum código |
| 13 Recorrências | 13.1 Frequência, início e fim | feito | `contratos/recorrencias.js`, `servidor/dominio/recorrencia.js` |
| 13 Recorrências | 13.2 Geração de futuros pendentes | feito | `repositorios/recorrencias.js` |
| 13 Recorrências | 13.3 Editar e encerrar | feito | `PUT/DELETE /api/recorrencias/:id` |
| 14 Fluxo | 14.1 Dia, semana, mês e ano | feito | `contratos/fluxo.js` (`AGRUPAMENTOS`), `servidor/dominio/fluxo.js` |
| 14 Fluxo | 14.2 Projeção de 7 a 90 dias | feito | `GET /api/fluxo/projecao` |
| 14 Fluxo | 14.3 Calendário financeiro | feito | `GET /api/calendario`, `frontend/src/app/telas/Fluxo.tsx` |
| 14 Fluxo | 14.4 Aviso de saldo projetado negativo | feito | `servidor/dominio/alertas.js` |
| 15 Dashboard | 15.1 Saldo, receitas e despesas do mês | feito | `servidor/dominio/resumo.js`, `Dashboard.jsx` |
| 15 Dashboard | 15.2 Só módulos que existem | feito | `Dashboard.jsx` |
| 15 Dashboard | 15.3 Blocos só com dados | feito | `Dashboard.jsx` (investimentos, patrimônio, moedas) |
| 16 Alertas | 16.1 Atraso, vencimento, fatura, saldo negativo | feito | `servidor/dominio/alertas.js`, `frontend/src/app/telas/Alertas.tsx` |
| 16 Alertas | 16.2 Orçamento perto do limite ou estourado | feito | `alertas.js` (`orcamento_atencao`, `orcamento_estourado`) |
| 16 Alertas | 16.3 Meta atrasada | falta | `alertas.js` não tem alerta de meta |
| 17 Orçamento | 17.1 Limite por categoria, realizado, restante | feito | `servidor/dominio/orcamento.js` (RF-11) |
| 17 Orçamento | 17.2 Soma e comparação com a receita | feito | RF-12, `frontend/src/app/telas/Orcamento.tsx` |
| 17 Orçamento | 17.3 Copiar do mês anterior | falta | nenhum código |
| 17 Orçamento | 17.4 Sobra ou estouro passa ao mês seguinte | falta | nenhum código |
| 18 Metas | 18.1 Meta, prazo e aportes | feito | `servidor/dominio/meta.js` (RF-13), `frontend/src/app/telas/Metas.tsx` |
| 18 Metas | 18.2 Progresso calculado | feito | RF-14 |
| 18 Metas | 18.3 Reserva de emergência como meta | feito | uma meta comum; a demo cria um exemplo (`servidor/demo/semear.js`) |
| 19 Dívidas | 19.1 Parcelas viram contas a pagar | feito | `servidor/dominio/divida.js` (RF-15, RF-16) |
| 19 Dívidas | 19.2 Saldo devedor e progresso | feito | `frontend/src/app/telas/DividaDetalhe.tsx` |
| 19 Dívidas | 19.3 Juros, amortização, quitação antecipada | falta | README "O que ainda não tem" |
| 19 Dívidas | 19.4 Editar valor ou prazo | falta | hoje se exclui e cria de novo |
| 20 Assinaturas | 20.1 Valor, periodicidade, conta | feito | `servidor/dominio/assinatura.js` (RF-17) |
| 20 Assinaturas | 20.2 Custo mensal e anual | feito | `assinatura.js` |
| 20 Assinaturas | 20.3 Pausar e reativar | feito | RF-18, `POST /api/assinaturas/:id/pausar` |
| 20 Assinaturas | 20.4 Assinatura no cartão | falta | README "O que ainda não tem" |
| 21 Investimentos | 21.1 Aportes, resgates, valor atual | feito | `servidor/dominio/investimento.js` (RF-19) |
| 21 Investimentos | 21.2 Resultado e rentabilidade | feito | RF-20 |
| 21 Investimentos | 21.3 Ligados a uma conta | feito | RF-19, `repositorios/investimentos.js` |
| 21 Investimentos | 21.4 Cotas, proventos, imposto | falta | README "O que ainda não tem" |
| 22 Patrimônio | 22.1 Contas, investimentos, cartões, dívidas | feito | `servidor/dominio/patrimonio.js` (RF-21) |
| 22 Patrimônio | 22.2 Cada parte só se o módulo existir | feito | `patrimonio.js` |
| 22 Patrimônio | 22.3 Evolução mês a mês | falta | README "O que ainda não tem" |
| 23 Relatórios | 23.1 Evolução mês a mês | feito | `servidor/dominio/relatorio.js` (RF-22) |
| 23 Relatórios | 23.2 Por categoria com período anterior | feito | RF-23 |
| 23 Relatórios | 23.3 Maiores despesas | feito | `GET /api/relatorios/maiores-despesas` (RF-24) |
| 23 Relatórios | 23.4 Gráficos | parcial | a evolução mês a mês e o Fluxo têm gráfico (`frontend/src/app/telas/GraficoFluxo.tsx`); categorias e maiores despesas só em tabela |
| 23 Relatórios | 23.5 Por etiqueta ou por conta | falta | depende de 8.6 para etiqueta; por conta não existe |
| 24 Anexos | 24.1 Até 10 arquivos de 5 MB, tipo pelos bytes | feito | `servidor/dominio/anexo.js` (RF-25) |
| 24 Anexos | 24.2 Guardado no banco e no backup | feito | migration `008_anexos_importacao.sql` |
| 25 Importação | 25.1 OFX em BRL com prévia | feito | `servidor/dominio/ofx.js` (RF-26), `frontend/src/app/telas/ImportarOfx.tsx` |
| 25 Importação | 25.2 Nunca duas vezes; aviso de parecido | feito | RF-27, `repositorios/importacao.js` |
| 25 Importação | 25.3 Tudo ou nada | feito | `POST /api/importacao/ofx/confirmar` |
| 25 Importação | 25.4 CSV | falta | ADR 010 |
| 25 Importação | 25.5 Transferência entre contas próprias | falta | ADR 010 |
| 26 Moedas | 26.1 Contas em moeda estrangeira | feito | `servidor/dominio/moeda.js` (RF-28), `frontend/src/app/telas/Moedas.tsx` |
| 26 Moedas | 26.2 Depósito, saque, compra, venda | feito | RF-29 |
| 26 Moedas | 26.3 Cotação à mão | feito | RF-30, `POST /api/moedas/cotacoes` |
| 26 Moedas | 26.4 Sem cotação fora do patrimônio, com aviso | feito | RF-30 |
| 26 Moedas | 26.5 Receita e despesa em moeda estrangeira | falta | ADR 011 |
| 26 Moedas | 26.6 Ganho ou perda cambial | falta | ADR 011 |
| 27 Exportação | 27.1 CSV | feito | `servidor/rotas/exportar.js`, `servidor/dominio/csv.js` |
| 27 Exportação | 27.2 JSON completo | feito | `GET /api/exportar/tudo.json` |
| 27 Exportação | 27.3 Relatório em PDF | falta | nenhum código |
| 28 Backup | 28.1 Backup de uma conta pelo terminal (JSON) | feito | `scripts/backup.js`; o banco em si é copiado pelo Supabase |
| 28 Backup | 28.2 Restauração pelo terminal | feito | `scripts/restaurar.js`, `servidor/banco/repositorios/exportacao.js` |
| 28 Backup | 28.3 Restaurar pela interface | falta | README "O que ainda não tem" |
| 28 Backup | 28.4 Importar o JSON exportado | falta | README "O que ainda não tem" |
| 29 Segurança | 29.1 scrypt com pepper, cookie `__Host-` HttpOnly Secure SameSite=Strict, sessões no banco | feito | `servidor/seguranca/` |
| 29 Segurança | 29.2 CSRF, Origin, bloqueio por usuário e por IP (HMAC) no banco | feito | `servidor/seguranca/origem.js`, `sessao.js`, `tentativas.js` |
| 29 Segurança | 29.3 CSP sem `unsafe-inline` | feito | `servidor/seguranca/cabecalhos.js`, `netlify.toml` (`tests/publicacao.test.js` confere que são iguais) |
| 29 Segurança | 29.4 Redefinir senha pelo terminal | feito | `scripts/redefinir-senha.js` (`npm run redefinir-senha -- <usuario>`) |
| 29 Segurança | 29.5 Trocar senha, encerrar outras sessões, excluir a conta pela interface | feito | `frontend/src/app/telas/Conta.tsx` |
| 30 Privacidade | 30.1 Ocultar valores | feito | `frontend/src/lib/ocultar-valores.tsx` |
| 30 Privacidade | 30.2 Fuso configurável | feito | `servidor/rotas/config.js`, `frontend/src/app/telas/Configuracoes.tsx` |
| 30 Privacidade | 30.3 Tema claro, escuro ou do sistema | feito | `frontend/src/lib/tema.ts`, `frontend/src/components/AlternarTema.tsx` |
| 30 Privacidade | 30.4 Dados protegidos na nuvem do dono (Supabase, bucket privado, RLS sem policies), exportar e excluir tudo | feito | ADR 013, `servidor/rotas/exportar.js`, `/privacidade` e `/termos` (rascunhos para revisão jurídica) |
| 31 Interface | 31.1 Mobile-first, carga por rota | feito | `frontend/src/rotas.tsx` (lazy), `frontend/src/estilos/tailwind.css` |
| 31 Interface | 31.2 Acesso pelo celular (site em HTTPS, instalável) | feito | `netlify.toml`, `frontend/public/manifest.webmanifest`, `docs/deploy-netlify.md` |
| 31 Interface | 31.3 PWA só em contexto seguro | feito | `frontend/src/lib/pwa.ts`, `frontend/public/sw.js` |
| 31 Interface | 31.4 Modo demonstração | feito | `scripts/demo.js`, `servidor/demo/semear.js` |
| 32 Regras e testes | 32.1 RF-01 a RF-30 documentadas | feito | `docs/regras-financeiras.md` |
| 32 Regras e testes | 32.2 Regra vira teste com ID | feito | `tests/rf-*.test.js` |
| 32 Regras e testes | 32.3 Cálculo só em `servidor/dominio/` | feito | `servidor/dominio/` |
| 32 Regras e testes | 32.4 Mensagens em português, iguais no front e no servidor | feito | `contratos/mensagens.js`, `tests/mensagens-zod.test.js` |
| 33 Fora por decisão | 33.1 Multiusuário | feito | decisão revertida pelo ADR 013: várias contas, cada uma isolada |
| 33 Fora por decisão | 33.2 2FA | fora por decisão | ADR 012 |
| 33 Fora por decisão | 33.3 E-mail | fora por decisão | ADR 012 |
| 33 Fora por decisão | 33.4 Push | fora por decisão | ADR 012 |
| 33 Fora por decisão | 33.5 LGPD de serviço (encarregado, canal do titular, registro de tratamento) | fora por decisão | ADR 012; o que a pessoa faz sozinha (exportar, excluir, trocar senha) existe, ver 29.5 e 30.4 |
| 33 Fora por decisão | 33.6 IA | fora por decisão | ADR 012 e ADR 010 |
| 33 Fora por decisão | 33.7 Integração bancária | fora por decisão | ADR 012 e ADR 010 |
| 33 Fora por decisão | 33.8 Cotação automática | fora por decisão | ADR 012 e ADR 010 |
| 34 Qualidade | 34.1 `npm run verify` (lint, typecheck, testes, build, orçamento, segredos no build) | feito | `package.json` |
| 34 Qualidade | 34.2 Docs e ADRs | feito | `docs/`, `docs/adr/` |
| 34 Qualidade | 34.3 Migrations com checksum | feito | `servidor/banco/pg/migrar.js`, `servidor/banco/pg/migrations/` |
| 34 Qualidade | 34.4 Scripts de operação | feito | `scripts/` |
| 34 Qualidade | 34.5 Roteiro de teste no celular | feito | `docs/teste-no-celular.md` |

## Resumo

137 itens: 104 feito, 2 parcial, 24 falta, 7 fora por decisão. Seções sem lacuna (1, 3, 5, 6, 7, 11, 13, 14, 15, 18, 24, 29, 30, 31, 32, 33, 34) não aparecem abaixo.

| Seção | Itens | Parcial | Falta |
|---|---|---|---|
| 2 Categorias | 4 | 0 | 1 |
| 4 Contas | 5 | 0 | 1 |
| 8 Gestão | 8 | 1 | 2 |
| 9 Cartões | 4 | 0 | 1 |
| 10 Compras | 5 | 0 | 1 |
| 12 A pagar/receber | 5 | 0 | 2 |
| 16 Alertas | 3 | 0 | 1 |
| 17 Orçamento | 4 | 0 | 2 |
| 19 Dívidas | 4 | 0 | 2 |
| 20 Assinaturas | 4 | 0 | 1 |
| 21 Investimentos | 4 | 0 | 1 |
| 22 Patrimônio | 3 | 0 | 1 |
| 23 Relatórios | 5 | 1 | 1 |
| 25 Importação | 5 | 0 | 2 |
| 26 Moedas | 6 | 0 | 2 |
| 27 Exportação | 3 | 0 | 1 |
| 28 Backup | 4 | 0 | 2 |
