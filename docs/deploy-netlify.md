# Publicar no Netlify com Supabase

Passo a passo para colocar o Tracker Financeiro no ar, na sua própria conta. Quem executa é você: o código não cria
conta, não faz deploy e não usa chave real. Decisões em `docs/adr/013-netlify-supabase-multiusuario.md`.

Visão geral: o **front** é o build estático do Vite (`frontend/dist`); a **API** é uma Netlify Function em `/api/*`; os
**dados** ficam num Postgres do Supabase e os **comprovantes** num bucket privado do Supabase Storage. Tudo o que o
Netlify precisa saber do build está no `netlify.toml` (você não digita comando nem pasta no painel).

Ordem que evita idas e vindas: Supabase (1) → `.env` local e tabelas (2 e 3) → primeira conta (4) → site no Netlify (5)
→ `SITE_URL` e deploy (6) → conferência (7).

## 1. Supabase

1. Crie um projeto (região mais perto de você). Guarde a senha do banco.
2. **Banco.** Em *Connect*, copie a string do **pooler em modo transação** (porta **6543**). Ela vai em `DATABASE_URL`.
   O app desliga os prepared statements, que o modo transação não aceita.
3. **Storage.** Em *Storage*, crie o bucket **`comprovantes`** e deixe-o **privado** (desmarque "Public bucket"). O nome
   precisa ser exatamente esse. Não crie policy: só o servidor acessa o bucket, com a service key.
4. **Chaves.** Em *Project Settings > API*, copie a *Project URL* (`SUPABASE_URL`) e a chave **`service_role`**
   (`SUPABASE_SERVICE_KEY`). Essa chave tem poder total sobre o projeto: ela só entra como variável de ambiente do
   servidor. Nunca no código, nunca em variável com prefixo `VITE_`, nunca no navegador.
5. O RLS fica ligado em todas as tabelas, sem policies, por uma migration. Você não precisa configurar nada.

## 2. Variáveis de ambiente

| Variável | Para quê |
| --- | --- |
| `DATABASE_URL` | Postgres do Supabase, pooler porta 6543 |
| `SUPABASE_URL` | endereço do projeto (Storage) |
| `SUPABASE_SERVICE_KEY` | chave de serviço, só no servidor |
| `SEGREDO_SESSAO` | assina o token CSRF (gerado pelo `npm run setup`) |
| `SENHA_PEPPER` | tempero das senhas, gerado pelo `npm run setup`. **Não troque depois de criar usuários** (todas as senhas deixariam de valer). Guarde uma cópia |
| `HMAC_CHAVE_IP` | o IP de quem erra a senha é guardado só como HMAC com esta chave (gerado pelo `npm run setup`) |
| `CADASTRO_ABERTO` | `1` abre o cadastro público (tela "Criar conta"). Qualquer outro valor: `/api/cadastro` responde 404 |
| `SITE_URL` | endereço público, sem barra no final (ex.: `https://meu-tracker.netlify.app`) |
| `ORIGENS_PERMITIDAS` | opcional: domínios extras, separados por vírgula (domínio próprio) |

No seu computador, as variáveis ficam no `.env` (que o git ignora): copie `.env.example` para `.env` e preencha
`DATABASE_URL`, `SUPABASE_URL` e `SUPABASE_SERVICE_KEY`. Os três segredos você deixa vazios: o passo 3 os gera.

No Netlify elas entram em *Site configuration > Environment variables* (passo 5), marcando as secretas como *Contains
secret values*. A função recusa subir (503) se faltar `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` ou
`SITE_URL`, ou um dos três segredos. O motivo aparece no log da função, sem valores.

## 3. Criar as tabelas (no seu computador)

```
npm install
npm run setup
```

Gera os segredos que faltam no `.env` (sem sobrescrever os que existem) e aplica as migrations no banco do
`DATABASE_URL`. A função **não** roda migrations: repita `npm run setup` a cada versão que traga migration nova,
**antes** de publicar o código. Depois abra o `.env`, copie os valores de `SEGREDO_SESSAO`, `SENHA_PEPPER` e
`HMAC_CHAVE_IP` para um lugar seguro (você vai colá-los no Netlify) e guarde uma cópia do `SENHA_PEPPER`.

## 4. Primeira conta

Com `CADASTRO_ABERTO` fechado (recomendado), crie cada conta pelo terminal, com o `.env` apontando para o Supabase. A
senha é pedida sem eco (mínimo de caracteres definido pelo contrato):

```
npm run criar-usuario -- seu-nome
```

Esqueceu a senha? Não há e-mail. Redefina por aqui (isso também encerra as sessões e limpa o bloqueio de login):

```
npm run redefinir-senha -- seu-nome
```

A tela de login diz isso em uma linha. Se quiser que outras pessoas criem conta sozinhas, use `CADASTRO_ABERTO=1` só
durante o período de convites: o cadastro não tem limite de taxa.

## 5. Site no Netlify

1. Suba o repositório para o GitHub (a branch que você quer publicar).
2. No Netlify: *Add new site > Import an existing project*, escolha o GitHub, o repositório e a branch. O `netlify.toml`
   já define `npm run build`, a pasta `frontend/dist`, as funções em `netlify/functions` e o Node 22. Não preencha nada
   nesses campos.
3. Antes de publicar, em *Site configuration > Environment variables*, cadastre: `DATABASE_URL`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_KEY`, `SEGREDO_SESSAO`, `SENHA_PEPPER`, `HMAC_CHAVE_IP`, `CADASTRO_ABERTO` (`0` ou `1`). Marque as
   secretas como *Contains secret values*.
4. Faça o primeiro deploy. O site abre, mas a API responde 503 até você cadastrar `SITE_URL` (passo 6): o endereço do
   site só existe depois de criado.

## 6. `SITE_URL` e novo deploy

1. Copie o endereço do site (algo como `https://nome-aleatorio.netlify.app`; em *Site configuration > Change site name*
   você escolhe um nome melhor antes de usar).
2. Cadastre `SITE_URL` com esse endereço, **sem barra no final**.
3. *Deploys > Trigger deploy > Deploy site*. Com domínio próprio, troque o `SITE_URL` por ele ou acrescente-o em
   `ORIGENS_PERMITIDAS`; sem isso a API responde 421 (host não permitido) ou 403 (origem não permitida).

## 7. Conferência depois do deploy

1. `https://<seu-site>/api/saude` responde `{"ok":true}`.
2. `https://<seu-site>/` mostra a página inicial e `/entrar` abre o login. Um endereço que não existe dá 404.
3. Entre com a conta criada; o cookie é `__Host-sessao`, Secure, HttpOnly e SameSite=Strict (aba *Application* do
   navegador). Abrir `/app/lancamentos` sem sessão leva ao login e, depois de entrar, de volta a Lançamentos.
4. Anexe um comprovante e abra-o: o link passa pela API (o bucket é privado e não tem URL pública).
5. No painel do Supabase, confirme que `comprovantes` está **privado**.
6. Em *Functions*, veja que `manutencao` aparece como agendada (`@daily`). Funções agendadas só rodam no deploy de
   produção publicado.
7. Celular: abra o site, use *Instalar app* / *Adicionar à tela inicial* (o site é HTTPS, então funciona). O roteiro
   completo está em `docs/teste-no-celular.md`.

## Se algo falhar

| Sintoma | Causa provável |
| --- | --- |
| 503 "Serviço indisponível" na API | falta variável de ambiente; o log da função (*Logs > Functions*) lista os nomes |
| 421 "Host não permitido" ou 403 "Origem não permitida" | `SITE_URL` diferente do endereço usado (com ou sem `www`, `http`, barra no final) |
| Login sempre recusado, em conta que existia | `SENHA_PEPPER` do Netlify diferente do usado em `criar-usuario` |
| Login responde 429 | 5 erros em 15 minutos; espere ou rode `npm run redefinir-senha -- <usuario>` |
| Erro de conexão com o banco | `DATABASE_URL` não é a do pooler (porta 6543) ou a senha tem caractere especial sem codificar |
| API responde 502 "This function has crashed" | pacote que faz `require()` de módulo só ESM no runtime da função; `npm run verify` testa isso (`tests/funcao-runtime.test.js`). Veja o ADR 013 |
| Comprovante não sobe | bucket com outro nome ou `SUPABASE_SERVICE_KEY` errada; limite de 5 MB por arquivo |

## Funções e limites

- `netlify/functions/api.mjs`: a API inteira em `/api/*` (o app Fastify roda por `app.inject`, criado uma vez por
  processo). Limite do Netlify: corpo de ~6 MB por requisição e resposta. Por isso os comprovantes têm no máximo 5 MB.
- `netlify/functions/manutencao.mjs`: função agendada (`@daily`). Faz `SELECT 1` (o Supabase gratuito pausa bancos sem
  uso) e apaga sessões vencidas e contagens antigas de tentativas de login.
- Rotas do front: `/entrar`, `/criar-conta`, `/privacidade`, `/termos` e `/app/*` voltam o `index.html` (regras no
  `netlify.toml`). `/api/*` pertence à função e nunca passa pelo `index.html`.

## Backup e restauração

O Supabase cuida do banco. Para ter uma cópia sua, de **uma** conta, em JSON, com os comprovantes dentro (guarde fora do
computador e não compartilhe):

```
npm run backup -- seu-nome
npm run restaurar -- seu-nome backups/seu-nome-2026-01-01_120000.json --sim
```

A restauração guarda antes um backup do estado atual e substitui os dados da conta numa transação. Exige a mesma versão
de esquema do backup. Restaurar em **outro** banco só funciona se nenhum id do backup já existir lá; se houver, tudo é
desfeito e o script avisa.

## Desenvolvimento local, sem Supabase

`npm run dev` usa um PGlite (Postgres em WASM) em `data/pglite` e os comprovantes ficam em `data/anexos`, se
`DATABASE_URL` e `SUPABASE_*` estiverem vazios. `npm run demo` abre uma demonstração isolada (usuário `demo`, senha
`demonstracao`) num banco próprio, nunca no `DATABASE_URL`.

## Antes de divulgar o endereço

- Rode `npm run verify`: além de lint, tipos, testes e orçamento de JavaScript, ele procura segredos e nomes de variável
  do servidor dentro de `frontend/dist`.
- As páginas `/privacidade` e `/termos` são **rascunhos**: preencha os campos entre colchetes e peça revisão jurídica
  antes de abrir o cadastro a outras pessoas.
