# ADR 010: anexos, importação OFX e o que a Fase 4 deixa de fora (Fase 4, Onda 1)

Status: aceito.

## Contexto

A Fase 4 do escopo provisório (ADR 006) lista múltiplas moedas, importação OFX, anexos e comprovantes, IA, integração bancária e cotações automáticas. A decisão de base do projeto é "uma instância = uma pessoa" com "os dados ficam só no computador da pessoa". Divisão em ondas: **Onda 1** = anexos e importação OFX; **Onda 2** = múltiplas moedas (mexe na decisão "moeda BRL" e terá ADR próprio).

## O que fica de fora, e por quê

- **IA e leitura de comprovantes.** Exigiria enviar lançamentos ou imagens a um modelo hospedado fora do computador, ou embarcar um modelo local pesado. Contraria "os dados não saem da máquina" e não dá para entregar de verdade só com este repositório.
- **Integração bancária (Open Finance).** Exige credenciais, certificado e um intermediário autorizado, e leva dados do banco a um terceiro. Não há como entregar sem isso. A importação de OFX cobre o caso de uso (trazer o extrato) com um arquivo que a pessoa baixa do banco.
- **Cotações automáticas.** Exigem um serviço externo de preços, ou seja, tráfego de saída que o app hoje não tem. Os investimentos continuam com o valor informado à mão (ADR 008). Na Onda 2, a cotação de moeda também será informada à mão.

## Decisões

1. **O anexo fica dentro do SQLite**, em tabela própria (`anexos_arquivos`), e não numa pasta de arquivos. O backup (API de backup do SQLite) e a restauração passam a levar os comprovantes sem mudar nada, não existe arquivo órfão nem pasta fora de sincronia, e a escrita é transacional com o registro. Custo: o banco cresce; com limite de 5 MB por arquivo e 10 por lançamento, para uso pessoal é aceitável. A listagem nunca lê o conteúdo.
2. **Tipo pelos bytes.** PDF, PNG, JPEG e WEBP, conferidos pelos primeiros bytes. O nome e o `Content-Type` enviados não valem. O nome guardado é saneado (sem pasta nem caractere de controle) e ganha a extensão do tipo real.
3. **Sem dependência nova.** O arquivo vai cru no corpo, com o nome no cabeçalho `x-nome-arquivo`, em vez de `multipart`. O parser de corpo cru é registrado só nos plugins de anexos e de importação, e cada rota tem seu `bodyLimit`. Sessão, Origin e CSRF valem como nas demais escritas.
4. **Servir o arquivo.** `nosniff` em tudo. Imagem abre na tela (a CSP já permite `img-src 'self'`); PDF sempre baixa, porque o visualizador de PDF do navegador não roda sob a nossa política de segurança.
5. **Remover apaga o conteúdo.** O registro e o `audit_log` ficam; o arquivo (que pode ser sensível) não. Excluir o lançamento esconde os anexos, mas não os apaga (exclusão lógica, como o resto).
6. **O JSON exportado não leva o conteúdo** dos anexos, só o registro (nome, tipo, tamanho). O backup leva tudo.
7. **OFX em duas etapas.** A prévia lê e marca (nova, já importada, possível duplicidade) sem gravar. A confirmação revalida no servidor e não confia na prévia. O lote é tudo ou nada.
8. **Nunca duas vezes (RF-09, RF-27).** Cada lançamento importado guarda o FITID em `importacoes_ofx` (único por conta). O mesmo extrato reimportado vira "já importada". Se a pessoa excluiu o lançamento, o FITID volta a valer. A duplicidade parecida com um lançamento digitado à mão só avisa e vem desmarcada.
9. **Só BRL.** Extrato em outra moeda é recusado com mensagem clara até a Onda 2.
10. **Importado entra liquidado**, na data da transação, sem categoria (a pessoa pode escolher uma por linha antes de confirmar). Não cria transferência: pagamento entre contas próprias aparece como despesa e receita separadas, e a pessoa decide o que fazer. Reconhecer transferência automaticamente fica fora.

## Fora desta onda

Anexo em compra de cartão, em fatura ou em investimento; arrastar e soltar vários arquivos; leitura do texto do comprovante; importar CSV ou PDF de extrato; reconhecer transferências e conciliar com lançamentos já existentes; categorizar por regras.

## Consequências

- Migration `008_anexos_importacao.sql` (tabelas `anexos`, `anexos_arquivos`, `importacoes_ofx`). `anexos` e `importacoes_ofx` entram no JSON; `anexos_arquivos` não.
- Telas novas carregadas por rota (`/lancamentos/:id/anexos` e `/importar`); o JS inicial quase não muda.
