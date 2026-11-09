-- Compromissos e recorrências.
-- "Atrasada" NÃO é coluna nem status: é calculada (pendente com vencimento passado), RF-07.
-- Conta a pagar/receber é uma movimentação pendente; baixa parcial divide a pendente em
-- uma liquidada (baixa_de_id aponta para a original) e o restante, que continua pendente.

CREATE TABLE recorrencias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  descricao text NOT NULL DEFAULT '',
  valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
  conta_id bigint NOT NULL,
  categoria_id bigint,
  frequencia text NOT NULL CHECK (frequencia IN ('semanal', 'quinzenal', 'mensal', 'anual')),
  data_inicio date NOT NULL,
  data_fim date,
  ativa boolean NOT NULL DEFAULT true,
  observacao text NOT NULL DEFAULT '',
  criada_em timestamptz NOT NULL,
  atualizada_em timestamptz NOT NULL,
  excluida_em timestamptz,
  UNIQUE (usuario_id, id),
  FOREIGN KEY (usuario_id, conta_id) REFERENCES contas (usuario_id, id),
  FOREIGN KEY (usuario_id, categoria_id) REFERENCES categorias (usuario_id, id),
  CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);

-- Ocorrência apagada pelo dono: não volta a ser gerada.
CREATE TABLE recorrencias_puladas (
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  recorrencia_id bigint NOT NULL,
  data_ocorrencia date NOT NULL,
  PRIMARY KEY (recorrencia_id, data_ocorrencia),
  FOREIGN KEY (usuario_id, recorrencia_id) REFERENCES recorrencias (usuario_id, id)
);

ALTER TABLE movimentacoes ADD COLUMN recorrencia_id bigint;
ALTER TABLE movimentacoes ADD COLUMN data_ocorrencia date;
ALTER TABLE movimentacoes ADD COLUMN baixa_de_id bigint;
ALTER TABLE movimentacoes ADD FOREIGN KEY (usuario_id, recorrencia_id) REFERENCES recorrencias (usuario_id, id);
ALTER TABLE movimentacoes ADD FOREIGN KEY (usuario_id, baixa_de_id) REFERENCES movimentacoes (usuario_id, id);

-- Gerar a mesma ocorrência duas vezes é impossível (idempotência garantida pelo banco).
CREATE UNIQUE INDEX idx_mov_ocorrencia ON movimentacoes (recorrencia_id, data_ocorrencia)
  WHERE recorrencia_id IS NOT NULL AND excluida_em IS NULL;
CREATE INDEX idx_mov_baixa ON movimentacoes (usuario_id, baixa_de_id);
CREATE INDEX idx_mov_recorrencia ON movimentacoes (usuario_id, recorrencia_id);
CREATE INDEX idx_mov_pendentes ON movimentacoes (usuario_id, status, data_vencimento);
CREATE INDEX idx_recorrencias_ativas ON recorrencias (usuario_id, ativa, excluida_em);
CREATE INDEX idx_recorrencias_conta ON recorrencias (usuario_id, conta_id);
CREATE INDEX idx_recorrencias_categoria ON recorrencias (usuario_id, categoria_id);
