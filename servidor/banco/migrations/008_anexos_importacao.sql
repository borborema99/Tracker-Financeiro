-- Anexos e importação OFX (Fase 4, Onda 1).
-- O arquivo do anexo fica no próprio SQLite (tabela separada, para a listagem não carregar o conteúdo): backup e
-- restauração levam tudo junto, sem pasta de arquivos soltos que possa ficar fora de sincronia.
-- Remover um anexo apaga o conteúdo e mantém só o registro (nome, tipo, tamanho, quando) e o audit_log.

CREATE TABLE anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movimentacao_id INTEGER NOT NULL REFERENCES movimentacoes (id),
  nome TEXT NOT NULL,
  tipo_mime TEXT NOT NULL CHECK (tipo_mime IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  tamanho_bytes INTEGER NOT NULL CHECK (tamanho_bytes > 0),
  sha256 TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  excluido_em TEXT
);

CREATE TABLE anexos_arquivos (
  anexo_id INTEGER PRIMARY KEY REFERENCES anexos (id),
  conteudo BLOB NOT NULL
);

-- Cada lançamento criado por importação de extrato guarda o FITID (identificador da transação no banco), para o
-- mesmo extrato nunca virar lançamento duas vezes.
CREATE TABLE importacoes_ofx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conta_id INTEGER NOT NULL REFERENCES contas (id),
  fitid TEXT NOT NULL,
  movimentacao_id INTEGER NOT NULL REFERENCES movimentacoes (id),
  importada_em TEXT NOT NULL,
  UNIQUE (conta_id, fitid)
);

CREATE INDEX idx_anexos_mov ON anexos (movimentacao_id, excluido_em);
CREATE INDEX idx_importacoes_mov ON importacoes_ofx (movimentacao_id);
