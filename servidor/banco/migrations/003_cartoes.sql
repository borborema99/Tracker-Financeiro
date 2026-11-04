-- Cartões de crédito: faturas, compras (à vista e parceladas), estornos e pagamentos de fatura.
-- Valores em centavos inteiros; datas sem hora em AAAA-MM-DD; exclusão lógica.
-- O limite disponível e o total da fatura NÃO são colunas: são calculados (servidor/dominio/cartao.js).

CREATE TABLE cartoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  limite_centavos INTEGER NOT NULL CHECK (limite_centavos >= 0),
  -- Dias 1 a 28 existem em todos os meses, então não há dia "31" para tratar.
  dia_fechamento INTEGER NOT NULL CHECK (dia_fechamento BETWEEN 1 AND 28),
  dia_vencimento INTEGER NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 28),
  conta_pagamento_id INTEGER REFERENCES contas (id),
  arquivado INTEGER NOT NULL DEFAULT 0 CHECK (arquivado IN (0, 1)),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  excluido_em TEXT
);

-- Uma fatura por cartão e mês de fechamento (referencia AAAA-MM). Nasce quando a primeira linha cai nela e
-- guarda as datas daquele ciclo: mudar o dia de fechamento do cartão só vale para as faturas novas.
CREATE TABLE faturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cartao_id INTEGER NOT NULL REFERENCES cartoes (id),
  referencia TEXT NOT NULL,
  data_fechamento TEXT NOT NULL,
  data_vencimento TEXT NOT NULL,
  criada_em TEXT NOT NULL,
  UNIQUE (cartao_id, referencia)
);

CREATE TABLE compras_cartao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cartao_id INTEGER NOT NULL REFERENCES cartoes (id),
  descricao TEXT NOT NULL DEFAULT '',
  valor_total_centavos INTEGER NOT NULL CHECK (valor_total_centavos > 0),
  categoria_id INTEGER REFERENCES categorias (id),
  data_compra TEXT NOT NULL,
  parcelas_total INTEGER NOT NULL CHECK (parcelas_total BETWEEN 1 AND 48),
  observacao TEXT NOT NULL DEFAULT '',
  criada_em TEXT NOT NULL,
  atualizada_em TEXT NOT NULL,
  excluida_em TEXT
);

CREATE TABLE parcelas_cartao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras_cartao (id),
  numero INTEGER NOT NULL CHECK (numero >= 1),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  fatura_id INTEGER NOT NULL REFERENCES faturas (id),
  UNIQUE (compra_id, numero)
);

-- Estorno: crédito que abate a fatura em que cai e reduz a despesa realizada na data do estorno.
CREATE TABLE estornos_cartao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras_cartao (id),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  data_estorno TEXT NOT NULL,
  fatura_id INTEGER NOT NULL REFERENCES faturas (id),
  descricao TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  excluido_em TEXT
);

-- Pagar a fatura debita a conta e abate a fatura. Não é despesa nova (RF-04).
CREATE TABLE pagamentos_fatura (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fatura_id INTEGER NOT NULL REFERENCES faturas (id),
  conta_id INTEGER NOT NULL REFERENCES contas (id),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  data_pagamento TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  excluido_em TEXT
);

CREATE INDEX idx_faturas_cartao ON faturas (cartao_id, referencia);
CREATE INDEX idx_compras_cartao ON compras_cartao (cartao_id, data_compra);
CREATE INDEX idx_compras_categoria ON compras_cartao (categoria_id);
CREATE INDEX idx_compras_excluida ON compras_cartao (excluida_em);
CREATE INDEX idx_parcelas_compra ON parcelas_cartao (compra_id);
CREATE INDEX idx_parcelas_fatura ON parcelas_cartao (fatura_id);
CREATE INDEX idx_estornos_compra ON estornos_cartao (compra_id);
CREATE INDEX idx_estornos_fatura ON estornos_cartao (fatura_id);
CREATE INDEX idx_estornos_data ON estornos_cartao (data_estorno);
CREATE INDEX idx_pagamentos_fatura ON pagamentos_fatura (fatura_id);
CREATE INDEX idx_pagamentos_conta ON pagamentos_fatura (conta_id);

-- Reembolso: receita ligada à despesa original (RF-05).
ALTER TABLE movimentacoes ADD COLUMN reembolso_de_id INTEGER REFERENCES movimentacoes (id);
CREATE INDEX idx_mov_reembolso ON movimentacoes (reembolso_de_id);
