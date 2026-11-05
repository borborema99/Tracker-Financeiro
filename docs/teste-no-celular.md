# Teste no celular

Roteiro para validar no aparelho o que os testes automáticos não alcançam (toque, teclado, tela pequena, CSP, instalação). Marque cada item; se algum falhar, anote o aparelho, o navegador e o que apareceu.

## Preparar sem tocar nos seus dados

Use um banco descartável. No PowerShell, na pasta do projeto:

```powershell
$env:DB_PATH = 'data/teste-celular.db'
npm run setup          # define uma senha só para o teste
npm run build
npm run iniciar:rede   # mostra o endereço e o QR code
```

No celular (mesmo Wi-Fi), leia o QR code ou digite o endereço. Para voltar ao banco de verdade, feche o terminal (a variável some) e apague `data/teste-celular.db` quando quiser.

`npm run demo` traz dados de exemplo prontos, mas só escuta em `localhost` de propósito; use-o no computador, não no celular.

## 1. Entrada e sessão

- [ ] A tela de login abre e o teclado do celular aparece no campo de senha (sem mostrar o que digita).
- [ ] Senha errada mostra mensagem clara; após 5 erros aparece o bloqueio de 15 minutos.
- [ ] Com a senha certa entra; fechar e reabrir o navegador mantém a sessão.
- [ ] Config → Sair volta ao login.

## 2. Navegação e tela pequena

- [ ] Barra de baixo com Início, Lançamentos, Compromissos, Fluxo e Mais; todos os toques acertam de primeira (alvos de 44 px).
- [ ] "Mais" leva a Contas, Cartões, Recorrências, Categorias, Alertas e Config.
- [ ] O botão "Novo lançamento" fica sempre à mão e não cobre o último item de uma lista (role até o fim).
- [ ] Nenhuma tela rola para os lados (teste também com o celular deitado).
- [ ] As listas de lançamentos viram cartões, sem tabela apertada.
- [ ] O botão do olho oculta todos os valores (inclusive nos gráficos) e a escolha continua ao navegar.
- [ ] Tema claro e escuro (mude no sistema do celular): texto legível nos dois, sem texto claro sobre fundo claro.

## 3. Lançar dinheiro

- [ ] Em "Valor" o teclado é numérico com vírgula/ponto; `1.234,56` e `1234,56` dão o mesmo valor.
- [ ] Criar uma despesa liquidada: o saldo da conta cai na hora.
- [ ] Criar uma despesa pendente com vencimento ontem: aparece como "Atrasada" em Lançamentos e em Compromissos.
- [ ] Liquidar a pendente: o saldo muda e o atraso some.
- [ ] Transferência entre duas contas: a soma dos saldos não muda (exceto a tarifa, se houver).

## 4. Cartões

- [ ] Criar um cartão (fecha dia 10, vence dia 17) e uma compra parcelada em 3x: aparece uma parcela por fatura.
- [ ] Pagar parte da fatura: o saldo da conta cai, a fatura mostra "Parcial" e o total de despesas do mês **não** aumenta.
- [ ] Estornar parte de uma compra: aparece como crédito na fatura.

## 5. Compromissos e recorrências

- [ ] Compromissos → "Pagar parte" de uma conta: o restante continua pendente com o mesmo vencimento.
- [ ] "Reagendar" para uma data futura tira a conta do atraso.
- [ ] Criar uma recorrência mensal que começa hoje: aparecem as próximas ocorrências em Compromissos.
- [ ] Fechar o navegador, abrir de novo e atualizar a página várias vezes: as ocorrências **não** se repetem.
- [ ] Apagar uma ocorrência em Lançamentos: ela não volta depois de atualizar.

## 6. Fluxo de caixa e gráficos (verificação da CSP)

Este é o item que ainda não foi conferido num navegador (ADR 005): os gráficos usam Recharts, e a política de segurança do app não aceita estilo inline.

- [ ] Fluxo → Realizado: o gráfico de barras aparece (não fica em branco) e a tabela abaixo bate com ele.
- [ ] Fluxo → Projeção: a linha do saldo aparece; trocar 7/15/30/60/90 dias atualiza o gráfico e o resumo.
- [ ] Tocar numa barra ou ponto mostra o valor (dica flutuante).
- [ ] Fluxo → Calendário: dias com vencimento aparecem destacados; tocar mostra os itens do dia.
- [ ] Início mostra "Próximos 30 dias" com o gráfico quando existe compromisso ou cartão.

**Se um gráfico ficar em branco ou sem dica flutuante:** abra o mesmo endereço no computador, F12 → Console, e procure "Refused to apply inline style". Anote a mensagem. A saída prevista é trocar o gráfico por SVG próprio, sem afrouxar a política de segurança.

## 7. Alertas

- [ ] O sino do topo mostra um número quando há atraso, vencimento nos próximos 3 dias, fatura fechando ou saldo projetado negativo; o número some quando não há alerta.
- [ ] Cada alerta leva à tela certa ("Ver").

## 8. Exportar

- [ ] Config → "Lançamentos (CSV)" baixa o arquivo; abra numa planilha: acentos corretos, valores como número (`1234,56`), colunas separadas.
- [ ] Em Lançamentos, filtre por tipo e use "Exportar estes lançamentos": o CSV traz só o filtrado.
- [ ] "Cópia completa (JSON)" baixa e abre como texto; confira que não há senha nem sessão nele.

## 9. Instalação e offline (só com HTTPS)

Em HTTP por IP o navegador não instala o app; isso é esperado. Para testar, siga `docs/acesso-celular.md` (Tailscale ou mkcert).

- [ ] O navegador oferece "Instalar app" / "Adicionar à tela inicial" e o ícone aparece.
- [ ] Aberto pelo ícone, o app usa a tela inteira e mantém a sessão.
- [ ] Com o servidor desligado, a casca do app abre, mas os dados dão a mensagem "Sem conexão com o servidor" (não há dado velho fingindo ser atual).

## 10. Backup (no computador)

- [ ] `npm run backup` cria um arquivo em `backups/`.
- [ ] Pare o servidor, rode `npm run restaurar`, escolha o arquivo e confirme: o banco volta ao estado do backup e o anterior fica guardado como `antes-de-restaurar-...`.
- [ ] Suba de novo (`npm start`): os dados estão lá e a senha continua a mesma.

## 11. Peso

- [ ] No computador, `npm run orcamento` termina com "Dentro do orçamento." Em rede móvel lenta, o login e o Início abrem sem esperar o gráfico (ele só carrega depois).
