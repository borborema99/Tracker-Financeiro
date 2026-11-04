-- Compromissos e recorrências.
-- "Atrasada" NÃO é coluna nem status: é calculada (pendente com vencimento passado), RF-07.
-- Conta a pagar/receber é uma movimentação pendente; baixa parcial divide a pendente em
-- uma liquidada (baixa_de_id aponta para a original) e o restante, que continua pendente.

CREATE TABLE recorrencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  descricao TEXT NOT NULL DEFAULT '',
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  conta_id INTEGER NOT NULL REFERENCES contas (id),
  categoria_id INTEGER REFERENCES categorias (id),
  frequencia TEXT NOT NULL CHECK (frequencia IN ('semanal', 'quinzenal', 'mensal', 'anual')),
  data_inicio TEXT NOT NULL,
  data_fim TEXT,
  ativa INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0, 1)),
  observacao TEXT NOT NULL DEFAULT '',
  criada_em TEXT NOT NULL,
  atualizada_em TEXT NOT NULL,
  excluida_em TEXT,
  CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);

-- Ocorrência apagada pelo dono: não volta a ser gerada.
CREATE TABLE recorrencias_puladas (
  recorrencia_id INTEGER NOT NULL REFERENCES recorrencias (id),
  data_ocorrencia TEXT NOT NULL,
  PRIMARY KEY (recorrencia_id, data_ocorrencia)
);

ALTER TABLE movimentacoes ADD COLUMN recorrencia_id INTEGER REFERENCES recorrencias (id);
ALTER TABLE movimentacoes ADD COLUMN data_ocorrencia TEXT;
ALTER TABLE movimentacoes ADD COLUMN baixa_de_id INTEGER REFERENCES movimentacoes (id);

-- Gerar a mesma ocorrência duas vezes é impossível (idempotência garantida pelo banco).
CREATE UNIQUE INDEX idx_mov_ocorrencia ON movimentacoes (recorrencia_id, data_ocorrencia)
  WHERE recorrencia_id IS NOT NULL AND excluida_em IS NULL;
CREATE INDEX idx_mov_baixa ON movimentacoes (baixa_de_id);
CREATE INDEX idx_mov_pendentes ON movimentacoes (status, data_vencimento);
CREATE INDEX idx_recorrencias_ativas ON recorrencias (ativa, excluida_em);
