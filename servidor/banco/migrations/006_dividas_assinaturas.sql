-- Dívidas e assinaturas (Fase 2, Onda 2).
-- A dívida gera suas parcelas como despesas PENDENTES em `movimentacoes` (divida_id + divida_parcela), então
-- atraso (RF-07), fluxo, projeção, alertas e orçamento funcionam sem caso especial.
-- Saldo devedor, valor pago e situação NÃO são colunas: são calculados dos lançamentos (dominio/divida.js).
-- Assinatura é uma recorrência de despesa marcada com `assinatura = 1`; custo mensal e anual são calculados.

CREATE TABLE dividas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  credor TEXT NOT NULL DEFAULT '',
  parcelas_total INTEGER NOT NULL CHECK (parcelas_total BETWEEN 1 AND 360),
  valor_total_centavos INTEGER NOT NULL CHECK (valor_total_centavos > 0),
  primeiro_vencimento TEXT NOT NULL,
  conta_id INTEGER NOT NULL REFERENCES contas (id),
  categoria_id INTEGER REFERENCES categorias (id),
  observacao TEXT NOT NULL DEFAULT '',
  criada_em TEXT NOT NULL,
  atualizada_em TEXT NOT NULL,
  excluida_em TEXT
);

ALTER TABLE movimentacoes ADD COLUMN divida_id INTEGER REFERENCES dividas (id);
ALTER TABLE movimentacoes ADD COLUMN divida_parcela INTEGER;
CREATE INDEX idx_mov_divida ON movimentacoes (divida_id);
CREATE INDEX idx_dividas_excluida ON dividas (excluida_em);

ALTER TABLE recorrencias ADD COLUMN assinatura INTEGER NOT NULL DEFAULT 0 CHECK (assinatura IN (0, 1));
