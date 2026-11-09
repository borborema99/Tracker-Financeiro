-- Múltiplas moedas (Fase 4, Onda 2). O BRL continua sendo a base de tudo: lançamentos, resumo, orçamento e relatórios
-- não mudam. Dinheiro em outra moeda vive em contas próprias (`contas_moeda`), com saldo na própria moeda.
-- Saldo, valor em reais e custo NÃO são colunas: saem de dominio/moeda.js. A cotação é informada pela pessoa.
-- Compra e venda de moeda com `conta_id` mexem no saldo da conta em reais, mas não são receita nem despesa.

CREATE TABLE contas_moeda (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  moeda TEXT NOT NULL CHECK (moeda IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'ARS', 'UYU', 'MXN')),
  saldo_inicial_centavos INTEGER NOT NULL DEFAULT 0 CHECK (saldo_inicial_centavos >= 0),
  observacao TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  excluido_em TEXT
);

CREATE TABLE moeda_operacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conta_moeda_id INTEGER NOT NULL REFERENCES contas_moeda (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('deposito', 'saque', 'compra', 'venda')),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  valor_brl_centavos INTEGER CHECK (valor_brl_centavos IS NULL OR valor_brl_centavos > 0),
  data TEXT NOT NULL,
  conta_id INTEGER REFERENCES contas (id),
  observacao TEXT NOT NULL DEFAULT '',
  criada_em TEXT NOT NULL,
  excluida_em TEXT,
  -- Compra e venda trocam dinheiro com uma conta em reais; depósito e saque não tocam em conta nenhuma.
  CHECK ((tipo IN ('compra', 'venda')) = (conta_id IS NOT NULL AND valor_brl_centavos IS NOT NULL)),
  CHECK (tipo IN ('compra', 'venda') OR (conta_id IS NULL AND valor_brl_centavos IS NULL))
);

-- Cotação informada à mão: reais por 1 unidade da moeda, em milionésimos (5,4321 vira 5432100).
CREATE TABLE moeda_cotacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  moeda TEXT NOT NULL CHECK (moeda IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'ARS', 'UYU', 'MXN')),
  data TEXT NOT NULL,
  taxa_micros INTEGER NOT NULL CHECK (taxa_micros > 0),
  criada_em TEXT NOT NULL,
  excluida_em TEXT
);

CREATE UNIQUE INDEX idx_moeda_cotacao_data ON moeda_cotacoes (moeda, data) WHERE excluida_em IS NULL;
CREATE INDEX idx_contas_moeda_excluido ON contas_moeda (excluido_em);
CREATE INDEX idx_moeda_op ON moeda_operacoes (conta_moeda_id, excluida_em);
CREATE INDEX idx_moeda_op_conta ON moeda_operacoes (conta_id);
