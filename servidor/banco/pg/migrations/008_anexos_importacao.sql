-- Anexos e importação OFX (Fase 4, Onda 1).
-- O arquivo do anexo NÃO fica no banco: vai para um bucket privado do Supabase Storage, acessado só pelo
-- servidor com a service key. A tabela guarda o caminho do objeto (`<usuario_id>/<uuid>`); o download passa pela
-- API, que confere o dono. Remover um anexo apaga o objeto no Storage, zera `caminho_storage` e mantém o
-- registro (nome, tipo, tamanho, quando) e o audit_log, como antes.

CREATE TABLE anexos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  movimentacao_id bigint NOT NULL,
  nome text NOT NULL,
  tipo_mime text NOT NULL CHECK (tipo_mime IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  tamanho_bytes bigint NOT NULL CHECK (tamanho_bytes > 0),
  sha256 text NOT NULL,
  caminho_storage text,
  criado_em timestamptz NOT NULL,
  excluido_em timestamptz,
  UNIQUE (usuario_id, id),
  UNIQUE (caminho_storage),
  -- Anexo ativo sempre tem objeto; o removido nunca.
  CHECK ((excluido_em IS NULL) = (caminho_storage IS NOT NULL)),
  FOREIGN KEY (usuario_id, movimentacao_id) REFERENCES movimentacoes (usuario_id, id)
);

-- Cada lançamento criado por importação de extrato guarda o FITID (identificador da transação no banco), para o
-- mesmo extrato nunca virar lançamento duas vezes.
CREATE TABLE importacoes_ofx (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  conta_id bigint NOT NULL,
  fitid text NOT NULL,
  movimentacao_id bigint NOT NULL,
  importada_em timestamptz NOT NULL,
  UNIQUE (usuario_id, conta_id, fitid),
  FOREIGN KEY (usuario_id, conta_id) REFERENCES contas (usuario_id, id),
  FOREIGN KEY (usuario_id, movimentacao_id) REFERENCES movimentacoes (usuario_id, id)
);

CREATE INDEX idx_anexos_mov ON anexos (usuario_id, movimentacao_id, excluido_em);
CREATE INDEX idx_importacoes_mov ON importacoes_ofx (usuario_id, movimentacao_id);
