-- Múltiplas moedas (Fase 4, Onda 2). O BRL continua sendo a base de tudo: lançamentos, resumo, orçamento e relatórios
-- não mudam. Dinheiro em outra moeda vive em contas próprias (`contas_moeda`), com saldo na própria moeda.
-- Saldo, valor em reais e custo NÃO são colunas: saem de dominio/moeda.js. A cotação é informada pela pessoa.
-- Compra e venda de moeda com `conta_id` mexem no saldo da conta em reais, mas não são receita nem despesa.

CREATE TABLE contas_moeda (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  nome text NOT NULL,
  moeda text NOT NULL CHECK (moeda IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'ARS', 'UYU', 'MXN')),
  saldo_inicial_centavos bigint NOT NULL DEFAULT 0 CHECK (saldo_inicial_centavos >= 0),
  observacao text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL,
  atualizado_em timestamptz NOT NULL,
  excluido_em timestamptz,
  UNIQUE (usuario_id, id)
);

CREATE TABLE moeda_operacoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  conta_moeda_id bigint NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('deposito', 'saque', 'compra', 'venda')),
  valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
  valor_brl_centavos bigint CHECK (valor_brl_centavos IS NULL OR valor_brl_centavos > 0),
  data date NOT NULL,
  conta_id bigint,
  observacao text NOT NULL DEFAULT '',
  criada_em timestamptz NOT NULL,
  excluida_em timestamptz,
  FOREIGN KEY (usuario_id, conta_moeda_id) REFERENCES contas_moeda (usuario_id, id),
  FOREIGN KEY (usuario_id, conta_id) REFERENCES contas (usuario_id, id),
  -- Compra e venda trocam dinheiro com uma conta em reais; depósito e saque não tocam em conta nenhuma.
  CHECK ((tipo IN ('compra', 'venda')) = (conta_id IS NOT NULL AND valor_brl_centavos IS NOT NULL)),
  CHECK (tipo IN ('compra', 'venda') OR (conta_id IS NULL AND valor_brl_centavos IS NULL))
);

-- Cotação informada à mão: reais por 1 unidade da moeda, em milionésimos (5,4321 vira 5432100).
CREATE TABLE moeda_cotacoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  moeda text NOT NULL CHECK (moeda IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'ARS', 'UYU', 'MXN')),
  data date NOT NULL,
  taxa_micros bigint NOT NULL CHECK (taxa_micros > 0),
  criada_em timestamptz NOT NULL,
  excluida_em timestamptz
);

CREATE UNIQUE INDEX idx_moeda_cotacao_data ON moeda_cotacoes (usuario_id, moeda, data) WHERE excluida_em IS NULL;
CREATE INDEX idx_contas_moeda_excluido ON contas_moeda (usuario_id, excluido_em);
CREATE INDEX idx_moeda_op ON moeda_operacoes (usuario_id, conta_moeda_id, excluida_em);
CREATE INDEX idx_moeda_op_conta ON moeda_operacoes (usuario_id, conta_id);
