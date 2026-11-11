# Inventário de telas

Fotografia do front anterior (`web/src`, removido na Onda 5; continua no histórico do git), tirada na Onda 0 da migração para o Netlify (ADR 013). É a lista de conferência da Onda 4: no fim, cada item abaixo precisa existir no front novo, com a mesma função. Nada pode sumir. Rotas aqui são as do app antigo (sem prefixo); no front novo todas ficam sob `/app`.

Todas as telas de dados têm hoje estados de carregando, vazio e erro; o front novo mantém os três.

## Casca (todas as telas)

| Item | Comportamento atual |
| --- | --- |
| Menu lateral (a partir de 900 px) | Todos os itens de `menu.js`, recolhível, preferência em `localStorage` (`tracker.menuRecolhido`) |
| Barra inferior (celular) | Início, Lançamentos, Compromissos, Fluxo de caixa e **Mais** (leva a `/mais`, que lista o resto) |
| Botão "Novo lançamento" | Sempre à mão (botão flutuante); some em `/lancamentos/novo` e `/cartoes/compras*` |
| Sino de alertas | Leva a `/alertas`; selo com a quantidade (`9+`), sem selo quando não há alerta |
| Ocultar valores | Botão no topo, preferência salva no navegador, vale para todo `Valor` |
| Faixa "Dados de demonstração" | Só no modo demo (no novo: só para o usuário `demo`) |
| Tema | Segue o sistema (claro/escuro) |
| PWA | Manifest e service worker só em contexto seguro; app completo sem eles |
| Sessão | Sem sessão mostra o login; erro de rede mostra a mensagem do servidor |

Itens do menu (ordem): Início, Lançamentos, Compromissos, Fluxo de caixa, Contas, Cartões, Recorrências, Orçamento, Metas, Dívidas, Assinaturas, Investimentos, Moedas, Patrimônio, Relatórios, Importar extrato, Categorias, Alertas, Config.

## Login (`Login.jsx`)

- Campo senha, botão **Entrar**. Se a senha ainda não foi definida, orienta a rodar o setup. Mostra aviso de demonstração quando for o caso.
- API: `GET /sessao`, `POST /login`, `POST /logout`.
- No novo: usuário e senha, bloqueio por usuário e por IP, redirecionamento pós-login só para `/app...`.

## Início (`/`, `Dashboard.jsx`)

- Blocos: **Saldo total**, **Realizado**, **Previsto**; **Alertas** (com "Ver todos (n)"); **Próximos 30 dias** (gráfico de projeção lazy e "Ver fluxo de caixa"); **Compromissos**; **Planejamento** (Orçamento do mês com "Ver orçamento", Metas com "Ver metas"); **Dívidas**; **Assinaturas**; **Patrimônio líquido**; **Investimentos**; **Moedas**; **Cartões**.
- Cada bloco só aparece quando há dado (RF-10); sem nenhuma conta, só o convite "Criar conta".
- Links "Ver …" levam à tela correspondente. API: `GET /resumo`, `GET /fluxo/projecao?dias=30`.

## Lançamentos (`/lancamentos`, `Lancamentos.jsx`, `Filtros.jsx`)

- Totais **Realizado (liquidado)** e **Previsto (pendente)**. Lista em tabela (desktop) ou cartões (celular) com Data, Descrição, Categoria, Conta, Situação e Valor.
- **Filtros** (recolhíveis, contador "Filtros (n)", **Limpar filtros**): busca por descrição ou observação (**Buscar**), Tipo (todos, receita, despesa, transferência), Situação (todas, pendente, liquidada), Conta, Categoria, "Filtrar datas por" (competência, vencimento, liquidação), De, Até, Ordenar por, Direção (maior/mais recente primeiro, menor/mais antigo primeiro).
- **Paginação** Anterior/Próxima (25 por página; parâmetros na URL: `q, tipo, status, conta_id, categoria_id, campo_data, de, ate, ordenar, direcao, pagina`).
- **Exportar CSV** dos lançamentos filtrados (`/api/exportar/lancamentos.csv`).
- **Ações por lançamento**: Liquidar, Reabrir, Editar, Duplicar, Excluir (com confirmação), Registrar reembolso (despesa), Comprovantes, Histórico, Abrir transferência (a partir da tarifa).
- Botão **Novo lançamento**.

### Formulário de lançamento (`/lancamentos/novo`, `/lancamentos/:id`)

- Tipo (Receita, Despesa, Transferência); Valor (`inputmode="decimal"`); Data; Descrição; Categoria; Conta; Conta de destino (transferência); **Tarifa da transferência** (vira despesa); Situação (Liquidada ou Pendente); Vencimento; Data de liquidação (vazio = mesma data); Observação; **Dividir entre categorias** (Dividir, Adicionar parte, Remover parte).
- Reembolso: abre com `reembolso_de_id` e mostra "Ver a despesa original". Duplicar copia de outro lançamento.
- Avisa de possível duplicidade sem bloquear (RF-09). Sem conta: "Ir para Contas". Despesa que parece compra de cartão: "Registre como compra no cartão".
- Depois de salvar: "Lançamento salvo" com "Ver lançamentos".

### Histórico (`/lancamentos/:id/historico`) e Comprovantes (`/lancamentos/:id/anexos`, lazy)

- Histórico: linhas do `audit_log` do lançamento (antes e depois), no fuso configurado. Voltar.
- Comprovantes: **Anexar comprovante** (PDF, PNG, JPG, WEBP; 5 MB; 10 por lançamento), lista com abrir (imagem na tela, PDF baixa), **Remover** com confirmação, Voltar.

## Importar extrato (`/importar`, `ImportarOfx.jsx`, lazy)

- Escolher a **conta que recebe** (só BRL), **Escolher arquivo OFX**, prévia "Conferir antes de importar" com cada transação marcada (nova, já importada, possível duplicidade), seleção por linha, categoria por transação (despesa ou receita), **Importar n transações**, **Cancelar**.
- Resultado: "Importação concluída" com "Ver lançamentos". Sem conta: "Criar conta". API: `POST /importacao/ofx` (prévia) e `/importacao/ofx/confirmar`.

## Compromissos (`/compromissos`, `Compromissos.jsx`)

- Abas **A pagar** e **A receber**; filtro Situação (todas, atrasada, a vencer); paginação Anterior/Próxima (parâmetros `tipo, situacao, pagina`).
- Totais separados: atrasado, vence em 7 dias e depois disso (RF-07).
- Por item: **Dar baixa (paguei/recebi)**, **Pagar parte / Receber parte** (valor e data), **Reagendar** (novo vencimento), Editar. Links **Recorrências**, **Novo lançamento**, **Nova recorrência**.

## Recorrências (`/recorrencias`, `/recorrencias/nova`, `/recorrencias/:id`)

- Lista (frequência, tipo, conta), **Nova recorrência**, Editar.
- Formulário: Tipo (Receita ou Despesa), Descrição, Valor de cada ocorrência, Conta, Categoria, Frequência (semanal, quinzenal, mensal, anual), Primeira ocorrência, Até (opcional), Observação, marca de **assinatura** (só despesa), Salvar, Cancelar, **Excluir** com confirmação.

## Fluxo de caixa (`/fluxo`, `Fluxo.jsx`, lazy, usa Recharts)

- Visão (parâmetro `aba`): **Realizado**, **Projeção**, **Calendário**.
- Realizado: Agrupar por (dia, semana, mês, ano), De, Até; cartões Entradas, Saídas e Resultado; gráfico de barras com tabela equivalente; some com "Valores ocultos".
- Projeção: Horizonte de 7, 15, 30, 60 ou 90 dias; saldo projetado, menor saldo, períodos negativos; gráfico com resumo.
- Calendário: Mês anterior e Próximo mês, dias clicáveis (`aria-pressed`) e lista dos itens do dia escolhido.

## Contas (`/contas`)

- Lista com saldo (calculado), tipo e situação; **Nova conta**, Editar, Arquivar/Reativar, Excluir com confirmação. Campos: Nome, Tipo (corrente, poupança, carteira, investimento, digital, benefício, outro), Saldo inicial. Conta com operações só arquiva (mensagem do servidor).

## Categorias (`/categorias`)

- Árvore de categorias principais e subcategorias; **Nova categoria**, **+ Subcategoria**, Editar, Arquivar/Reativar, Excluir com confirmação. Campos: Nome, Tipo (Despesa ou Receita), Categoria principal (vazio = principal).

## Cartões

- **Cartões (`/cartoes`)**: lista, **Novo cartão**, Editar, Arquivar/Reativar, Excluir com confirmação; campos Nome, Limite, Dia do fechamento, Dia do vencimento, Conta que paga a fatura (padrão; "Escolher na hora de pagar"). Barra de **Limite usado**. Links "Faturas e compras" e "Nova compra".
- **Detalhe (`/cartoes/:id`)**: Faturas, Próximas faturas (projeção), Compras (50), "Nova compra", "Voltar aos cartões".
- **Compra (`/cartoes/compras/nova`, `/cartoes/compras/:id`)**: Cartão, Valor total, Data da compra, Parcelas (1 = à vista), Categoria, Descrição, Observação; "Compra salva" com "Ver o cartão". Na edição: **Parcelas** com seleção e **Antecipar para a fatura atual**; **Estorno** (valor, data, **Registrar estorno**, **Desfazer**); **Excluir compra** com confirmação. Aviso de compra duplicada (RF-09).
- **Fatura (`/faturas/:id`)**: situação (calculada), **Compras nesta fatura**, **Estornos (crédito)**, **Pagamentos**; **Pagar fatura** (Pagar com a conta, Valor com o restante preenchido, Data do pagamento, **Pagar**); excluir pagamento com confirmação; "Ir para Contas" sem conta.

## Orçamento (`/orcamento`)

- Navegação de mês (‹ ›); lista por categoria principal com limite, gasto realizado, previsto, projetado, restante, percentual e situação (ok, atenção, estourado, vai estourar); **Total orçado**; bloco **Sem orçamento**.
- **Novo orçamento** (Categoria, Limite por mês, **Definir limite**), **Alterar limite**, **Remover a partir daqui**.

## Metas (`/metas`)

- Lista com acumulado, situação e valor por mês. **Nova meta** (Nome, Valor que quero juntar, Prazo opcional, Observação), **Guardar** (aporte), resgate, **Movimentos** (histórico com **Remover** por item), Editar, Excluir com confirmação. Campo Data nos aportes.

## Dívidas (`/dividas`, `/dividas/nova`, `/dividas/:id`)

- Lista com pago, restante e atrasado. **Nova dívida** (Nome, Credor opcional, Valor total a pagar, Parcelas, Vencimento da primeira, Conta de onde as parcelas saem, Categoria, Observação, **Criar dívida e parcelas**).
- Detalhe: **Parcelas**; por parcela **Paguei** (liquidar) e **Pagar parte** (baixa parcial); Editar, Excluir com confirmação; link "‹ Dívidas".

## Assinaturas (`/assinaturas`)

- **Quanto custam** (mensal e anual, só ativas). Lista: **Pausar/Reativar**, Editar (leva à recorrência), Excluir com confirmação, **Nova assinatura**.

## Investimentos (`/investimentos`)

- **Carteira** (totais só dos avaliados) e lista. **Novo investimento** (Nome, Tipo, Instituição opcional, Observação). Por investimento: **Aportar**, **Resgatar** (desabilitado sem valor), **Informar valor** (Valor atual, Data da avaliação), **Histórico** (Aportes e resgates, Valores informados, **Remover** cada um), Editar, Excluir com confirmação. Operação com conta opcional ("Nenhuma (não mexer no saldo de conta)"); campo Data.

## Moedas (`/moedas`, lazy)

- **Em reais** (total) e lista de contas em moeda; **Nova conta em moeda** (Nome, Moeda, saldo inicial); **Registrar operação** (Depósito, Saque, Compra, Venda; Data; conta em reais e valor em reais na compra e na venda); **Histórico** com **Remover**; Excluir com confirmação. **Cotações**: Moeda, Data, "Reais por 1 {moeda}", **Registrar cotação**, **Remover**. Sem cotação a conta fica fora do patrimônio, com aviso.

## Patrimônio (`/patrimonio`)

- **Patrimônio líquido**, **O que você tem**, **O que você deve**, **Saldo por conta**; links "Ver investimentos", "Ver moedas", "Criar conta".

## Relatórios (`/relatorios`, lazy)

- **Período**: Este mês, Mês passado, Últimos 3 meses, Últimos 12 meses, Personalizado (De, Até).
- **Evolução mês a mês** (3, 6, 12 ou 24 meses; Média por mês; Total realizado), **por categoria** (Despesa ou Receita, com período anterior e variação), **Maiores despesas** (10).

## Alertas (`/alertas`)

- Lista dos alertas calculados na hora (compromisso atrasado ou perto, fatura, orçamento, saldo projetado negativo), cada um com link **Ver**; vazio quando não há.

## Mais (`/mais`) e Config. (`/config`)

- Mais: lista dos itens do menu fora da barra de baixo (celular).
- Config.: **Fuso horário de exibição** (**Salvar**); **Exportar seus dados** (lançamentos CSV, compras no cartão CSV, tudo em JSON: `/api/exportar/lancamentos.csv`, `/compras-cartao.csv`, `/tudo.json`); **Sessão** (**Sair**); saúde do servidor (`/saude`).

## Mudanças previstas no front novo (não são perdas)

| Hoje | No front novo (ADR 013) |
| --- | --- |
| Login só com senha | Usuário e senha, com link para criar conta só se `CADASTRO_ABERTO=1` |
| Config. com exportar e Sair | Conta: exportar tudo (JSON e CSV), excluir conta, trocar senha, encerrar outras sessões. Configurações mantém o fuso |
| `/mais` na barra de baixo | Igual, sob `/app/mais` |
| Faixa de demonstração por modo | Só para o usuário `demo` |
| Comprovante no SQLite | Mesmo fluxo na tela; arquivo no Supabase Storage |
