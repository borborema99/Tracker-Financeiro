-- Cartões de crédito: faturas, compras (à vista e parceladas), estornos e pagamentos de fatura.
-- O limite disponível e o total da fatura NÃO são colunas: são calculados (servidor/dominio/cartao.js).

CREATE TABLE cartoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  nome text NOT NULL,
  limite_centavos bigint NOT NULL CHECK (limite_centavos >= 0),
  -- Dias 1 a 28 existem em todos os meses, então não há dia "31" para tratar.
  dia_fechamento integer NOT NULL CHECK (dia_fechamento BETWEEN 1 AND 28),
  dia_vencimento integer NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 28),
  conta_pagamento_id bigint,
  arquivado boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL,
  atualizado_em timestamptz NOT NULL,
  excluido_em timestamptz,
  UNIQUE (usuario_id, id),
  FOREIGN KEY (usuario_id, conta_pagamento_id) REFERENCES contas (usuario_id, id)
);

-- Uma fatura por cartão e mês de fechamento (referencia AAAA-MM). Nasce quando a primeira linha cai nela e
-- guarda as datas daquele ciclo: mudar o dia de fechamento do cartão só vale para as faturas novas.
CREATE TABLE faturas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  cartao_id bigint NOT NULL,
  referencia text NOT NULL CHECK (referencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  data_fechamento date NOT NULL,
  data_vencimento date NOT NULL,
  criada_em timestamptz NOT NULL,
  UNIQUE (usuario_id, id),
  UNIQUE (usuario_id, cartao_id, referencia),
  FOREIGN KEY (usuario_id, cartao_id) REFERENCES cartoes (usuario_id, id)
);

CREATE TABLE compras_cartao (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  cartao_id bigint NOT NULL,
  descricao text NOT NULL DEFAULT '',
  valor_total_centavos bigint NOT NULL CHECK (valor_total_centavos > 0),
  categoria_id bigint,
  data_compra date NOT NULL,
  parcelas_total integer NOT NULL CHECK (parcelas_total BETWEEN 1 AND 48),
  observacao text NOT NULL DEFAULT '',
  criada_em timestamptz NOT NULL,
  atualizada_em timestamptz NOT NULL,
  excluida_em timestamptz,
  UNIQUE (usuario_id, id),
  FOREIGN KEY (usuario_id, cartao_id) REFERENCES cartoes (usuario_id, id),
  FOREIGN KEY (usuario_id, categoria_id) REFERENCES categorias (usuario_id, id)
);

CREATE TABLE parcelas_cartao (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  compra_id bigint NOT NULL,
  numero integer NOT NULL CHECK (numero >= 1),
  valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
  fatura_id bigint NOT NULL,
  UNIQUE (usuario_id, compra_id, numero),
  FOREIGN KEY (usuario_id, compra_id) REFERENCES compras_cartao (usuario_id, id),
  FOREIGN KEY (usuario_id, fatura_id) REFERENCES faturas (usuario_id, id)
);

-- Estorno: crédito que abate a fatura em que cai e reduz a despesa realizada na data do estorno.
CREATE TABLE estornos_cartao (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  compra_id bigint NOT NULL,
  valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
  data_estorno date NOT NULL,
  fatura_id bigint NOT NULL,
  descricao text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL,
  excluido_em timestamptz,
  FOREIGN KEY (usuario_id, compra_id) REFERENCES compras_cartao (usuario_id, id),
  FOREIGN KEY (usuario_id, fatura_id) REFERENCES faturas (usuario_id, id)
);

-- Pagar a fatura debita a conta e abate a fatura. Não é despesa nova (RF-04).
CREATE TABLE pagamentos_fatura (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  fatura_id bigint NOT NULL,
  conta_id bigint NOT NULL,
  valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
  data_pagamento date NOT NULL,
  criado_em timestamptz NOT NULL,
  excluido_em timestamptz,
  FOREIGN KEY (usuario_id, fatura_id) REFERENCES faturas (usuario_id, id),
  FOREIGN KEY (usuario_id, conta_id) REFERENCES contas (usuario_id, id)
);

CREATE INDEX idx_cartoes_usuario ON cartoes (usuario_id, excluido_em);
CREATE INDEX idx_cartoes_conta ON cartoes (usuario_id, conta_pagamento_id);
CREATE INDEX idx_compras_cartao ON compras_cartao (usuario_id, cartao_id, data_compra);
CREATE INDEX idx_compras_categoria ON compras_cartao (usuario_id, categoria_id);
CREATE INDEX idx_compras_excluida ON compras_cartao (usuario_id, excluida_em);
CREATE INDEX idx_parcelas_compra ON parcelas_cartao (usuario_id, compra_id);
CREATE INDEX idx_parcelas_fatura ON parcelas_cartao (usuario_id, fatura_id);
CREATE INDEX idx_estornos_compra ON estornos_cartao (usuario_id, compra_id);
CREATE INDEX idx_estornos_fatura ON estornos_cartao (usuario_id, fatura_id);
CREATE INDEX idx_estornos_data ON estornos_cartao (usuario_id, data_estorno);
CREATE INDEX idx_pagamentos_fatura ON pagamentos_fatura (usuario_id, fatura_id);
CREATE INDEX idx_pagamentos_conta ON pagamentos_fatura (usuario_id, conta_id);

-- Reembolso: receita ligada à despesa original (RF-05).
ALTER TABLE movimentacoes ADD COLUMN reembolso_de_id bigint;
ALTER TABLE movimentacoes ADD FOREIGN KEY (usuario_id, reembolso_de_id) REFERENCES movimentacoes (usuario_id, id);
CREATE INDEX idx_mov_reembolso ON movimentacoes (usuario_id, reembolso_de_id);
