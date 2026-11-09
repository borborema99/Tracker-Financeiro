-- Investimentos (Fase 3, Onda 1). Carteira manual: o valor atual é informado pela pessoa (cotação automática
-- está fora por decisão). Aportado, resgatado, valor atual e resultado NÃO são colunas: saem de dominio/investimento.js.
-- Aporte e resgate com `conta_id` mexem no saldo da conta, mas não são receita nem despesa (como a transferência).

CREATE TABLE investimentos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('renda_fixa', 'tesouro', 'acoes', 'fii', 'fundo', 'cripto', 'previdencia', 'outro')),
  instituicao text NOT NULL DEFAULT '',
  observacao text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL,
  atualizado_em timestamptz NOT NULL,
  excluido_em timestamptz,
  UNIQUE (usuario_id, id)
);

CREATE TABLE investimentos_operacoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  investimento_id bigint NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('aporte', 'resgate')),
  valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
  data date NOT NULL,
  conta_id bigint,
  observacao text NOT NULL DEFAULT '',
  criada_em timestamptz NOT NULL,
  excluida_em timestamptz,
  FOREIGN KEY (usuario_id, investimento_id) REFERENCES investimentos (usuario_id, id),
  FOREIGN KEY (usuario_id, conta_id) REFERENCES contas (usuario_id, id)
);

-- Valor do investimento numa data, informado pela pessoa (extrato da corretora, por exemplo).
CREATE TABLE investimentos_avaliacoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  investimento_id bigint NOT NULL,
  data date NOT NULL,
  valor_centavos bigint NOT NULL CHECK (valor_centavos >= 0),
  criada_em timestamptz NOT NULL,
  excluida_em timestamptz,
  FOREIGN KEY (usuario_id, investimento_id) REFERENCES investimentos (usuario_id, id)
);

CREATE UNIQUE INDEX idx_inv_aval_data ON investimentos_avaliacoes (usuario_id, investimento_id, data) WHERE excluida_em IS NULL;
CREATE INDEX idx_inv_excluido ON investimentos (usuario_id, excluido_em);
CREATE INDEX idx_inv_op ON investimentos_operacoes (usuario_id, investimento_id, excluida_em);
CREATE INDEX idx_inv_op_conta ON investimentos_operacoes (usuario_id, conta_id);
