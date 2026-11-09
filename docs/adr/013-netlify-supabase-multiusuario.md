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

`npm audit --omit=dev` não aponta nada; os 7 avisos moderados são de desenvolvimento, na cadeia do `typescript-eslint`.

## Consequências e pendências

- **Os testes atuais seguem em SQLite até a Onda 1.** Trocar a camada de dados exige repositórios assíncronos; fazer isso fora da Onda 1 deixaria a suíte quebrada no meio. Na Onda 0 entraram a base de testes em PGlite (`tests/pg-ajuda.js`) e os testes do esquema, do runner, dos tipos e do driver. Na Onda 1 os repositórios viram assíncronos e os testes `rf-*` e de API passam a rodar em PGlite; a contagem só pode subir.
- Cada teste que abre um PGlite e migra leva cerca de 1,7 s. Na Onda 1, abrir um banco migrado por arquivo de teste (e limpar entre testes), em vez de um por teste.
- `eslint.config.js` ainda não lê `.ts` e `.tsx`: o hook de proteção de configuração do ambiente impediu a edição. Até lá o `tsc` estrito cobre os tipos, e o `lint` ignora `frontend/dist/` pelo script. O trecho a aplicar está no relatório da Onda 0.
- O código SQLite (`better-sqlite3`, `servidor/banco/migrations/`, `web/`) sai na Onda 5.
