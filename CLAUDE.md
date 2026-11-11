# CLAUDE.md

Tracker Financeiro: controle financeiro pessoal na web, hospedado no Netlify com Supabase, várias contas isoladas entre si (ADR 013, que substitui "uma instância = uma pessoa"). Código e interface em português do Brasil, moeda BRL.

## Comandos

`npm run setup` · `dev` · `build` · `start` · `criar-usuario -- <usuario>` · `redefinir-senha -- <usuario>` · `demo` · `backup -- <usuario>` · `restaurar -- <usuario> <arquivo>` · `lint` · `typecheck` · `test` · `orcamento` · `verificar-dist` · `verify` (lint + typecheck + test + build + orcamento + verificar-dist). Detalhes no README.md; publicação em `docs/deploy-netlify.md`.

## Onde ficam as coisas

- Regras financeiras (RF-01 a RF-30): `docs/regras-financeiras.md`. Cada regra vira teste com o ID no nome (`RF-01 ...`).
- Cálculo financeiro: só em `servidor/dominio/`, funções puras. A API devolve indicadores prontos; o front só formata. Nunca duplicar regra em tela.
- Dinheiro: `contratos/dinheiro.js` (parse, format, parcelas). Compartilhado com o front, por isso fora de `servidor/dominio/` (ADR 001).
- Contratos Zod: `contratos/` (JavaScript com `@type {const}` nos enums para o TypeScript inferir). O servidor é a autoridade. Mensagens de validação em português, as mesmas no front e no servidor (`contratos/mensagens.js`).
- Banco: Postgres. Migrations em `servidor/banco/pg/migrations/NNN_nome.sql`; nunca editar uma já aplicada (o runner confere checksum). Toda consulta passa por `criarEscopo(banco, usuarioId)` (`servidor/banco/pg/escopo.js`).
- API: app Fastify (`servidor/app.js`) servido pela função `netlify/functions/api.mjs` (`app.inject`); `netlify/functions/manutencao.mjs` é a função agendada diária. Build, redirecionamentos e cabeçalhos: `netlify.toml`.
- Front: `frontend/` (React, TypeScript estrito, Tailwind, shadcn/ui). Telas do tracker em `frontend/src/app/telas/`; módulo novo = linha em `frontend/src/app/modulos.ts`. Identidade e tokens: `docs/design.md`; contexto de produto: `PRODUCT.md`.
- Escopo: `docs/escopo-completo.md` (34 seções, reconstruído; ADR 012). Status de cada item (feito, parcial, falta, fora por decisão): só em `docs/lacunas.md`. Arquitetura: `docs/arquitetura.md`.

## Decisões (não reabrir)

- Node (`.nvmrc`), Fastify, Postgres no Supabase (driver `postgres`, pooler porta 6543, prepared statements desligados; PGlite nos testes e no desenvolvimento local), JavaScript puro no servidor, Zod. Front: React + Vite + React Router + TanStack Query, mobile-first, Recharts por rota (lazy), React Hook Form com os esquemas de `contratos/`.
- Front sem CSS próprio e sem JavaScript puro: TypeScript, Tailwind (único `.css` é `frontend/src/estilos/tailwind.css`) e componentes shadcn/ui (Radix). Radix `Select` e `Dialog` injetam `<style>` e quebram a CSP: usar `<select>` e `<dialog>` nativos.
- Dinheiro em centavos inteiros (bigint no banco, Number na leitura). Datas sem hora em `AAAA-MM-DD`, lidas como texto; timestamps `timestamptz` em UTC; fuso de exibição configurável (padrão America/Sao_Paulo).
- Saldo é calculado das movimentações liquidadas. Exclusão é lógica. Toda escrita grava em `audit_log` (antes e depois), na mesma transação.
- Várias contas: toda tabela de dados tem `usuario_id NOT NULL`, chaves estrangeiras compostas com ele, RLS ligado sem policies. Recurso de outra conta responde 404, nunca 403.
- Segurança: scrypt com pepper (`SENHA_PEPPER`, nunca trocar com usuários criados), cookie `__Host-` HttpOnly Secure SameSite=Strict (sem `__Host-` e sem Secure só em HTTP local), sessões no banco, CSRF por token + Origin, 5 erros em 15 min por usuário e por IP (HMAC, `HMAC_CHAVE_IP`) no banco, CSP sem `unsafe-inline` (nada de `style=""` nem `<style>` inline; estilo aplicado por JavaScript é permitido). A CSP do `netlify.toml` e a de `servidor/seguranca/cabecalhos.js` têm de ser idênticas (`tests/publicacao.test.js`).
- Segredos só em variáveis de ambiente do servidor: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SEGREDO_SESSAO`, `SENHA_PEPPER`, `HMAC_CHAVE_IP`, `CADASTRO_ABERTO`, `SITE_URL`. Nunca em `VITE_*` nem no bundle (`npm run verificar-dist` confere). Comprovantes num bucket privado do Supabase Storage, acessado só pelo servidor, com download pela API.
- Cadastro público só com `CADASTRO_ABERTO=1`; senão contas nascem por `npm run criar-usuario`. Sem e-mail: senha se redefine por `npm run redefinir-senha`.
- PWA: manifest e service worker só em contexto seguro, cache só do shell, nunca de respostas da API. O app funciona completo sem eles.
- Menu só mostra módulo que funciona. Sem zero falso, dado fictício como real, botão sem efeito.
- As Fases 1 a 4 estão implementadas. O que falta está em `docs/lacunas.md`; o que é "fora por decisão" (2FA, e-mail, push, LGPD de serviço, IA, integração bancária, cotação automática) não entra, sem botão nem menu.

## Modo de trabalho

Plano de até 8 linhas antes de cada onda. Grep antes de Read; edições pequenas; sem subagentes. Não fazer git add/commit/push/stash/reset (quem commita é o dono). Não rodar `netlify deploy`, não criar contas e não usar chaves reais. Saída de testes só com falhas (`tests/reporter-falhas.js`). Ao fim de cada onda: `npm run verify`, relatório de até 10 linhas e parar até "próximo". Divergência do escopo vira ADR em `docs/adr/`. O que não puder ser entregue de verdade fica fora e entra no relatório.

## Fases seguintes

Leia CLAUDE.md, docs/arquitetura.md, docs/regras-financeiras.md e os itens da onda em docs/lacunas.md (situação "falta" ou "parcial") com a seção correspondente de docs/escopo-completo.md. Implemente a onda mantendo as decisões, as regras financeiras e o modo de trabalho do projeto, em ondas de até 4 módulos. Ao fim de cada onda rode `npm run verify` com a suíte inteira, faça um relatório de até 10 linhas e pare até eu digitar "próximo". Cada módulo só entra no menu quando funcionar de verdade e vem com testes das regras financeiras que ele cria. Não mexa no que já existe além do necessário.

Ao terminar uma fase, atualize a seção 'O que faz' e a seção 'O que ainda não tem' do README.md, mexendo só nessas duas.
