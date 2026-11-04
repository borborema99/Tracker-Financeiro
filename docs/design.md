# Design

Identidade "papel e tinta": fundo de papel quente, texto em tinta escura, um único acento azul-ardósia. Sóbria, sem gradientes nem sombras decorativas. Cor tem significado: verde para entradas, vermelho para saídas, neutro para o resto, âmbar para avisos.

## Paleta

Tokens em `web/src/estilos/tokens.css`. O tema segue o sistema (`prefers-color-scheme`). `tests/design-contraste.test.js` exige contraste AA (4,5:1) nos pares de texto, nos dois temas.

| Token | Claro | Escuro |
| --- | --- | --- |
| fundo | `#f3efe6` | `#121517` |
| superficie | `#fbf9f4` | `#1a1e21` |
| superficie-2 | `#ebe6da` | `#23282c` |
| tinta | `#1c2320` | `#ebe8e1` |
| tinta-suave | `#55605a` | `#a5aca7` |
| borda | `#cfc8b8` | `#3a4146` |
| acento | `#2f4a73` | `#a9bfe8` |
| entrada (verde) | `#17673a` | `#6fd49b` |
| saida (vermelho) | `#a3262a` | `#ff9a94` |
| aviso (âmbar) | `#8a5a00` | `#e6b45a` |

Cor nunca é o único sinal: valores levam sinal e rótulo.

## Fontes

Sem fontes externas (privacidade, funcionamento offline e CSP `font-src 'self'`). Pilhas do sistema:

- Títulos e marca: `Iowan Old Style, Palatino Linotype, Palatino, Book Antiqua, Georgia, serif`.
- Texto e interface: `ui-sans-serif, system-ui, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif`.
- Valores: `font-variant-numeric: tabular-nums`.

## Padrões

- Mobile-first. Abaixo de 900px: barra de abas inferior. A partir de 900px: menu lateral recolhível (preferência salva no navegador).
- Alvos de toque de pelo menos 44px (`--toque`).
- Valores monetários com `inputmode="decimal"`. Tabelas viram cartões em telas estreitas.
- Botão de ocultar valores no topo; preferência salva no navegador. Todo valor passa pelo componente `Valor`.
- Sem `style=""` nem `<style>` inline: a CSP não permite `unsafe-inline`. Se o Recharts exigir estilo inline, isso será aberto em ADR e documentado aqui.
