# ADR 012: escopo reconstruído (encerra o ADR 002)

**Contexto.** O ADR 002 registrou que o escopo original de 34 seções não estava no disco e que `docs/escopo-completo.md` era uma versão provisória, com itens **[PENDENTE]** (tipos de conta, categorias e subcategorias padrão). As Fases 1 a 4 foram feitas sobre essa versão. Em 2026-11-09 o original continuava perdido: o arquivo colocado em `docs/escopo-original.md` tinha o mesmo texto do provisório e, depois, estava vazio. O dono pediu que o escopo fosse recriado.

**Decisão.**
1. `docs/escopo-completo.md` passou a ser um escopo **reconstruído** em 34 seções, com itens numerados. **Não é o original.** As seções e os itens foram escritos a partir do CLAUDE.md, dos ADRs 001 a 011, de `docs/regras-financeiras.md`, do README e da lista de exclusões da decisão de produto. O cabeçalho do arquivo diz isso. Se o original aparecer, ele vale e a diferença vira um ADR novo.
2. O status das fases sai do escopo e fica só em `docs/lacunas.md`, que compara cada item com o código.
3. Ficam **fora por decisão**, sem implementação: multiusuário, 2FA, e-mail, push, LGPD de serviço, IA, integração bancária e cotação automática. A razão de produto é "uma instância, uma pessoa, dados só na máquina" (CLAUDE.md). A razão técnica de IA, banco e cotação está no ADR 010.
4. Os **[PENDENTE]** do ADR 002 foram resolvidos pela migration `010_padroes_e_tipos_de_conta.sql`:
   - **Tipos de conta (seção 4):** além de corrente, poupança, carteira e investimento, entram `digital`, `beneficio` e `outro`. O SQLite não altera CHECK, então a migration reconstrói `contas` com os mesmos ids e colunas.
   - **Categorias e subcategorias (seções 2 e 3):** entram só as que a semente antiga não criava (6 categorias e 25 subcategorias; categorias que já eram simples, como Vestuário, continuam sem filhas porque testes de orçamento e de categoria dependem disso). Nada é apagado, renomeado nem recriado, mesmo que a pessoa tenha renomeado, arquivado ou excluído a padrão. Só roda em banco já semeado; em banco novo, `padroes.js` cria a lista completa. Cada categoria criada grava `audit_log`.
5. O runner de migrations ganhou uma marca: a primeira linha `-- migrar: sem-chaves-estrangeiras` desliga `foreign_keys` durante a migration (o pragma não vale dentro de transação), roda `foreign_key_check` antes do commit e liga as chaves de volta mesmo com erro. As migrations 001 a 009 não usam a marca e não mudam de checksum.
6. As mensagens de validação do Zod que os contratos não escrevem à mão ficaram em português em `contratos/mensagens.js`, carregado por todo contrato que usa o Zod. O front não define esquemas próprios, então servidor e front devolvem o mesmo texto.

**Consequências.**
- Os tipos e as categorias novos são uma **escolha desta reconstrução**, não do original. Tudo é editável na tela; a pessoa pode arquivar ou renomear o que não quiser.
- Quem renomeou uma categoria padrão não ganha uma cópia dela, mas também não recebe de volta a antiga.
- Uma conta com tipo novo não tem tratamento diferente de nenhum outro tipo: o tipo é só rótulo, o saldo continua calculado das movimentações.
- `docs/lacunas.md` precisa ser atualizada quando um item mudar de situação.
