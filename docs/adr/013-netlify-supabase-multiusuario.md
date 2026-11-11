# ADR 013: Netlify, Supabase e vários usuários (substitui "uma instância = uma pessoa")

**Contexto.** O Tracker nasceu local: uma instância, uma pessoa, SQLite em `data/`, um processo Node servindo API e front (CLAUDE.md, ADR 012 item 3). O dono decidiu publicar o produto hospedado, com vários usuários, e refazer o front. Este ADR substitui a decisão "uma instância = uma pessoa, dados só na máquina" e, do ADR 012 item 3, tira de "fora por decisão" o **multiusuário** e a **LGPD de serviço** (política, termos, exportar e excluir conta). Continuam fora: 2FA, e-mail, push, IA, integração bancária e cotação automática. As regras financeiras RF-01 a RF-30 não mudam.

## Decisões

**Hospedagem.** Netlify. O front é o build estático do Vite (`frontend/dist`). A API roda em uma Netlify Function (Functions v2) em `/api/*`. O app Fastify existente é reaproveitado dentro da função com `app.inject`, e a instância é criada fora do handler, para valer entre invocações do mesmo processo. A viabilidade é confirmada na Onda 1; se não for viável (corpo cru dos anexos, vários `Set-Cookie`, limite de tempo), o motivo entra aqui antes de trocar de abordagem. Uma função agendada diária faz uma consulta leve para o Supabase gratuito não pausar.

**Banco.** Postgres no Supabase, pelo pooler em modo transação (porta 6543), com prepared statements desligados. Biblioteca: **`postgres` (porsager)**, não `pg`. Motivos: sem módulo nativo, ESM, `prepare: false` é uma opção de primeira classe, e `unsafe(texto, params)` mantém o SQL escrito à mão como hoje. Para testes e desenvolvimento local: **PGlite** (Postgres em WASM, sem Docker). Os dois drivers ficam atrás da mesma interface (`consultar`, `executar`, `transacao`, `fechar`) em `servidor/banco/pg/` e usam os mesmos conversores de tipo.

- Verificado na Onda 0: o driver de produção roda contra o PGlite exposto por socket (`tests/pg-driver.test.js`), passando pelo mesmo caminho da função (sem prepared statements, `sql.begin`, `unsafe`).
- **jsonb:** grava-se `JSON.stringify(x)` com `$n::text::jsonb`. `$n::jsonb` direto faz o `postgres` serializar o texto de novo (string dentro do jsonb); o teste pegou isso.

**Tipos.** Dinheiro e ids em `bigint`, convertidos para `Number` na leitura (erro, nunca arredondamento, se passar de 2^53). `date` volta como texto `AAAA-MM-DD`, nunca `Date`. `timestamptz` volta como ISO em UTC, igual ao que a API já devolvia. `arquivada` e `ativa` viram `boolean`. `audit_log.antes/depois` viram `jsonb`. Testes em `tests/pg-tipos.test.js`.

**Esquema (migrations em `servidor/banco/pg/migrations/`, 001 a 010).** Mesmo mapa das migrations SQLite 001 a 009, com:
- `usuarios` (nome único sem diferenciar maiúsculas, por índice em `lower(nome_usuario)`; hash da senha; coluna `demo`), `sessoes` e `config` por usuário;
- `usuario_id NOT NULL` com `ON DELETE CASCADE` em toda tabela de dados (exceto `usuarios`, `tentativas_login`, `schema_migrations`);
- **chaves estrangeiras compostas** `(usuario_id, x_id) -> (usuario_id, id)` entre dados: apontar para dado de outra pessoa é impossível no banco. `tests/pg-schema.test.js` falha se aparecer chave que não inclua `usuario_id`;
- RLS ligado em todas as tabelas, sem policies, e `REVOKE` para `anon` e `authenticated` quando existirem (migration 010). O servidor conecta como dono (que não passa pelo RLS) e filtra por `usuario_id` em toda consulta. Sem `FORCE`, senão o próprio servidor ficaria sem acesso;
- `tentativas_login` por chave `usuario:<nome>` e `ip:<HMAC>`, no banco, porque funções não compartilham memória;
- `anexos` guarda `caminho_storage` (o arquivo vai para um bucket privado do Supabase Storage); a tabela `anexos_arquivos` deixa de existir;
- a migration 010 do SQLite (reconstruir `contas` e semear categorias) **não tem par**: os tipos de conta já nascem completos na 002 e as categorias padrão passam a ser criadas por usuário, em código, no cadastro. A 010 do Postgres é a de segurança (RLS);
- o runner (`servidor/banco/pg/migrar.js`) é assíncrono, transacional por arquivo, com checksum (com `\r\n` normalizado, para Windows e Linux darem o mesmo valor) e `pg_advisory_xact_lock` para dois processos não migrarem juntos.

**Segurança e contas (Onda 1).** Senha com scrypt e `SENHA_PEPPER`; cookie `__Host-` HttpOnly, Secure, SameSite=Strict (sem `__Host-` e sem Secure só no dev local); sessões no banco; CSRF por token e Origin; 5 senhas erradas bloqueiam por 15 minutos, por usuário e por IP (IP só como HMAC com `HMAC_CHAVE_IP`); mesma mensagem para usuário inexistente e senha errada; recurso de outra conta responde 404, nunca 403. Cadastro só com `CADASTRO_ABERTO=1`; fora disso, `npm run criar-usuario`. Sem e-mail, a senha se redefine por `npm run redefinir-senha -- <usuario>`. Segredos só em variável de ambiente do servidor (nunca `VITE_`).

**Storage.** Acesso só do servidor, com a service key, pela API REST do Storage via `fetch` (sem `@supabase/supabase-js`, que traria muito mais do que um bucket privado precisa). O download passa pela API, que confere o dono. Limites e checagem do tipo pelos bytes continuam.

**contratos/ continua JavaScript.** O servidor roda os contratos direto no Node e o front os importa com `allowJs`; o TypeScript infere os tipos dos formulários a partir dos esquemas Zod. A inferência falhava em um ponto: listas de valores em JS são `string[]`, e todo `z.enum(LISTA)` virava `string`. Corrigido com `/** @type {const} */` nas 16 listas exportadas (sem mudança de execução). `frontend/src/lib/contratos.test.ts` falha se um enum voltar a degradar para `string`. Reavaliar a conversão para `.ts` só se algum contrato inferir `any`.

**Front (`frontend/`, convive com `web/` até a Onda 5).** TypeScript estrito (inclui `noUncheckedIndexedAccess`), Tailwind CSS 4, componentes no estilo shadcn/ui com Radix e `lucide-react`, React Hook Form com os esquemas Zod de `contratos/`, React Router, TanStack Query, Recharts por rota. O único CSS é `src/estilos/tailwind.css` (entrada do Tailwind e tokens do tema); `tests/design-contraste-tailwind.test.js` exige contraste AA nos dois temas, um só arquivo CSS e nenhum `style` inline. Landing e tracker são chunks separados (`src/landing`, `src/app`). A paleta "papel e tinta" foi mantida como provisória; a identidade final é da Onda 2.

**CSP e Radix.** A CSP não tem `unsafe-inline`. `Select` e `Dialog` do Radix injetam elemento de estilo (o `Select` para esconder a barra de rolagem; `Dialog` e menus modais pelo `react-remove-scroll`), que a CSP barra. Decisão: **não usar** Radix `Select` nem `Dialog`; usar `<select>` nativo estilizado (melhor no celular) e `<dialog>` nativo para modais e folhas; menus com `modal={false}`. Os pacotes `@radix-ui/react-select` e `react-dialog` foram instalados e removidos na Onda 0. A verificação no navegador, com a CSP real, é da Onda 5.

**Orçamento de JS.** Landing inicial até 120 kB gzip e app inicial até 180 kB, medidos por rota pelo manifest do Vite (`scripts/orcamento-js.js`). A landing não pode puxar a casca do tracker nem o Recharts. Na Onda 0 a entrada comum tem ~96 kB (React, Router e TanStack Query), o que deixa ~24 kB para a landing; na Onda 2 o TanStack Query pode sair da landing se for preciso.

## Dependências novas (e o motivo)

| Pacote | Onde | Motivo |
| --- | --- | --- |
| `postgres` | produção | driver do Postgres (escolha acima) |
| `@electric-sql/pglite` | dev | Postgres em WASM para testes e desenvolvimento local |
| `@electric-sql/pglite-socket` | dev | expõe o PGlite por socket para testar o driver de produção de verdade |
| `tailwindcss`, `@tailwindcss/vite` | front | estilos |
| `tw-animate-css` | dev (CSS) | animações de entrada e saída que os componentes shadcn usam |
| `class-variance-authority`, `clsx`, `tailwind-merge` | front | variantes de componente e junção de classes (`cn`) |
| `lucide-react` | front | ícones |
| `react-hook-form`, `@hookform/resolvers` | front | formulários com os esquemas Zod de `contratos/` |
| `@radix-ui/react-slot`, `@radix-ui/react-label` | front | `Button asChild` e `Label` |
| `typescript`, `@types/react`, `@types/react-dom`, `@types/node` | dev | TypeScript estrito no front (`npm run typecheck`) |
| `typescript-eslint` | dev | regras de lint para `.ts` e `.tsx` (ver pendência abaixo) |
| `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` | dev | testes do front |

| `@fontsource/big-shoulders-display` | front | fonte dos títulos (Onda 2), hospedada no próprio site: só os pesos 800 e 900 em latim (~14 kB cada em woff2), sem Google Fonts, compatível com a CSP `font-src 'self'` |

Removidas na Onda 1: `better-sqlite3` (o banco agora é Postgres) e `qrcode-terminal` (só servia ao `iniciar:rede`, que saiu). Nenhuma dependência nova na Onda 1.

`npm audit --omit=dev` não aponta nada; os 7 avisos moderados são de desenvolvimento, na cadeia do `typescript-eslint`.

## Consequências e pendências

- **Onda 1 feita:** repositórios e rotas assíncronos, todos sobre o escopo do usuário; a suíte inteira roda em PGlite. Cada arquivo de teste abre um PGlite e migra uma vez; cada teste roda dentro de uma transação desfeita no fim (`tests/ajuda.js`), com `SAVEPOINT` por comando.
- `eslint.config.js` ainda não lê `.ts` e `.tsx` (nem `.mjs`): o hook de proteção de configuração do ambiente impede a edição. Até lá o `tsc` estrito cobre os tipos do front e as funções `.mjs` declaram os globais no próprio arquivo. O trecho a aplicar está no relatório da Onda 0.
- O código SQLite (`better-sqlite3`, `servidor/banco/conexao.js`, `servidor/banco/migrar.js`, `servidor/banco/migrations/`, `scripts/iniciar-rede.js`, `scripts/lib/restauracao.js`) saiu na Onda 1, junto com as dependências `better-sqlite3` e `qrcode-terminal`. O front legado `web/` saiu na Onda 5.

## Onda 1: decisões e limites

- **`app.inject` na função: viável.** O corpo cru dos anexos e do OFX passa como `Buffer`; vários `Set-Cookie` voltam como cabeçalhos separados; o IP vem de `context.ip` e o `x-forwarded-for` recebido é descartado (`tests/netlify-funcao.test.js`). A função não roda migrations: quem migra é `npm run setup`, contra o banco da hospedagem. **Limite real:** função síncrona do Netlify aceita requisição e resposta de ~6 MB. Comprovantes de até 5 MB cabem (o corpo vai cru, sem base64), mas com pouca folga; o limite de 5 MB do produto não deve subir.
- **Escopo do usuário.** Toda consulta passa por `criarEscopo(banco, usuarioId)` (`servidor/banco/pg/escopo.js`), com `usuario_id = :u` no SQL. O manipulador de erros trata `23503` (chave estrangeira) como 404 e `23505` como 409, como rede de proteção das chaves compostas. Id de outra conta em campo do corpo vira o mesmo erro de campo (400, "não encontrada") de um id que não existe; em caminho de URL, 404. `tests/isolamento.test.js` compara, rota a rota, o pedido com id alheio e com id inexistente (a resposta tem de ser idêntica) e exige que toda rota com `:id` esteja na tabela.
- **Bloqueio de login.** Janela de 15 minutos; o 5º erro bloqueia por 15 minutos e responde 429 com `Retry-After`. Conta por usuário e por IP. Acertar a senha zera só a chave do usuário (a do IP segue contando). Trocar a senha com a atual errada conta como erro de login.
- **Senha.** scrypt sobre `HMAC-SHA256(pepper, senha)`. Para usuário inexistente se compara contra um hash falso, para o tempo não revelar quem existe. Trocar a senha encerra as outras sessões; `redefinir-senha` encerra todas e limpa o bloqueio.
- **Excluir a conta** exige digitar o nome de usuário **e** a senha (mais estrito que o pedido, que só pedia a exclusão). Apaga tudo por `ON DELETE CASCADE` e depois os comprovantes do Storage; se o Storage falhar, a conta já foi apagada e os caminhos órfãos são devolvidos.
- **Comprovantes.** Sobe-se o arquivo primeiro e grava-se o registro depois, apagando o objeto se o banco falhar. Remover apaga o registro (lógico) primeiro e o objeto depois, sem falhar se o Storage estiver fora. Local: `data/anexos`. Testes: memória.
- **Backup e restauração (um usuário, JSON).** `npm run backup -- <usuario>` leva os dados e os comprovantes em base64; `npm run restaurar -- <usuario> <arquivo> [--sim]` substitui os dados do usuário numa transação, depois de guardar um backup do estado atual. Exige a **mesma versão de esquema**. Os ids originais são mantidos: restaurar no mesmo banco é seguro; restaurar em **outro** banco, se algum id já existir, desfaz tudo e avisa. Achado pelo teste: a ordem das tabelas da cópia tinha `movimentacoes` antes de `recorrencias` e `dividas`, que ela referencia; a ordem foi corrigida.
- **O índice `idx_mov_valor` do SQLite não foi levado:** toda consulta filtra antes por `usuario_id`, e os demais índices já começam por ele.
- **Demonstração.** `npm run demo` sobe sempre um PGlite local próprio (`data/pglite-demo`, porta 3100), nunca o banco configurado; o usuário `demo` é o único com a faixa de dados de demonstração.
- **Cadastro** sem limite de taxa: mantenha `CADASTRO_ABERTO=0` fora de um período de convites.

## Onda 2: identidade, páginas públicas e casca

- **Identidade final: "letreiro de feira"** (amarelo-feira, tinta, tomate e folha; fonte Big Shoulders Display). Tokens e regras em `docs/design.md`. Escolhida pelo sorteio de direções da skill impeccable, sem página de decisão nem subagentes (pedido de seguir sem esperar; CLAUDE.md proíbe subagentes). O contexto de produto inferido está em `PRODUCT.md` e o contrato da direção em `.impeccable/surfaces/`.
- **Rotas:** `/` landing, `/entrar`, `/criar-conta` (volta para `/` com o cadastro fechado), `/privacidade`, `/termos` (rascunho para revisão jurídica, com campos entre colchetes a preencher por quem publica) e `/app/*` atrás de `GuardaDeRota`. A guarda fica na entrada do site, não no chunk da casca: quem não tem sessão vai ao login sem baixar o tracker. Cada página pública é um chunk próprio.
- **Redirecionamento pós-login** (`lib/redirecionamento.ts`): só vale caminho que, resolvido contra uma origem fictícia, continua nela e cai em `/app` ou `/app/...`. Recusa esquema, `//`, barra invertida, caracteres de controle e `..` que saia de `/app`.
- **Sessão no front** (`lib/sessao.tsx`): `GET /api/sessao` pelo TanStack Query, token CSRF guardado em memória, cache limpo ao sair. A resposta é checada à mão e o tipo vem do contrato (`import type`): validar com o Zod puxaria ~35 kB para a landing e estouraria o orçamento de 120 kB.
- **Menu:** `app/modulos.ts` é a lista única de menu, barra inferior e rotas; módulo só entra quando a tela funciona. Na Onda 2 só existe "Início" (tela provisória). O botão "Novo lançamento", o ocultar valores e o item "Mais" da barra inferior entram com as telas da Onda 3, porque hoje não teriam efeito.
- **Orçamento de JS:** landing inicial 108 kB de 120; app inicial 108 kB de 180.
- **Pendência de ambiente (da Onda 0, ainda aberta):** o ESLint não lê `.ts`/`.tsx` por causa do hook que protege `eslint.config.js`; o `tsc` estrito cobre os tipos.

## Onda 3: telas de uso diário

- **Telas:** Início, Lançamentos (lista com filtros na URL, formulário, histórico), Compromissos, Recorrências, Fluxo de caixa (realizado, projeção, calendário), Contas, Categorias, Cartões (lista, detalhe, compra, fatura) e Alertas. Cada uma é um chunk lazy registrado em `app/modulos.ts`; `subrotas` guarda formulários e detalhes, que não aparecem no menu.
- **Sem regra no front:** a API devolve totais, saldos, limites, séries e situações prontos; as telas só formatam. O formulário de lançamento valida com `esquemaMovimentacao` (contrato compartilhado, mesmas mensagens) e o servidor continua sendo a autoridade.
- **Casca:** ocultar valores (`ProvedorOcultarValores`), sino de alertas com selo, atalho "Novo lançamento" e página "Mais".
- **Links honestos:** o Início só mostra um bloco quando há dado e o módulo existe; `destinoExiste` tira o "Ver" de alertas que apontam para telas da Onda 4. Quando o módulo entrar em `MODULOS`, o bloco e o link aparecem sozinhos.
- **Fica para a Onda 4:** Comprovantes (ação por lançamento), marca de assinatura no formulário de recorrência (hoje só se preserva o valor gravado) e os módulos de planejamento e patrimônio.
- **Orçamento de JS:** landing 109,5 kB de 120; app inicial 112,6 kB de 180. Recharts fica fora do pacote inicial.
- **Testes de front novos (13 + 4 + 3):** máscara de dinheiro (`CampoValor`), formulário de lançamento, casca (atalho, sino, ocultar valores, barra) e registro de módulos.

## Onda 4: planejamento, patrimônio e conta

- **Telas:** Orçamento, Metas, Dívidas (lista, nova, detalhe com parcelas), Assinaturas, Investimentos, Moedas (contas, operações, cotações), Patrimônio, Relatórios, Importar extrato (OFX, prévia antes de criar), Comprovantes (ação por lançamento, `/app/lancamentos/:id/anexos`), Conta e Configurações. Todas lazy e registradas em `app/modulos.ts`; nenhuma entra na barra inferior (ficam em "Mais" e no menu lateral).
- **Conta substitui o "Config." do legado:** trocar senha, encerrar as outras sessões, exportar (CSV e JSON), excluir a conta (digitar o nome de usuário e a senha; o botão só habilita com o usuário exato) e Sair. Configurações ficou só com o fuso. Os formulários validam com `esquemaTrocaSenha` e `esquemaExclusaoConta` de `contratos/sessao.js`.
- **Sem regra no front:** totais, percentuais, situações (estourado, atrasada, concluída), custo mensal e anual de assinatura, patrimônio e rentabilidade vêm prontos da API. O front só formata. Investimento sem valor informado não mostra resultado; Patrimônio só mostra o que o servidor devolve (sem zero falso).
- **Assinatura:** o formulário de recorrência ganhou a marca "É uma assinatura" (só para despesa). Vindo de "Nova assinatura" (`?assinatura=1`) ela já vem marcada e o salvar volta para Assinaturas.
- **Medidor:** `<progress>` com a classe `.medidor` (em `tailwind.css`) e a cor vinda de `text-*`. `accent-color` não pintava a barra estourada de vermelho no Chromium, então a cor passou a ser da `color` do elemento. Sem `style=""`.
- **Relatórios:** a evolução mês a mês reaproveita o `GraficoFluxo` (Recharts, lazy) e traz a tabela com os mesmos números.
- **Comprovantes:** o arquivo vai cru no corpo (`enviarArquivo`), até 5 MB e 10 por lançamento; a imagem abre pelo endereço da API com a sessão (o Storage é privado).
- **Fora desta onda (Onda 5):** `netlify.toml`, guia de deploy, revisão de segurança, remoção de `web/` e dos restos de SQLite, README, manifest e service worker.
- **Testes de front novos:** conta (excluir, trocar senha, outras sessões), formulário de recorrência/assinatura, investimentos, patrimônio e registro de módulos.

## Onda 5: publicação, revisão de segurança e limpeza

- **`netlify.toml`:** build (`npm run build`), publish `frontend/dist`, funções em `netlify/functions`, Node 22. A SPA devolve o `index.html` só para as rotas que ela tem (`/entrar`, `/criar-conta`, `/privacidade`, `/termos`, `/app`, `/app/*`), em vez de um `/*` genérico: `/api` não depende da ordem em que o Netlify avalia função e redirecionamento (a função declara `path: '/api/*'`), e caminho desconhecido recebe 404. `tests/publicacao.test.js` exige que toda rota pública de `rotas.tsx` esteja na lista, que nenhuma regra alcance `/api` e que a CSP e os cabeçalhos do `netlify.toml` sejam idênticos aos de `servidor/seguranca/cabecalhos.js`. **Não testado:** o comportamento real no Netlify (não há deploy nesta etapa); o roteiro de conferência está em `docs/deploy-netlify.md`.
- **PWA:** `frontend/public/manifest.webmanifest` (abre em `/app`, tema amarelo-feira), `frontend/public/sw.js` (cache só do shell e dos arquivos com hash; a API e qualquer escrita ficam de fora) e `lib/pwa.ts`, que só adiciona o manifest e registra o SW em contexto seguro e em produção. Ícones regenerados na identidade nova (`scripts/gerar-icones.js`, que agora grava em `frontend/public`). `index.html` ganhou `mobile-web-app-capable`.
- **Revisão de segurança, sem achado a corrigir:** (1) rotas sem autenticação: só `GET /api/saude`, `GET /api/sessao`, `POST /api/login` e `POST /api/cadastro` (404 com o cadastro fechado), por `tests/seguranca-rotas.test.js`. (2) campos internos: `tests/vazamento-campos.test.js` lê, com a conta de demonstração (dado em todos os módulos), toda rota de leitura sem parâmetro e o login, e recusa `usuario_id`, hash, token, IP, `caminho_storage` e afins em qualquer nível do JSON; a exportação e o backup já removiam `usuario_id` e `caminho_storage`. (3) segredos no bundle: `scripts/verificar-dist.js` (agora dentro do `npm run verify`, depois do build) procura nos arquivos de `frontend/dist` os nomes das variáveis do servidor, `VITE_*`, `service_role`, chaves no formato JWT, endereços de Postgres e os valores reais do ambiente ou do `.env`; o build atual está limpo. Um falso positivo inicial (`__vite__mapDeps`, do próprio Vite) levou a procurar só `VITE_` em maiúsculas.
- **Removido:** `web/` inteiro (front antigo), o script `build:legado`, a parte do orçamento de JS que media o `web/dist` e os testes dela, `tests/design-contraste.test.js` (lia os tokens de `web/`; o equivalente do front novo é `tests/design-contraste-tailwind.test.js`) e `docs/acesso-celular.md` (Tailscale e rede local não existem mais). Os dois testes que varriam `web/src` (CSP do código e mensagens do Zod) passaram a varrer `frontend/src` em `.ts` e `.tsx`. `.gitignore` e `.npmrc` perderam as menções ao SQLite.
- **Documentação:** `docs/deploy-netlify.md` reescrito com a ordem Supabase, `.env` e tabelas, primeira conta, site, `SITE_URL`, conferência e tabela de problemas; README, CLAUDE.md, `docs/arquitetura.md`, `docs/lacunas.md` (caminhos novos, 29.5, 30.3, 31.2, 33.1 e 33.5 reclassificados, resumo recalculado) e `docs/teste-no-celular.md` atualizados. Nenhuma dependência nova nesta onda.
- **Pendências para o dono:** (a) `eslint.config.js` ainda tem entradas de `web/` (inertes: o `lint` já ignora `frontend/dist`) e não lê `.ts`/`.tsx`; o hook de proteção do ambiente bloqueia a edição. (b) O cadastro público (`CADASTRO_ABERTO=1`) segue sem limite de taxa nem e-mail. (c) Privacidade e Termos são rascunhos para revisão jurídica. (d) A precedência função/redirecionamento e o agendamento da função de manutenção só se confirmam no Netlify.

## Correção pós-Onda 5: a função caía com 502 no Netlify

- **Sintoma:** toda requisição a `/api/*` respondia 502 ("This function has crashed"), com `require() of ES Module .../content-disposition/dist/index.js from .../@fastify/static/index.js not supported`. O Node 24 local aceita `require()` de ESM; o runtime da função no Netlify, não.
- **Causa 1:** `servidor/app.js` importava `@fastify/static` de forma estática, e ele faz `require` de pacote só ESM. A função nunca serve o front, mas o pacote era carregado do mesmo jeito. **Correção:** `import()` dinâmico, só quando o app serve o front (servidor local e `npm start`); nenhuma rota mudou.
- **Causa 2, achada pelo teste e que só se manifestaria na primeira requisição:** `light-my-request` 6.8.0 (o `app.inject` do Fastify, que a função usa) faz `require('cookie')`, e o `cookie@2` é só ESM. **Correção:** `overrides` no `package.json` fixa `light-my-request` em `6.6.0`, que usa `cookie@1` (CommonJS). O `@fastify/cookie` não precisou de ajuste: ele carrega o `cookie` por `import()`. Dependência alterada, motivo: compatibilidade com o runtime das funções; reavaliar quando o Fastify trouxer uma versão sem esse `require`.
- **Teste:** `tests/funcao-runtime.test.js` (no `npm run verify`) carrega `api.mjs` e `manutencao.mjs` com `node --no-experimental-require-module`, o modo do runtime, e faz requisições de verdade pelo handler (`/api/sessao` 200, rota sem sessão 401, login com corpo vazio 400, `/api/saude` 503 sem banco). Um `require()` de ESM no caminho derruba o teste antes do deploy. Um segundo teste confere que `app.js` não tem import estático do `@fastify/static`.
- **Versão de Node:** o runtime das funções segue o `NODE_VERSION` do build, já `22` no `netlify.toml`. A variável `AWS_LAMBDA_JS_RUNTIME` (que fixa só o runtime) não pode ficar no `netlify.toml`, só no painel, CLI ou API do Netlify; não é necessária. O teste não depende da versão exata do Node: desliga o `require()` de ESM, o caso mais restritivo.
- **Não testado:** o deploy real. Os testes reproduzem a restrição, mas só um deploy confirma.

