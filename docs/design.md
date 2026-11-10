# Design

Identidade "letreiro de feira" (ADR 013, Onda 2): campo amarelo chapado, tinta quase preta, letras condensadas e pesadas de pintor de placa. A etiqueta de preço é o único enfeite. Cor tem significado: folha (verde) para entrada, tomate (vermelho) para saída, âmbar para aviso. O amarelo é a marca e nunca carrega significado financeiro.

Escopo: a landing e as páginas públicas usam o campo amarelo em grande escala (Persuade). O tracker (`/app`) usa o mesmo vocabulário em modo contido: fundo neutro, texto em tinta, amarelo só na marca, no item ativo do menu e no botão principal do tema escuro (Operate).

## Tokens

Fonte única: `frontend/src/estilos/tailwind.css` (o único CSS do front). Os nomes seguem o shadcn/ui; `amarelo`, `amarelo-foreground` e `tinta` são da identidade e têm o mesmo valor nos dois temas, como uma placa pintada. `tests/design-contraste-tailwind.test.js` lê o arquivo e exige contraste AA (4,5:1) nos pares de texto, nos dois temas.

| Token | Claro | Escuro |
| --- | --- | --- |
| background | `#f3f3ee` | `#131310` |
| foreground | `#17160f` | `#f3f2ea` |
| card / popover | `#ffffff` | `#1c1c17` |
| primary (botão principal, item ativo) | `#17160f` com texto `#ffd60a` | `#ffd60a` com texto `#17160f` |
| secondary / muted | `#e7e7df` | `#26261f` |
| muted-foreground | `#505046` | `#a8a89a` |
| accent (hover) | `#ffe770` | `#3a340e` |
| border | `#cfcfc3` | `#3a3a31` |
| input (borda de campo) | `#a3a393` | `#6a6a5c` |
| ring (foco) | `#17160f` | `#ffd60a` |
| entrada (folha) | `#0b6b35` | `#5fd38b` |
| saida / destructive (tomate) | `#b3261e` | `#ff8f86` |
| aviso (âmbar) | `#8a5a00` | `#e6b45a` |
| amarelo (campo do letreiro) | `#ffd60a` | `#ffd60a` |
| amarelo-foreground | `#17160f` | `#17160f` |
| tinta | `#17160f` | `#17160f` |

O tema segue o sistema e pode ser fixado na conta (`lib/tema.ts`, classe `dark` na raiz). Cor nunca é o único sinal: valores levam sinal (+ e −) e, para leitor de tela, o rótulo "Entrada de" ou "Saída de". Sobre o campo amarelo o anel de foco vira tinta (`[--ring:var(--tinta)]`), porque o anel amarelo do tema escuro sumiria.

Raio de borda 6 px: placa, não bolha. Sombra só nas etiquetas, com deslocamento e desfoque.

## Fontes

- Títulos, marca e números de destaque: **Big Shoulders Display** (pesos 800 e 900, alfabeto latino), pacote `@fontsource/big-shoulders-display`, servida do próprio domínio (CSP `font-src 'self'`, sem Google Fonts). Sempre em caixa-alta, com `tracking-tight` nos títulos grandes. Título de hero no máximo 6 rem.
- Texto e interface: pilha do sistema (`ui-sans-serif, system-ui, Segoe UI, Roboto, …`). Abre sem baixar nada e respeita a plataforma.
- Valores: `tabular-nums` (classe `.tabular`).

## Padrões

- Mobile-first. Abaixo de 900 px: barra de abas inferior (com respiro da área segura). A partir de 900 px: menu lateral recolhível, preferência em `localStorage` (`tracker.menuRecolhido`).
- Alvos de toque de pelo menos 44 px (botões `h-11`, itens de menu `min-h-11`, barra inferior `min-h-14`).
- Valores monetários com `inputmode="decimal"`. Tabelas viram cartões em telas estreitas. (Telas de dados: Ondas 3 e 4.)
- Botão de ocultar valores no topo (olho), preferência no navegador (`tracker.ocultarValores`), vale para todo `Valor` e para os gráficos ("Valores ocultos"). Valor oculto aparece como "R$ ••••".
- Sino de alertas no topo, com selo da quantidade (`9+`); some o selo quando não há alerta. "Novo lançamento" sempre à mão: botão redondo "+" no celular (não cobre os valores das listas) e botão com texto a partir de 900 px; some em `/app/lancamentos/novo` e `/app/cartoes/compras*`.
- Barra inferior: Início, Lançamentos, Compromissos, Fluxo de caixa e Mais. "Mais" (`/app/mais`) lista todos os módulos.
- Listas de dados (lançamentos) viram cartões no celular: cada célula traz o próprio rótulo (`data-label`). Formulários: validação do contrato compartilhado antes de enviar (mesmas mensagens do servidor) e `ErroApi.campos` mostrado sob cada campo. Gráficos (Recharts) em chunk próprio, com as mesmas cores dos tokens `--entrada` e `--saida`.
- Barras de progresso (orçamento, metas, dívidas, relatórios) usam `<progress class="medidor text-…">`: a cor é a `color` do elemento (`text-entrada` dentro do limite ou concluída, `text-aviso` perto, `text-saida` estourada ou atrasada, `text-primary` neutra). O percentual também aparece em texto, e a situação em etiqueta, para a cor não ser a única pista.
- Ações destrutivas (excluir) pedem confirmação no mesmo lugar (`BotaoExcluir`); apagar a conta pede o nome de usuário e a senha.
- Link só aparece se a tela existe: `destinoExiste` (em `app/modulos.ts`) filtra os links dos alertas, e os blocos do Início aparecem quando há dado **e** o módulo está no menu.
- Menu só mostra módulo que funciona: `app/modulos.ts` é a lista única de menu, barra inferior e rotas.
- Páginas de acesso: faixa amarela com o título e o formulário ao lado (embaixo no celular). Erro de servidor vai num `role="alert"` acima do campo; erro de campo, abaixo dele.
- Movimento: um só momento, as etiquetas da landing "penduradas" entrando em sequência (`tw-animate-css`), só com `motion-safe`.
- Seleção de texto em amarelo e tinta, foco visível de 3 px, `-webkit-tap-highlight-color` transparente.
- Sem `style=""` nem `<style>` inline: a CSP não permite `unsafe-inline`. O código do front é verificado por `tests/design-contraste-tailwind.test.js`. Radix `Select` e `Dialog` não são usados (injetam `<style>`); usa-se `<select>` e `<dialog>` nativos (ADR 013).
- Texto legal (privacidade e termos) em coluna de leitura de 3xl, com faixa de rascunho para revisão jurídica.
