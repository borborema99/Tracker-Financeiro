# Escopo do Tracker Financeiro

> **Documento reconstruído.** O arquivo original de 34 seções foi perdido e não foi recuperado. Este texto foi reescrito em 2026-11-09 a partir do que o projeto já registrava (CLAUDE.md, ADRs 001 a 011, `docs/regras-financeiras.md`, README) e da lista de exclusões da decisão de produto. A numeração das 34 seções e os itens numerados (`4.1`, `4.2`...) são desta reconstrução. Se o original for encontrado, ele vale e a diferença vira ADR (ver `docs/adr/012-escopo-reconstruido.md`).
>
> O status de cada item (feito, parcial, falta, fora por decisão) **não fica aqui**: fica só em `docs/lacunas.md`.

Tracker Financeiro é controle financeiro pessoal local: uma instância, uma pessoa, dados num arquivo SQLite na máquina, moeda base BRL, interface em português do Brasil.

## Parte A. Base

### 1. Visão geral e princípios
- 1.1 Uma instância atende uma pessoa; os dados ficam só na máquina.
- 1.2 Um processo serve a API (`/api`) e o front.
- 1.3 Dinheiro em centavos inteiros; datas sem hora; timestamps em UTC; fuso de exibição configurável.
- 1.4 Saldo calculado das movimentações liquidadas; exclusão lógica; histórico de toda escrita.
- 1.5 O menu só mostra módulo que funciona; nada de zero falso, dado fictício como real ou botão sem efeito.

### 2. Categorias
- 2.1 Categorias de despesa e de receita, com conjunto padrão.
- 2.2 Criar, renomear, arquivar e excluir categoria (sem excluir a que tem uso).
- 2.3 Categoria de sistema para tarifas bancárias.
- 2.4 Cor ou ícone por categoria.

### 3. Subcategorias
- 3.1 Subcategorias de um nível, com conjunto padrão.
- 3.2 Criar, renomear, arquivar, excluir e mover subcategoria.
- 3.3 Relatórios e orçamento agrupam a subcategoria na categoria principal.

### 4. Contas e carteiras
- 4.1 Tipos de conta: corrente, poupança, carteira, conta de investimento, conta digital ou de pagamento, benefício (vale-alimentação ou refeição) e outra.
- 4.2 Saldo inicial; saldo atual calculado das movimentações liquidadas.
- 4.3 Arquivar e excluir conta (conta com histórico só arquiva).
- 4.4 Ajuste de saldo por conferência com o extrato.
- 4.5 Saldo por conta e total no dashboard.

## Parte B. Lançamentos

### 5. Receitas
- 5.1 Receita com data, conta, categoria, descrição, observação e status (pendente ou liquidada).
- 5.2 Liquidar e reabrir.

### 6. Despesas
- 6.1 Despesa com os mesmos campos da receita.
- 6.2 Despesa pendente conta no compromisso e no fluxo, não no saldo.

### 7. Transferências entre contas
- 7.1 Transferência move saldo entre duas contas sem virar receita nem despesa.
- 7.2 Conta de origem e destino diferentes.

### 8. Gestão de lançamentos
- 8.1 Listagem com filtros (período, conta, categoria, tipo, status), busca e ordenação.
- 8.2 Paginação no servidor.
- 8.3 Duplicar lançamento.
- 8.4 Dividir um lançamento entre categorias.
- 8.5 Histórico de alterações por lançamento.
- 8.6 Etiquetas (tags) livres e filtro por etiqueta.
- 8.7 Edição e exclusão em lote.
- 8.8 Aviso de lançamento duplicado.

## Parte C. Cartões e compromissos

### 9. Cartões de crédito e faturas
- 9.1 Cadastro de cartão com limite, dia de fechamento e dia de vencimento.
- 9.2 Fatura com situação calculada: aberta, fechada, parcial, paga ou atrasada.
- 9.3 Pagamento total e parcial da fatura, a partir de uma conta.
- 9.4 Cartão em outra moeda.

### 10. Compras no cartão
- 10.1 Compra à vista e parcelada, com parcelas nas faturas certas.
- 10.2 Estorno total e parcial.
- 10.3 Antecipação de parcelas.
- 10.4 Aviso de compra duplicada.
- 10.5 Anexo de comprovante em compra de cartão.

### 11. Limite e projeção do cartão
- 11.1 Limite disponível calculado.
- 11.2 Projeção das próximas faturas.

### 12. Contas a pagar e a receber
- 12.1 Lista de compromissos pendentes, com situação de atraso.
- 12.2 Baixa total e parcial.
- 12.3 Reagendar vencimento.
- 12.4 Parcelar uma conta a pagar.
- 12.5 Juros e multa de atraso.

### 13. Lançamentos recorrentes
- 13.1 Recorrência com frequência, início e fim opcional.
- 13.2 Geração dos lançamentos futuros como pendentes.
- 13.3 Editar e encerrar recorrência.

## Parte D. Visão geral

### 14. Fluxo de caixa
- 14.1 Fluxo por dia, semana, mês e ano.
- 14.2 Projeção de 7, 15, 30, 60 e 90 dias.
- 14.3 Calendário financeiro.
- 14.4 Aviso de saldo projetado negativo.

### 15. Dashboard
- 15.1 Saldo, receitas e despesas do mês.
- 15.2 Indicadores só dos módulos que existem.
- 15.3 Blocos de investimentos, patrimônio e moedas aparecem só com dados.

### 16. Alertas dentro do app
- 16.1 Atraso, vencimento próximo, fatura fechando e saldo projetado negativo.
- 16.2 Alerta de orçamento perto do limite ou estourado.
- 16.3 Alerta de meta atrasada.

## Parte E. Planejamento

### 17. Orçamento mensal
- 17.1 Limite mensal por categoria, com realizado e restante.
- 17.2 Soma do orçamento e comparação com a receita prevista.
- 17.3 Cópia do orçamento do mês anterior.
- 17.4 Sobra ou estouro que passa para o mês seguinte.

### 18. Metas e aportes
- 18.1 Meta com valor alvo, prazo opcional e aportes.
- 18.2 Progresso calculado.
- 18.3 Reserva de emergência como meta.

### 19. Dívidas
- 19.1 Dívida parcelada, com parcelas viradas contas a pagar.
- 19.2 Saldo devedor e progresso.
- 19.3 Juros, amortização e quitação antecipada.
- 19.4 Editar valor ou prazo de uma dívida.

### 20. Assinaturas
- 20.1 Assinatura com valor, periodicidade e conta.
- 20.2 Custo mensal e anual.
- 20.3 Pausar e reativar sem cobranças atrasadas.
- 20.4 Assinatura no cartão de crédito.

## Parte F. Patrimônio e análise

### 21. Investimentos
- 21.1 Carteira manual: aportes, resgates e valor atual informado.
- 21.2 Resultado e rentabilidade calculados; sem valor informado, sem resultado.
- 21.3 Aporte e resgate ligados a uma conta, sem virar despesa nem receita.
- 21.4 Cotas, proventos e imposto.

### 22. Patrimônio líquido
- 22.1 Contas e investimentos menos faturas, parcelas futuras do cartão e dívidas.
- 22.2 Cada parte só entra se o módulo existir.
- 22.3 Evolução do patrimônio mês a mês.

### 23. Relatórios
- 23.1 Evolução mês a mês de receitas, despesas e saldo.
- 23.2 Despesas e receitas por categoria, comparadas com o período anterior.
- 23.3 Maiores despesas.
- 23.4 Gráficos nos relatórios.
- 23.5 Relatório por etiqueta ou por conta.

## Parte G. Dados e integrações

### 24. Comprovantes e anexos
- 24.1 Até 10 arquivos de 5 MB por lançamento (PDF, PNG, JPG, WEBP), conferidos pelos bytes.
- 24.2 Arquivo guardado no banco e levado pelo backup.

### 25. Importação de extrato
- 25.1 Importar OFX em BRL, com prévia.
- 25.2 Nunca importar a mesma transação duas vezes; aviso de parecido com lançamento manual.
- 25.3 Confirmação tudo ou nada.
- 25.4 Importar CSV.
- 25.5 Reconhecer transferência entre contas próprias.

### 26. Múltiplas moedas
- 26.1 Contas em moeda estrangeira com saldo na própria moeda.
- 26.2 Depósito, saque, compra e venda de moeda.
- 26.3 Cotação informada à mão, uma por moeda e data.
- 26.4 Sem cotação, fora do patrimônio, com aviso.
- 26.5 Receita e despesa em moeda estrangeira com categoria.
- 26.6 Ganho ou perda cambial.

### 27. Exportação
- 27.1 CSV de lançamentos e de compras no cartão.
- 27.2 Cópia completa em JSON.
- 27.3 Exportar relatório em PDF.

### 28. Backup, restauração e importação de dados
- 28.1 Backup pelo terminal.
- 28.2 Restauração pelo terminal, com conferência.
- 28.3 Restaurar pela interface.
- 28.4 Importar o JSON exportado.

## Parte H. Plataforma

### 29. Segurança e acesso
- 29.1 Senha com scrypt, cookie HttpOnly e SameSite=Strict.
- 29.2 CSRF por token e Origin; limite de 5 erros em 15 minutos.
- 29.3 CSP sem `unsafe-inline`.
- 29.4 Redefinir senha pelo terminal.
- 29.5 Trocar a senha pela interface.

### 30. Privacidade e preferências
- 30.1 Ocultar valores na tela.
- 30.2 Fuso de exibição configurável.
- 30.3 Tema claro e escuro.
- 30.4 Dados só na máquina, sem envio a terceiros.

### 31. Interface, celular e PWA
- 31.1 Mobile-first, com menu e carga por rota.
- 31.2 Acesso pelo celular na rede local, com HTTPS opcional.
- 31.3 PWA (manifest e service worker) só em contexto seguro; o app funciona completo sem ele.
- 31.4 Modo demonstração com dados fictícios identificados.

### 32. Regras financeiras e testes
- 32.1 Regras RF-01 a RF-30 documentadas em `docs/regras-financeiras.md`.
- 32.2 Cada regra vira teste com o ID no nome.
- 32.3 Cálculo só em `servidor/dominio/`, em funções puras; o front só formata.
- 32.4 Mensagens de validação em português, iguais no front e no servidor.

### 33. Fora por decisão
O projeto não terá, por decisão de produto:
- 33.1 Multiusuário.
- 33.2 Autenticação em dois fatores.
- 33.3 Envio de e-mail.
- 33.4 Notificação push.
- 33.5 Recursos de LGPD de serviço (consentimento, portal do titular, DPO).
- 33.6 Assistente com IA, inclusive leitura de comprovantes.
- 33.7 Integração bancária (Open Finance).
- 33.8 Cotação automática de moeda e de investimento.

### 34. Qualidade, documentação e operação
- 34.1 `npm run verify` (lint, testes, build, orçamento de tamanho).
- 34.2 README, arquitetura, regras e ADRs atualizados.
- 34.3 Migrations numeradas, com checksum, que nunca se editam.
- 34.4 Scripts de setup, backup, restauração e rede.
- 34.5 Roteiro de teste no celular.
