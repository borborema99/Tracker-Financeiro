# CLAUDE.md

Tracker Financeiro: controle financeiro pessoal local, uma instância = uma pessoa. Código e interface em português do Brasil, moeda BRL.

## Comandos

`npm run setup` · `dev` · `build` · `start` · `iniciar:rede` · `demo` · `backup` · `restaurar` · `redefinir-senha` · `lint` · `test` · `orcamento` · `verify` (lint + test + build + orcamento). Detalhes no README.md.

## Onde ficam as coisas

- Regras financeiras (RF-01 a RF-10): `docs/regras-financeiras.md`. Cada regra vira teste com o ID no nome (`RF-01 ...`).
- Cálculo financeiro: só em `servidor/dominio/`, funções puras. A API devolve indicadores prontos; o front só formata. Nunca duplicar regra em tela.
- Dinheiro: `contratos/dinheiro.js` (parse, format, parcelas). Compartilhado com o front, por isso fora de `servidor/dominio/` (ADR 001).
- Contratos Zod: `contratos/`. O servidor é a autoridade.
- Migrations: `servidor/banco/migrations/NNN_nome.sql`. Nunca editar uma já aplicada (o runner confere checksum).
- Escopo: `docs/escopo-completo.md` (hoje provisório, ver ADR 002). Arquitetura: `docs/arquitetura.md`.

## Decisões (não reabrir)

- Node (`.nvmrc`), Fastify, SQLite com better-sqlite3 (WAL, foreign_keys ON, busy_timeout), JavaScript puro, Zod. Front: React + Vite + React Router + TanStack Query, mobile-first, Recharts por rota (lazy).
- Um processo só: API em `/api` e build do front.
- Dinheiro em centavos inteiros. Datas sem hora em `AAAA-MM-DD`; timestamps em UTC; fuso de exibição configurável (padrão America/Sao_Paulo).
- Saldo é calculado das movimentações liquidadas. Exclusão é lógica. Toda escrita grava em `audit_log` (antes e depois), na mesma transação.
- Segurança: scrypt, cookie HttpOnly + SameSite=Strict (Secure só em HTTPS), CSRF por token + Origin, limite de 5 erros/15 min, CSP sem `unsafe-inline` (nada de `style=""` nem `<style>` inline no front).
- App funciona completo sem service worker; manifest e SW só em contexto seguro.
- Menu só mostra módulo que funciona. Sem zero falso, dado fictício como real, botão sem efeito.
- Fases 2 a 4 não existem ainda: sem botão nem menu para elas.

## Modo de trabalho

Plano de até 8 linhas antes de cada onda. Grep antes de Read; edições pequenas; sem subagentes. Não fazer git add/commit/push/stash/reset (quem commita é o dono). Saída de testes só com falhas (`tests/reporter-falhas.js`). Ao fim de cada onda: `npm run verify`, relatório de até 10 linhas e parar até "próximo". Divergência do escopo vira ADR em `docs/adr/`. O que não puder ser entregue de verdade fica fora e entra no relatório.

## Fases seguintes

Leia CLAUDE.md, docs/arquitetura.md, docs/regras-financeiras.md e a seção da Fase X em docs/escopo-completo.md. Implemente a Fase X mantendo as decisões, as regras financeiras e o modo de trabalho do projeto, em ondas de até 4 módulos. Ao fim de cada onda rode `npm run verify` com a suíte inteira, faça um relatório de até 10 linhas e pare até eu digitar "próximo". Cada módulo só entra no menu quando funcionar de verdade e vem com testes das regras financeiras que ele cria. Não mexa no que já existe além do necessário.

Ao terminar uma fase, atualize a seção 'O que faz' e a seção 'O que ainda não tem' do README.md, mexendo só nessas duas.
