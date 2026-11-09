-- Contas, categorias e movimentações (receita, despesa, transferência).
-- Saldo NÃO é coluna: é calculado das movimentações liquidadas. Exclusão é lógica (excluida_em).
-- Os tipos de conta já nascem completos (corrente, poupança, carteira, investimento, digital, benefício, outro):
-- a migration 010 do SQLite, que reconstruía a tabela para isso, não tem par aqui. As categorias padrão são
-- criadas por usuário, em código, quando a conta é criada.

CREATE TABLE contas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('corrente', 'poupanca', 'carteira', 'investimento', 'digital', 'beneficio', 'outro')),
  saldo_inicial_centavos bigint NOT NULL DEFAULT 0,
  arquivada boolean NOT NULL DEFAULT false,
  criada_em timestamptz NOT NULL,
  atualizada_em timestamptz NOT NULL,
  excluida_em timestamptz,
  UNIQUE (usuario_id, id)
);

CREATE TABLE categorias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('despesa', 'receita')),
  pai_id bigint,
  papel text CHECK (papel IN ('tarifa')),
  arquivada boolean NOT NULL DEFAULT false,
  criada_em timestamptz NOT NULL,
  atualizada_em timestamptz NOT NULL,
  excluida_em timestamptz,
  UNIQUE (usuario_id, id),
  FOREIGN KEY (usuario_id, pai_id) REFERENCES categorias (usuario_id, id)
);

CREATE INDEX idx_categorias_pai ON categorias (usuario_id, pai_id);

CREATE TABLE movimentacoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('receita', 'despesa', 'transferencia')),
  descricao text NOT NULL DEFAULT '',
  valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
  conta_id bigint NOT NULL,
  conta_destino_id bigint,
  categoria_id bigint,
  data_competencia date NOT NULL,
  data_vencimento date,
  data_liquidacao date,
  status text NOT NULL CHECK (status IN ('pendente', 'liquidada')),
  observacao text NOT NULL DEFAULT '',
  -- Tarifa de uma transferência: despesa vinculada à transferência (RF-03).
  transferencia_id bigint,
  criada_em timestamptz NOT NULL,
  atualizada_em timestamptz NOT NULL,
  excluida_em timestamptz,
  UNIQUE (usuario_id, id),
  FOREIGN KEY (usuario_id, conta_id) REFERENCES contas (usuario_id, id),
  FOREIGN KEY (usuario_id, conta_destino_id) REFERENCES contas (usuario_id, id),
  FOREIGN KEY (usuario_id, categoria_id) REFERENCES categorias (usuario_id, id),
  FOREIGN KEY (usuario_id, transferencia_id) REFERENCES movimentacoes (usuario_id, id),
  CHECK ((status = 'liquidada') = (data_liquidacao IS NOT NULL)),
  CHECK (tipo <> 'transferencia' OR (conta_destino_id IS NOT NULL AND conta_destino_id <> conta_id AND categoria_id IS NULL)),
  CHECK (tipo = 'transferencia' OR conta_destino_id IS NULL)
);

CREATE TABLE movimentacao_divisoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  movimentacao_id bigint NOT NULL,
  categoria_id bigint NOT NULL,
  valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
  FOREIGN KEY (usuario_id, movimentacao_id) REFERENCES movimentacoes (usuario_id, id),
  FOREIGN KEY (usuario_id, categoria_id) REFERENCES categorias (usuario_id, id)
);

-- Índices das colunas filtradas e ordenadas na listagem; todos começam por usuario_id, que está em toda consulta.
CREATE INDEX idx_mov_competencia ON movimentacoes (usuario_id, data_competencia);
CREATE INDEX idx_mov_vencimento ON movimentacoes (usuario_id, data_vencimento);
CREATE INDEX idx_mov_liquidacao ON movimentacoes (usuario_id, data_liquidacao);
CREATE INDEX idx_mov_conta ON movimentacoes (usuario_id, conta_id, status);
CREATE INDEX idx_mov_destino ON movimentacoes (usuario_id, conta_destino_id);
CREATE INDEX idx_mov_categoria ON movimentacoes (usuario_id, categoria_id);
CREATE INDEX idx_mov_tipo_status ON movimentacoes (usuario_id, tipo, status);
CREATE INDEX idx_mov_transferencia ON movimentacoes (usuario_id, transferencia_id);
CREATE INDEX idx_mov_excluida ON movimentacoes (usuario_id, excluida_em);
CREATE INDEX idx_div_mov ON movimentacao_divisoes (usuario_id, movimentacao_id);
CREATE INDEX idx_div_categoria ON movimentacao_divisoes (usuario_id, categoria_id);
CREATE INDEX idx_contas_usuario ON contas (usuario_id, excluida_em);
