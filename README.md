# Tracker Financeiro

Controle financeiro pessoal na web, para usar no computador e no celular (instala como app). Cada pessoa entra com a própria conta e só enxerga os próprios dados. O código é para você publicar a **sua cópia**, no Netlify (site e API) com Supabase (banco e comprovantes): passo a passo em `docs/deploy-netlify.md`.

Moeda em reais, interface em português do Brasil.

## O que faz

Esta versão implementa as Fases 1 a 4 do escopo (`docs/escopo-completo.md`), menos o que está em "O que ainda não tem". O status de cada item está em `docs/lacunas.md`.

- Contas bancárias e carteiras (corrente, poupança, carteira, investimento, conta digital, vale-alimentação ou refeição e outra), com saldo calculado a partir das movimentações.
- Receitas, despesas e transferências entre contas, com categorias e subcategorias padrão (editáveis), filtros, busca e histórico de alterações.
- Cartões de crédito com faturas, compras parceladas, pagamento total ou parcial, estorno e limite disponível.
- Contas a pagar e a receber, com baixa parcial, reagendamento e aviso de atraso.
- Lançamentos recorrentes.
- Orçamento mensal por categoria e metas com aportes.
- Dívidas parceladas (parcelas viram contas a pagar) e assinaturas, com custo mensal e anual e pausa sem cobranças atrasadas ao reativar.
- Investimentos (carteira manual: aportes, resgates e o valor que você informa, com resultado calculado) e patrimônio líquido (contas e investimentos menos cartões e dívidas).
- Relatórios do que já foi liquidado: evolução mês a mês, despesas ou receitas por categoria comparadas com o período anterior e maiores despesas.
- Comprovantes: foto ou PDF anexados a um lançamento (até 10, de 5 MB), guardados num bucket privado do Supabase Storage e entregues só pela API, depois de conferir o dono.
- Importação de extrato OFX, com prévia, aviso de possível duplicidade e sem nunca lançar a mesma transação duas vezes.
- Contas em moeda estrangeira (dólar, euro e outras sete), com compra e venda ligadas a uma conta em reais e a cotação que você informa; o resto do app segue em reais.
- Fluxo de caixa, com projeção de 7 a 90 dias, e início com os indicadores dos módulos que existem.
- Alertas dentro do app (atraso, vencimento próximo, fatura fechando e saldo projetado negativo).
- Conta: trocar a senha, encerrar as outras sessões, exportar todos os seus dados (CSV e JSON) e excluir a conta com tudo dentro.
- Tema claro, escuro ou do sistema, ocultar valores, instalação no celular e páginas de Política de Privacidade e Termos de Uso (rascunhos para revisão jurídica).

## Como usar o site

1. Abra o endereço do site. A página inicial explica o Tracker; **Entrar** leva ao login.
2. Entre com usuário e senha. Contas são criadas pelo dono do site com `npm run criar-usuario -- <usuario>`; a tela **Criar conta** só existe se ele abriu o cadastro (`CADASTRO_ABERTO=1`).
3. Esqueceu a senha? Não há e-mail: peça ao dono para rodar `npm run redefinir-senha -- <usuario>`.
4. No celular, use *Adicionar à tela inicial* do navegador. O app guarda só a casca para abrir mais rápido; seus dados nunca ficam em cache no aparelho.
5. Lançar uma despesa leva até 3 toques pelo botão "Novo lançamento", sempre à mão.

## Publicar a própria cópia (Netlify e Supabase)

Resumo; o guia completo, com conferência e solução de problemas, é `docs/deploy-netlify.md`.

1. Crie um projeto no Supabase, o bucket privado `comprovantes` e copie `DATABASE_URL` (pooler, porta 6543), `SUPABASE_URL` e a chave `service_role`.
2. Copie `.env.example` para `.env`, preencha essas três variáveis e rode `npm install` e `npm run setup`: ele gera os segredos que faltam e aplica as migrations no banco.
3. Crie sua conta: `npm run criar-usuario -- seu-nome`.
4. No Netlify, importe o repositório do GitHub (o `netlify.toml` já traz build, pasta e funções) e cadastre as variáveis de ambiente do servidor: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SEGREDO_SESSAO`, `SENHA_PEPPER`, `HMAC_CHAVE_IP`, `CADASTRO_ABERTO` e `SITE_URL`.
5. Depois do primeiro deploy, cadastre `SITE_URL` com o endereço do site e publique de novo.

Nenhuma dessas variáveis vai para o navegador: a chave de serviço e a `DATABASE_URL` só existem no servidor, e `npm run verify` procura segredos dentro do build do front.

## Desenvolvimento local

Você precisa do Node.js na versão do arquivo `.nvmrc`. Sem `DATABASE_URL`, tudo roda em um Postgres embutido (PGlite, em `data/pglite`) e os comprovantes ficam em `data/anexos`, sem conta em lugar nenhum.

```bash
git clone https://github.com/SEU-USUARIO/tracker-financeiro.git
cd tracker-financeiro
npm install
npm run setup
npm run criar-usuario -- seu-nome
npm run dev
```

`npm run dev` sobe a API (porta 3000) e o front (Vite, porta 5173, com proxy para a API). Para conhecer o sistema com dados fictícios, use `npm run demo`: ele abre um banco separado (`data/pglite-demo`) com o usuário `demo` (senha `demonstracao`), que é o único a ver a faixa de dados de demonstração.

### Comandos

| Comando | O que faz |
| --- | --- |
| `npm run setup` | Gera os segredos que faltam no `.env` e aplica as migrations no banco configurado. |
| `npm run dev` | API e front em modo de desenvolvimento. |
| `npm run build` | Gera o build do front (`frontend/dist`). |
| `npm start` | Sobe a API e o build do front num processo só, em `localhost` (o Netlify não usa isso). |
| `npm run criar-usuario -- <usuario>` | Cria uma conta (a senha é pedida sem eco). |
| `npm run redefinir-senha -- <usuario>` | Define nova senha, encerra as sessões e limpa o bloqueio de login. |
| `npm run demo` | Demonstração com banco separado e dados fictícios. |
| `npm run backup -- <usuario>` | Salva os dados de uma conta (e os comprovantes) em JSON, em `backups/`. |
| `npm run restaurar -- <usuario> <arquivo> [--sim]` | Substitui os dados da conta pelo backup, guardando antes o estado atual. |
| `npm run lint` | Verifica o estilo do código. |
| `npm run typecheck` | TypeScript estrito no front. |
| `npm test` | Testes do servidor (Postgres em PGlite) e do front (Vitest). |
| `npm run orcamento` | Confere o tamanho do JavaScript do front (landing até 120 kB e app até 180 kB, gzip). Exige `npm run build`. |
| `npm run verificar-dist` | Procura segredos e variáveis do servidor dentro de `frontend/dist`. |
| `npm run verify` | Lint, tipos, testes, build, orçamento e busca de segredos, em sequência. |

## Backup

O Supabase cuida do banco (veja o plano do seu projeto para a retenção). Para ter uma cópia sua, rode `npm run backup -- <usuario>` de vez em quando e guarde o arquivo fora do computador: ele leva os dados e os comprovantes da conta, então guarde-o como guarda os dados. Cada pessoa também pode exportar tudo em *Conta* (CSV e JSON, sem senha nem sessões).

## Segurança e privacidade

Os dados ficam no seu projeto do Supabase. Toda tabela tem `usuario_id` e toda consulta filtra pelo usuário da sessão; as chaves estrangeiras entre dados são compostas com `usuario_id`, então uma referência a dado de outra conta é impossível no banco, e recurso de outra conta responde 404. O RLS está ligado em todas as tabelas, sem policies. A senha é guardada com scrypt e um pepper do servidor; a sessão fica no banco e usa cookie `__Host-` HttpOnly, Secure, SameSite=Strict; o login bloqueia por 15 minutos depois de 5 erros, contados por usuário e por IP (guardado só como HMAC); as requisições que alteram dados exigem token CSRF e Origin válidos; a CSP não permite `unsafe-inline`. Nunca commite o `.env`, a pasta `data/` nem backups.

## Como o dinheiro é tratado

Valores ficam em centavos inteiros, nunca em número decimal, para não acumular erro de arredondamento. As regras financeiras são testadas uma a uma e estão em `docs/regras-financeiras.md`. As principais:

- Só movimentação liquidada altera saldo. Realizado, previsto e projetado são visões separadas e nunca aparecem somadas no mesmo número.
- Transferência entre contas próprias não é receita nem despesa.
- Compra no cartão é despesa uma única vez. Pagar a fatura não cria nova despesa.
- Compra parcelada gera uma parcela por fatura, cada uma com seu vencimento.
- Atraso é calculado pela data de vencimento, não digitado.

O cálculo fica só no servidor (`servidor/dominio/`); o front formata o que a API devolve.

## Estrutura

```
servidor/    API (rotas, regras de cálculo, banco Postgres com migrations, segurança)
netlify/     funções: api (a API em /api/*) e manutencao (agendada, diária)
frontend/    site e app em React, TypeScript, Tailwind e shadcn/ui
contratos/   esquemas Zod e dinheiro, usados pelo front e pelo servidor
scripts/     setup, criar usuário, redefinir senha, backup, restauração, demonstração, orçamento de JS
tests/       testes do servidor
docs/        documentação e decisões (adr/)
netlify.toml build, redirecionamentos da SPA e cabeçalhos de segurança
```

## Documentação

- `docs/deploy-netlify.md`: publicar no Netlify e no Supabase, passo a passo.
- `docs/escopo-completo.md`: escopo em 34 seções (reconstruído, ver `docs/adr/012-escopo-reconstruido.md`).
- `docs/lacunas.md`: situação de cada item do escopo contra o código (feito, parcial, falta, fora por decisão).
- `docs/arquitetura.md`: como o sistema é organizado.
- `docs/adr/013-netlify-supabase-multiusuario.md`: a migração para Netlify, Supabase e várias contas, onda a onda.
- `docs/regras-financeiras.md`: regras de cálculo e os testes que as cobrem.
- `docs/teste-no-celular.md`: checklist para validar no aparelho.
- `docs/design.md`: identidade visual e tokens do Tailwind.
- `docs/inventario-telas.md`: lista de telas, ações e filtros do front anterior, usada para conferir a migração.

## O que ainda não tem

Por decisão, nunca terá: autenticação em dois fatores, e-mail e notificação push, o lado de serviço da LGPD (encarregado, canal do titular, registro de tratamento; o que a pessoa faz sozinha, como exportar e excluir a conta, existe), assistente com IA (inclusive leitura de comprovantes), integração bancária e cotação automática (de moeda e de investimento). Senha esquecida só se redefine pelo terminal do dono (`npm run redefinir-senha`). O menu só mostra o que funciona de verdade.

O cadastro público (`CADASTRO_ABERTO=1`) não tem limite de taxa nem confirmação por e-mail: use só em período de convites. As páginas de Privacidade e Termos são rascunhos e precisam de revisão jurídica antes de abrir o site a outras pessoas.

Nas moedas, faltam receitas e despesas em moeda estrangeira com categoria, orçamento e relatório, cartão em outra moeda, ganho ou perda cambial e moedas sem casas decimais, como o iene. Na importação, faltam CSV, PDF, extrato em outra moeda e reconhecer transferências entre suas contas. Nos comprovantes, faltam anexos em compras de cartão.

Também faltam, nas Fases 1 a 3: etiquetas e edição em lote de lançamentos, ajuste de saldo por conferência com o extrato, cor ou ícone nas categorias, aviso de duplicidade em lançamento digitado à mão, evolução do patrimônio mês a mês, gráficos por categoria e relatório por conta nos relatórios, exportar relatório em PDF, cotas, proventos e imposto nos investimentos, juros, amortização e quitação antecipada de dívidas, edição de valor ou prazo de uma dívida (hoje se exclui e cria de novo), assinatura no cartão de crédito, copiar o orçamento do mês anterior e levar sobra ou estouro ao mês seguinte, alerta de meta atrasada, restaurar backup pela interface (hoje só pelo terminal), importar dados (o JSON exportado serve para guardar, não para reimportar), parcelamento de conta a pagar e juros ou multa de atraso. O roteiro para conferir os gráficos do Fluxo de caixa num navegador sob a política de segurança está em `docs/teste-no-celular.md`.
