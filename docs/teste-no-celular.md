# Teste no celular

Roteiro para validar no aparelho o que os testes automáticos não alcançam (toque, teclado, tela pequena, CSP, instalação). Marque cada item; se algum falhar, anote o aparelho, o navegador e o que apareceu.

## Preparar

Duas formas, as duas sem tocar em dado real:

- **Site publicado** (o que vale para o dia a dia): abra o endereço do Netlify no celular e entre com uma conta de teste criada com `npm run criar-usuario -- teste-celular`. Apague a conta depois, em Conta → Excluir conta.
- **Computador e celular na mesma rede** (só para desenvolver): `npm run demo` sobe a demonstração na porta 3100 com o usuário `demo` e a senha `demonstracao`, num banco local descartável (`data/pglite-demo`). Ele escuta só em `localhost`; para ver no celular, publique uma conta de teste como acima.

## 1. Entrada e sessão

- [ ] A tela `/entrar` abre e o teclado do celular aparece nos campos de usuário e de senha (a senha não aparece).
- [ ] Senha errada e usuário inexistente mostram a mesma mensagem; após 5 erros aparece o bloqueio de 15 minutos.
- [ ] Com a senha certa entra; fechar e reabrir o navegador mantém a sessão.
- [ ] Conta → Sair volta ao login. Abrir `/app/lancamentos` sem sessão leva ao login e, depois de entrar, de volta a Lançamentos.

## 2. Navegação e tela pequena

- [ ] Barra de baixo com Início, Lançamentos, Compromissos, Fluxo e Mais; todos os toques acertam de primeira (alvos de 44 px).
- [ ] "Mais" leva a Contas, Cartões, Recorrências, Categorias, Alertas, Conta e Configurações.
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

- [ ] Conta → "Lançamentos (CSV)" baixa o arquivo; abra numa planilha: acentos corretos, valores como número (`1234,56`), colunas separadas.
- [ ] Em Lançamentos, filtre por tipo e use "Exportar estes lançamentos": o CSV traz só o filtrado.
- [ ] "Cópia completa (JSON)" baixa e abre como texto; confira que não há senha nem sessão nele.

## 9. Instalação e offline (só com HTTPS)

O site publicado no Netlify já é HTTPS, então a instalação funciona. Em `localhost` (demonstração) também; por IP da rede em HTTP não, e isso é esperado.

- [ ] O navegador oferece "Instalar app" / "Adicionar à tela inicial" e o ícone aparece.
- [ ] Aberto pelo ícone, o app usa a tela inteira e mantém a sessão.
- [ ] Sem internet (modo avião), a casca do app abre, mas os dados dão a mensagem de falta de conexão (não há dado velho fingindo ser atual: o service worker nunca guarda respostas da API).

## 10. Backup de uma conta (no computador, com o `.env` do banco)

- [ ] `npm run backup -- seu-usuario` cria um arquivo JSON em `backups/` (guarde fora do computador; ele leva os comprovantes).
- [ ] `npm run restaurar -- seu-usuario backups/<arquivo>.json --sim` substitui os dados da conta pelo backup e guarda antes um backup do estado atual.
- [ ] Entre de novo: os dados estão lá e a senha continua a mesma.

## 11. Peso

- [ ] No computador, `npm run orcamento` termina com "Dentro do orçamento." Em rede móvel lenta, o login e o Início abrem sem esperar o gráfico (ele só carrega depois).

## 12. Comprovantes e importação de extrato

- [ ] Lançamentos → "Comprovantes" de um lançamento: escolha uma foto tirada na hora; ela aparece como miniatura e abre ao tocar.
- [ ] Anexe um PDF: ele é baixado ao tocar (não abre na tela). Um arquivo `.txt` renomeado para `.jpg` é recusado.
- [ ] Remover um comprovante o tira da lista e ele não abre mais. Excluir o lançamento esconde os comprovantes dele.
- [ ] Importar extrato → escolha um `.ofx` baixado do seu banco: a prévia mostra data, descrição e valor, só as novas vêm marcadas.
- [ ] Confirmar cria os lançamentos liquidados e o saldo da conta muda; importar o mesmo arquivo de novo mostra todas como "já importada" e não duplica nada.
- [ ] Um extrato em outra moeda é recusado com mensagem clara.

## 13. Moedas

- [ ] Moedas → "Nova conta em moeda": crie "Viagem" em dólar; ela aparece com saldo US$ 0,00 e o aviso "Sem cotação".
- [ ] Registrar operação → Compra de US$ 100 pagando R$ 540 de uma conta: o saldo da conta em reais cai R$ 540, o dólar mostra US$ 100,00 e o Início **não** mostra despesa nova.
- [ ] Informe a cotação (por exemplo 5,50): a conta passa a mostrar o valor em reais (R$ 550,00) e o Início e o Patrimônio ganham a parte de moedas.
- [ ] Venda maior que o saldo em dólar é recusada com mensagem clara.
- [ ] Remover a cotação volta ao aviso "sem cotação" e o patrimônio avisa que a conta ficou de fora.
- [ ] "Valores ocultos" esconde também o saldo em dólar.
