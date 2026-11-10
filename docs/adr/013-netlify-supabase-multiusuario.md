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
- O código SQLite (`better-sqlite3`, `servidor/banco/conexao.js`, `servidor/banco/migrar.js`, `servidor/banco/migrations/`, `scripts/iniciar-rede.js`, `scripts/lib/restauracao.js`) saiu na Onda 1, junto com as dependências `better-sqlite3` e `qrcode-terminal`. Só o front legado `web/` sai na Onda 5; até lá o login dele não funciona (a API agora pede `usuario` e `senha`).

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
