# Arquitetura

Site estático (build do Vite) e uma API Fastify, publicados no Netlify; dados num Postgres do Supabase e comprovantes num bucket privado do Supabase Storage. Várias contas, cada uma isolada das outras (ADR 013). Em desenvolvimento, o mesmo app roda num processo só (`npm run dev` ou `npm start`), com PGlite no lugar do Supabase.

```
servidor/
  index.js        servidor local (lê .env, migra, escuta só em localhost)
  app.js          monta o Fastify: hooks de Host, Origin, sessão e CSRF; rotas; estáticos (só no servidor local)
  netlify.js      ponte da Function v2 (Request/Response) para app.inject
  config.js       variáveis de ambiente do servidor
  rotas/          uma por módulo, mais saude, sessao (login, cadastro, conta) e config
  dominio/        cálculos financeiros, funções puras
  banco/          abrir (escolhe Postgres ou PGlite), auditoria, config-db, padroes, repositorios/
    pg/           conexao (driver postgres), pglite, escopo, migrar (runner com checksum), tipos, migrations/*.sql
  armazenamento/  Supabase Storage (produção), pasta local e memória (testes)
  seguranca/      senha (scrypt + pepper), sessao, tentativas, origem, cabecalhos
  demo/           dados do usuário "demo"
netlify/functions/  api.mjs (/api/*) e manutencao.mjs (agendada, @daily)
netlify.toml      build, redirecionamentos da SPA, cabeçalhos e CSP dos arquivos estáticos
frontend/         site e app: React, TypeScript estrito, Tailwind, shadcn/ui
  src/landing, publico   páginas públicas (landing, entrar, criar conta, privacidade, termos)
  src/app                casca do tracker, guarda de rota, módulos.ts e telas/
  src/lib, components    sessão, API, tema, PWA, componentes de interface
contratos/        Zod e dinheiro, usados pelo front e pelo servidor
scripts/          setup, dev, demo, criar-usuario, redefinir-senha, backup, restaurar, orçamento de JS, verificar-dist
```

## Requisição

1. Hook `onRequest`: o Host precisa ser o de `SITE_URL` ou estar em `ORIGENS_PERMITIDAS` (421 senão; evita DNS rebinding). Em desenvolvimento local, localhost.
2. Em `/api`, métodos de escrita exigem `Origin` igual ao Host e permitida (403 senão), inclusive o login.
3. Rotas não marcadas `config: { publica: true }` exigem cookie de sessão (401). As únicas públicas são `GET /api/saude`, `GET /api/sessao`, `POST /api/login` e `POST /api/cadastro` (404 com o cadastro fechado); `tests/seguranca-rotas.test.js` confere a lista.
4. Depois da sessão, `request.esc` é o escopo do usuário: o único caminho das rotas até os dados.
5. Escrita autenticada exige `X-CSRF-Token`, derivado por HMAC da sessão com `SEGREDO_SESSAO`.
6. `onSend`: cabeçalhos de segurança; `/api` com `Cache-Control: no-store`. Os arquivos estáticos recebem os mesmos cabeçalhos do `netlify.toml`.

Sem sessão, rota inexistente também devolve 401 (não revela o que existe). Recurso de outra conta responde 404, igual a um que não existe (`tests/isolamento.test.js`).

Na Function, `netlify.js` descarta o `x-forwarded-for` recebido e entrega o IP de `context.ip` como `remoteAddress`: é ele que alimenta o bloqueio de login por IP.

## Sessão e senha

Senha com scrypt sobre `HMAC-SHA256(SENHA_PEPPER, senha)`, na tabela `usuarios` (nome de usuário único sem diferenciar maiúsculas). Sessão: token aleatório no cookie (`__Host-sessao` em HTTPS), só o SHA-256 fica no banco, validade de 14 dias; trocar a senha encerra as outras sessões. Login: 5 erros em 15 minutos bloqueiam por 15 minutos, contados por usuário e por IP (guardado como HMAC com `HMAC_CHAVE_IP`) na tabela `tentativas_login`, porque as funções não compartilham memória. A mensagem é a mesma para usuário inexistente e senha errada.

## Banco

Postgres do Supabase pelo pooler em modo transação, sem prepared statements; PGlite nos testes e no desenvolvimento. Migrations numeradas rodam em transação; `schema_migrations` guarda versão e checksum (migration alterada depois de aplicada é recusada). A Function não roda migrations: quem migra é `npm run setup`. Toda tabela de dados tem `usuario_id NOT NULL`, as chaves estrangeiras entre dados são compostas com ele, e o RLS está ligado sem policies. `bigint` volta como Number e `date` como texto `AAAA-MM-DD` (`banco/pg/tipos.js`). `audit_log` recebe antes/depois de toda escrita, na mesma transação (`banco/auditoria.js`). Excluir a conta apaga tudo por `ON DELETE CASCADE` e depois os comprovantes do Storage.

## Domínio e repositórios

Cálculo financeiro só em `servidor/dominio/` (funções puras: `saldo`, `resumo`, `duplicidade`, `movimentacao`, `datas`). Acesso ao banco em `servidor/banco/repositorios/` (contas, categorias, movimentações): cada escrita e o registro em `audit_log` ficam na mesma transação. As rotas só validam com os contratos Zod e chamam os repositórios. Padrões de categorias em `servidor/banco/padroes.js` (rodam uma vez); dados de demonstração em `servidor/demo/semear.js`.

## Cartões

`dominio/cartao.js` (puro) calcula a fatura de cada compra, as parcelas, os totais e a situação das faturas, o limite e a projeção. `banco/repositorios/cartoes.js` grava (cartão, fatura, compra, parcela, estorno, pagamento), sempre com `audit_log` na mesma transação, e depois de cada mudança confere que nenhuma fatura ficou com pagamento maior que o total. Tabelas na migration `003_cartoes.sql`; o total da fatura e o limite não são colunas. O saldo das contas passa a descontar `pagamentos_fatura`; `/api/resumo` soma as compras no cartão ao realizado e só traz o bloco `cartoes` se existir cartão.

## Compromissos e fluxo

`dominio/compromisso.js` (atraso e totais), `recorrencia.js` (datas), `fluxo.js` (agrupamento, projeção, calendário) e `alertas.js` são puros. `banco/repositorios/recorrencias.js` gera as ocorrências (idempotente: confere o que já existe e o que foi pulado; o índice único da migration `004_compromissos.sql` é a garantia final); `compromissos.js` lista pendentes; `fluxo.js` monta fluxo, projeção, calendário e alertas; a baixa parcial e o reagendamento ficam em `movimentacoes.js`, que já cuida da auditoria dos lançamentos. `rotas/util.js#garantirOcorrencias` é chamado pelas rotas que dependem de compromissos e por `/api/sessao`: não há processo em segundo plano. Atrasada nunca é gravada.

## Investimentos e patrimônio (Fase 3)

`dominio/investimento.js` (valor atual, resultado, totais da carteira) e `patrimonio.js` são puros. `banco/repositorios/investimentos.js` grava investimento, operações (aporte e resgate, com conta opcional) e avaliações (valor informado numa data), sempre com `audit_log` na mesma transação. As operações com conta entram no saldo por `operacoesComoMovimentos`, no mesmo molde dos pagamentos de fatura. `repositorios/patrimonio.js` junta contas, carteira, cartões e dívidas e chama o domínio; `/api/resumo` e `/api/patrimonio` usam o mesmo cálculo.

## Anexos e importação (Fase 4)

`dominio/anexo.js` (tipo pelos bytes, nome seguro) e `dominio/ofx.js` (leitura do extrato) são puros. `rotas/anexos.js` e `rotas/importacao.js` registram um parser de corpo cru (Buffer) só para os tipos de arquivo, dentro do próprio plugin, com `bodyLimit` por rota; a sessão, o Origin e o CSRF valem como em qualquer escrita. `repositorios/anexos.js` grava o registro e o conteúdo na mesma transação com `audit_log`. `repositorios/importacao.js` faz a prévia (sem gravar) e a confirmação, que cria os lançamentos por `criarMovimentacao` (então auditoria, saldo e resumo seguem as regras de sempre) e guarda o FITID.

## Múltiplas moedas (Fase 4)

O BRL segue sendo a base: `movimentacoes`, resumo, orçamento, fluxo e relatórios não mudam. `dominio/moeda.js` (saldo na moeda, conversão em BigInt, cotação vigente, totais) é puro. `banco/repositorios/moedas.js` grava conta em moeda, operações (depósito, saque, compra, venda) e cotações, sempre com `audit_log` na mesma transação (migration `009_moedas.sql`). Compra e venda entram no saldo da conta em reais por `operacoesDeMoedaComoMovimentos`, no mesmo molde dos aportes. `repositorios/patrimonio.js` passa o total das moedas ao `calcularPatrimonio`, que só soma as contas com cotação. `rotas/moedas.js` expõe `/api/moedas`; o `/api/resumo` traz o bloco `moedas` só com saldo. A tela é carregada por rota (lazy).

## Relatórios (Fase 3)

`dominio/relatorio.js` é puro (meses, evolução, período anterior, valores por categoria, ranking). `banco/repositorios/relatorios.js` só lê: reaproveita as consultas do resumo e do orçamento para o realizado ficar idêntico, e `rotas/relatorios.js` valida o período com `contratos/relatorios.js`. Nada é gravado e não há tabela nova. A tela é carregada por rota (lazy) e não usa biblioteca de gráfico: barras são `progress`.

## Planejamento (Fase 2)

`dominio/orcamento.js` (vigência do limite, gasto por categoria principal, situação) e `dominio/meta.js` (acumulado, situação, valor por mês) são puros. `banco/repositorios/orcamentos.js` lê as despesas realizadas e previstas por categoria (mesma base do resumo) e grava o limite com `audit_log`; `metas.js` grava metas e aportes e garante que o acumulado nunca fica negativo. Tabelas na migration `005_planejamento.sql`; gasto, restante, percentual e situação não são colunas. Rotas em `rotas/planejamento.js`; o orçamento alimenta alertas (`dominio/alertas.js`) e o `/api/resumo`, que só traz os blocos `orcamento` e `metas` quando existem.

**Dívidas e assinaturas (Onda 2).** `dominio/divida.js` (parcelas e resumo) e `assinatura.js` (custo e totais) são puros. Uma dívida é uma linha em `dividas` mais N despesas pendentes em `movimentacoes` (`divida_id`, `divida_parcela`), criadas por `inserirMovimentacaoAuditada`; por isso atraso, fluxo, projeção, alertas e orçamento não têm código próprio para dívida e o saldo devedor não é coluna. Assinatura é uma recorrência de despesa com a coluna `assinatura` (migration `006_dividas_assinaturas.sql`); `repositorios/assinaturas.js` pausa e reativa via `atualizarRecorrencia`, que ao reativar marca como puladas as datas passadas sem lançamento. Rotas em `rotas/dividas.js`; o `/api/resumo` traz os blocos `dividas` e `assinaturas` só quando existem.

## Front

Funciona sem service worker. `lib/pwa.ts` só adiciona o manifest e registra o SW (em produção) quando `window.isSecureContext`. O SW (`frontend/public/sw.js`) faz cache do shell e dos assets com hash e ignora `/api`. CSP sem `unsafe-inline`: estilos só pelo Tailwind e por JavaScript, nenhum atributo `style` nem `<style>` no HTML. Rotas: `/` landing, `/entrar`, `/criar-conta` (só com cadastro aberto), `/privacidade`, `/termos` e `/app/*` atrás de `GuardaDeRota`, que manda quem não tem sessão ao login e traz de volta só a caminho interno começando com `/app`. Landing e tracker são chunks separados (orçamento: landing até 120 kB e app inicial até 180 kB, gzip; `scripts/orcamento-js.js`). Celular: barra de baixo e página "Mais"; desktop: menu lateral recolhível, tudo declarado em `app/modulos.ts`. Recharts só é baixado nas telas com gráfico; cada gráfico tem tabela ou resumo equivalente e some com "Valores ocultos" ligado.

## Testes

Servidor: `node:test` em `tests/` sobre PGlite, com um banco por arquivo e uma transação desfeita por teste (`tests/ajuda.js`); reporter `tests/reporter-falhas.js` imprime só falhas. Front: Vitest e Testing Library em `frontend/src/**/*.test.{ts,tsx}`. Dado de teste é sempre fictício. `tests/isolamento.test.js` (usuário B nunca vê nem altera o que é do A), `tests/vazamento-campos.test.js` (nenhum campo interno nas respostas) e `tests/publicacao.test.js` (netlify.toml, PWA e segredos no build) cobrem a parte de segurança da hospedagem.
