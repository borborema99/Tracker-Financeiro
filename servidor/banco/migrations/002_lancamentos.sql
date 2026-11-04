-- Contas, categorias e movimentações (receita, despesa, transferência).
-- Valores em centavos inteiros. Datas sem hora em AAAA-MM-DD. Timestamps em UTC (ISO).
-- Exclusão é lógica (excluida_em). Saldo NÃO é coluna: é calculado das movimentações liquidadas.

CREATE TABLE contas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('corrente', 'poupanca', 'carteira', 'investimento')),
  saldo_inicial_centavos INTEGER NOT NULL DEFAULT 0,
  arquivada INTEGER NOT NULL DEFAULT 0 CHECK (arquivada IN (0, 1)),
  criada_em TEXT NOT NULL,
  atualizada_em TEXT NOT NULL,
  excluida_em TEXT
);

CREATE TABLE categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('despesa', 'receita')),
  pai_id INTEGER REFERENCES categorias (id),
  papel TEXT CHECK (papel IN ('tarifa')),
  arquivada INTEGER NOT NULL DEFAULT 0 CHECK (arquivada IN (0, 1)),
  criada_em TEXT NOT NULL,
  atualizada_em TEXT NOT NULL,
  excluida_em TEXT
);

CREATE INDEX idx_categorias_pai ON categorias (pai_id);

CREATE TABLE movimentacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa', 'transferencia')),
  descricao TEXT NOT NULL DEFAULT '',
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  conta_id INTEGER NOT NULL REFERENCES contas (id),
  conta_destino_id INTEGER REFERENCES contas (id),
  categoria_id INTEGER REFERENCES categorias (id),
  data_competencia TEXT NOT NULL,
  data_vencimento TEXT,
  data_liquidacao TEXT,
  status TEXT NOT NULL CHECK (status IN ('pendente', 'liquidada')),
  observacao TEXT NOT NULL DEFAULT '',
  -- Tarifa de uma transferência: despesa vinculada à transferência (RF-03).
  transferencia_id INTEGER REFERENCES movimentacoes (id),
  criada_em TEXT NOT NULL,
  atualizada_em TEXT NOT NULL,
  excluida_em TEXT,
  CHECK ((status = 'liquidada') = (data_liquidacao IS NOT NULL)),
  CHECK (tipo <> 'transferencia' OR (conta_destino_id IS NOT NULL AND conta_destino_id <> conta_id AND categoria_id IS NULL)),
  CHECK (tipo = 'transferencia' OR conta_destino_id IS NULL)
);

CREATE TABLE movimentacao_divisoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movimentacao_id INTEGER NOT NULL REFERENCES movimentacoes (id),
  categoria_id INTEGER NOT NULL REFERENCES categorias (id),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0)
);

-- Índices das colunas filtradas e ordenadas na listagem.
CREATE INDEX idx_mov_competencia ON movimentacoes (data_competencia);
CREATE INDEX idx_mov_vencimento ON movimentacoes (data_vencimento);
CREATE INDEX idx_mov_liquidacao ON movimentacoes (data_liquidacao);
CREATE INDEX idx_mov_conta ON movimentacoes (conta_id, status);
CREATE INDEX idx_mov_destino ON movimentacoes (conta_destino_id);
CREATE INDEX idx_mov_categoria ON movimentacoes (categoria_id);
CREATE INDEX idx_mov_tipo_status ON movimentacoes (tipo, status);
CREATE INDEX idx_mov_valor ON movimentacoes (valor_centavos);
CREATE INDEX idx_mov_transferencia ON movimentacoes (transferencia_id);
CREATE INDEX idx_mov_excluida ON movimentacoes (excluida_em);
CREATE INDEX idx_div_mov ON movimentacao_divisoes (movimentacao_id);
CREATE INDEX idx_div_categoria ON movimentacao_divisoes (categoria_id);
