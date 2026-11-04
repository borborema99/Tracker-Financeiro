-- Infraestrutura: configuração, sessão, limite de tentativas e histórico de alterações.

CREATE TABLE config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE sessoes (
  id_hash TEXT PRIMARY KEY,
  criada_em TEXT NOT NULL,
  expira_em TEXT NOT NULL
);

CREATE TABLE tentativas_login (
  chave TEXT PRIMARY KEY,
  erros INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate TEXT,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade TEXT NOT NULL,
  entidade_id TEXT NOT NULL,
  acao TEXT NOT NULL CHECK (acao IN ('criar', 'editar', 'excluir', 'restaurar')),
  antes TEXT,
  depois TEXT,
  criado_em TEXT NOT NULL
);

CREATE INDEX idx_audit_entidade ON audit_log (entidade, entidade_id, id);
