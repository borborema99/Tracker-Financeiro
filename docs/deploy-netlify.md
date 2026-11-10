# Publicar no Netlify com Supabase

Passo a passo para colocar o Tracker Financeiro no ar. Quem executa é o dono: o código não cria conta, não faz deploy e
não usa chave real. Decisões em `docs/adr/013-netlify-supabase-multiusuario.md`.

> **Estado (fim da Onda 1):** o servidor (API em função, banco, contas, comprovantes, manutenção) está pronto. O front
> novo e o `netlify.toml` (build, redirecionamentos, cabeçalhos e CSP) chegam na Onda 5; **o deploy completo só vale depois
> dela**. Os passos 1 a 4 já podem ser feitos agora, e o passo 5 é testável localmente.

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

No Netlify: *Site configuration > Environment variables*, marcando as secretas como *Contains secret values*. Para rodar
os scripts no seu computador, as mesmas variáveis ficam no `.env` (que o git ignora). `npm run setup` cria o `.env` e gera
os três segredos.

| Variável | Para quê |
| --- | --- |
| `DATABASE_URL` | Postgres do Supabase, pooler porta 6543 |
| `SUPABASE_URL` | endereço do projeto (Storage) |
| `SUPABASE_SERVICE_KEY` | chave de serviço, só no servidor |
| `SEGREDO_SESSAO` | assina o token CSRF |
| `SENHA_PEPPER` | tempero das senhas. **Não troque depois de criar usuários** (todas as senhas deixariam de valer). Guarde uma cópia |
| `HMAC_CHAVE_IP` | o IP de quem erra a senha é guardado só como HMAC com esta chave |
| `CADASTRO_ABERTO` | `1` abre o cadastro público. Qualquer outro valor: `/api/cadastro` responde 404 |
| `SITE_URL` | endereço público, sem barra no final (ex.: `https://meu-tracker.netlify.app`) |
| `ORIGENS_PERMITIDAS` | opcional: domínios extras, separados por vírgula |

A função recusa subir (503) se faltar `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` ou `SITE_URL`, ou um dos três
segredos. O motivo aparece no log da função, sem valores.

## 3. Criar as tabelas

No seu computador, com o `.env` apontando para o Supabase:

```
npm run setup
```

Gera os segredos que faltam (sem sobrescrever os que existem) e aplica as migrations no banco configurado. A função
**não** roda migrations: repita `npm run setup` a cada versão que traga migration nova, **antes** de publicar o código.

## 4. Primeira conta

Com `CADASTRO_ABERTO` fechado (recomendado), crie cada conta pelo terminal. A senha é pedida sem eco:

```
npm run criar-usuario -- seu-nome
```

Esqueceu a senha? Não há e-mail. Redefina por aqui (isso também encerra as sessões e limpa o bloqueio):

```
npm run redefinir-senha -- seu-nome
```

## 5. Funções

- `netlify/functions/api.mjs`: a API inteira em `/api/*` (o app Fastify roda por `app.inject`, criado uma vez por
  processo). Limite do Netlify: corpo de ~6 MB por requisição e resposta. Por isso os comprovantes têm no máximo 5 MB.
- `netlify/functions/manutencao.mjs`: função agendada (`@daily`). Faz `SELECT 1` (o Supabase gratuito pausa bancos sem
  uso) e apaga sessões vencidas e contagens antigas de tentativas de login.

Teste local sem Supabase: `npm run dev` usa um PGlite em `data/pglite` e os comprovantes ficam em `data/anexos`.
`npm run demo` abre uma demonstração isolada (usuário `demo`).

## 6. Backup e restauração

Backup de **uma** conta, em JSON, com os comprovantes dentro (guarde fora do computador e não compartilhe):

```
npm run backup -- seu-nome
npm run restaurar -- seu-nome backups/seu-nome-2026-01-01_120000.json --sim
```

A restauração guarda antes um backup do estado atual e substitui os dados da conta numa transação. Exige a mesma versão
de esquema do backup. Restaurar em **outro** banco só funciona se nenhum id do backup já existir lá; se houver, tudo é
desfeito e o script avisa.

## 7. Conferência depois do deploy

1. `https://<seu-site>/api/saude` responde `{"ok":true}`.
2. Entre com a conta criada; o cookie é `__Host-sessao`, Secure, HttpOnly e SameSite=Strict.
3. Anexe um comprovante e abra-o: o link passa pela API (o bucket é privado e não tem URL pública).
4. No painel do Supabase, confirme que `comprovantes` está **privado**.
5. Em *Functions*, veja que `manutencao` aparece como agendada.
