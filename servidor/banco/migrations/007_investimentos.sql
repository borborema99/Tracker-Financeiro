-- Investimentos (Fase 3, Onda 1). Carteira manual: o valor atual é informado pela pessoa (cotação automática
-- é Fase 4). Aportado, resgatado, valor atual e resultado NÃO são colunas: saem de dominio/investimento.js.
-- Aporte e resgate com `conta_id` mexem no saldo da conta, mas não são receita nem despesa (como a transferência).

CREATE TABLE investimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('renda_fixa', 'tesouro', 'acoes', 'fii', 'fundo', 'cripto', 'previdencia', 'outro')),
  instituicao TEXT NOT NULL DEFAULT '',
  observacao TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  excluido_em TEXT
);

CREATE TABLE investimentos_operacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investimento_id INTEGER NOT NULL REFERENCES investimentos (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('aporte', 'resgate')),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  data TEXT NOT NULL,
  conta_id INTEGER REFERENCES contas (id),
  observacao TEXT NOT NULL DEFAULT '',
  criada_em TEXT NOT NULL,
  excluida_em TEXT
);

-- Valor do investimento numa data, informado pela pessoa (extrato da corretora, por exemplo).
CREATE TABLE investimentos_avaliacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investimento_id INTEGER NOT NULL REFERENCES investimentos (id),
  data TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  criada_em TEXT NOT NULL,
  excluida_em TEXT
);

CREATE UNIQUE INDEX idx_inv_aval_data ON investimentos_avaliacoes (investimento_id, data) WHERE excluida_em IS NULL;
CREATE INDEX idx_inv_excluido ON investimentos (excluido_em);
CREATE INDEX idx_inv_op ON investimentos_operacoes (investimento_id, excluida_em);
CREATE INDEX idx_inv_op_conta ON investimentos_operacoes (conta_id);
