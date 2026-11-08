# Tracker Financeiro

Sistema de controle financeiro pessoal que roda no seu computador e também abre no celular. Os dados ficam em um arquivo SQLite na sua máquina e não vão para nenhum servidor externo. Cada pessoa clona o repositório e usa o próprio banco.

## O que faz

Esta versão cobre as Fases 1 e 2 do escopo (`docs/escopo-completo.md`):

- Contas bancárias e carteiras, com saldo calculado a partir das movimentações.
- Receitas, despesas e transferências entre contas, com categorias, subcategorias, filtros, busca e histórico de alterações.
- Cartões de crédito com faturas, compras parceladas, pagamento total ou parcial, estorno e limite disponível.
- Contas a pagar e a receber, com baixa parcial, reagendamento e aviso de atraso.
- Lançamentos recorrentes.
- Orçamento mensal por categoria e metas com aportes.
- Dívidas parceladas (parcelas viram contas a pagar) e assinaturas, com custo mensal e anual e pausa sem cobranças atrasadas ao reativar.
- Fluxo de caixa, com projeção de 7 a 90 dias, e dashboard com os indicadores dos módulos que existem.
- Alertas dentro do app (atraso, vencimento próximo, fatura fechando e saldo projetado negativo).
- Exportação em CSV (lançamentos e compras no cartão, prontos para planilha) e cópia completa em JSON.
- Backup e restauração pelo terminal.

## Como rodar

Você precisa do Node.js na versão indicada no arquivo `.nvmrc`.

```bash
git clone https://github.com/SEU-USUARIO/tracker-financeiro.git
cd tracker-financeiro
npm install
npm run setup
npm run build
npm start
```

O `npm run setup` cria o `.env` com segredos gerados, aplica as migrations do banco e pede a senha de acesso sem mostrar o que você digita. Depois abra no navegador o endereço que o `npm start` mostra no terminal.

Para desenvolver, use `npm run dev`. Para conhecer o sistema com dados fictícios, use `npm run demo`: ele abre um banco separado (`data/demo.db`) com uma faixa avisando que são dados de demonstração, e seus dados reais não são tocados.

## Usar pelo celular

Por padrão o servidor só aceita conexões do próprio computador. Para abrir no celular, com os dois aparelhos no mesmo Wi-Fi, rode:

```bash
npm run iniciar:rede
```

O terminal mostra o endereço e um QR code. Isso só funciona depois que a senha foi definida no `setup`.

O navegador só instala o app na tela inicial e liga o cache offline em `localhost` ou HTTPS. Pelo IP da rede em HTTP o sistema funciona normalmente como site, só sem instalação. Para ter HTTPS, e acessar de fora de casa sem abrir porta no roteador, o caminho recomendado é o Tailscale. Para HTTPS só na rede local, use o mkcert. O passo a passo está em `docs/acesso-celular.md`. Não faça redirecionamento de porta no roteador para expor este app.

Variáveis do `.env` que mudam o acesso:

| Variável | Para que serve |
| --- | --- |
| `EXPOR_NA_REDE` | Com valor `1`, o servidor escuta na rede local (exige senha definida). |
| `HTTPS_CERT` e `HTTPS_KEY` | Caminhos do certificado e da chave, para o servidor responder em HTTPS. |
| `ORIGENS_PERMITIDAS` | Lista de hosts extras aceitos, por exemplo o endereço do Tailscale. |

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run setup` | Cria o `.env`, aplica as migrations e define a senha. |
| `npm run dev` | Servidor e front em modo de desenvolvimento. |
| `npm run build` | Gera o build do front. |
| `npm start` | Sobe o sistema (API e front no mesmo processo). |
| `npm run iniciar:rede` | Sobe o sistema acessível na rede local, com QR code. |
| `npm run demo` | Sobe com banco separado e dados fictícios. |
| `npm run backup` | Copia o banco para `backups/` com a data no nome. |
| `npm run restaurar` | Restaura uma cópia feita pelo backup. |
| `npm run redefinir-senha` | Define uma nova senha pelo terminal. |
| `npm run lint` | Verifica o estilo do código. |
| `npm test` | Roda os testes. |
| `npm run orcamento` | Confere o tamanho do JavaScript do front (exige `npm run build` antes). |
| `npm run verify` | Lint, testes, build e orçamento de JavaScript em sequência. |

## Backup

O banco fica em `data/`. Rode `npm run backup` de vez em quando e guarde uma cópia da pasta `backups/` fora do computador, porque se o disco falhar e só existir esse arquivo, os dados se perdem. O arquivo de backup é uma cópia inteira do banco, inclusive o hash da senha e as sessões: guarde-o como guarda os dados. Para restaurar, pare o servidor e rode `npm run restaurar`; ele guarda o banco atual como `antes-de-restaurar-...` e o sistema aplica as migrations que faltarem ao subir.

## Segurança e privacidade

Nenhum dado financeiro sai da sua máquina. As pastas `data/` e `backups/`, o `.env` e arquivos `.db` estão no `.gitignore`, então não vão para o repositório. Nunca commite dados reais. A senha é guardada com scrypt, a sessão usa cookie HttpOnly com SameSite estrito (e Secure quando a conexão é HTTPS), o login bloqueia por 15 minutos depois de 5 erros e as requisições que alteram dados exigem cabeçalho e Origin válidos.

Uma instância é uma pessoa. Não há multiusuário, e-mail, autenticação em dois fatores nem notificações push.

## Como o dinheiro é tratado

Valores ficam em centavos inteiros, nunca em número decimal, para não acumular erro de arredondamento. As regras financeiras são testadas uma a uma e estão em `docs/regras-financeiras.md`. As principais:

- Só movimentação liquidada altera saldo. Realizado, previsto e projetado são visões separadas e nunca aparecem somadas no mesmo número.
- Transferência entre contas próprias não é receita nem despesa.
- Compra no cartão é despesa uma única vez. Pagar a fatura não cria nova despesa.
- Compra parcelada gera uma parcela por fatura, cada uma com seu vencimento.
- Atraso é calculado pela data de vencimento, não digitado.

## Estrutura

```
servidor/    API (rotas, regras de cálculo, banco com migrations, segurança)
web/         app React, organizado por funcionalidade
contratos/   esquemas Zod usados pelo front e pelo servidor
scripts/     setup, backup, restauração, redefinição de senha, modo demo, orçamento de JS
tests/       testes
docs/        documentação e decisões (adr/)
data/        banco SQLite (fora do git)
backups/     cópias do banco (fora do git)
```

## Documentação

- `docs/escopo-completo.md`: funcionalidades e fases (provisório, ver `docs/adr/002-escopo-provisorio.md`).
- `docs/arquitetura.md`: como o sistema é organizado.
- `docs/regras-financeiras.md`: regras de cálculo e os testes que as cobrem.
- `docs/acesso-celular.md`: Tailscale, mkcert e HTTPS.
- `docs/teste-no-celular.md`: checklist para validar no aparelho.
- `docs/design.md`: paleta, fontes e padrões de interface.

## O que ainda não tem

Relatórios, patrimônio líquido, investimentos, múltiplas moedas, importação de extratos, anexos e comprovantes e assistente com IA estão nas Fases 3 e 4 do escopo e não existem nesta versão. O menu só mostra o que funciona de verdade.

Também faltam, nas Fases 1 e 2: juros, amortização e quitação antecipada de dívidas, edição de valor ou prazo de uma dívida (hoje se exclui e cria de novo), assinatura no cartão de crédito, restaurar backup pela interface (hoje só pelo terminal), importar dados (o JSON exportado serve para guardar, não para reimportar), lembretes fora do app (e-mail ou push), parcelamento de conta a pagar e juros ou multa de atraso. Os gráficos do Fluxo de caixa ainda não foram conferidos num navegador sob a política de segurança; o roteiro está em `docs/teste-no-celular.md`.
