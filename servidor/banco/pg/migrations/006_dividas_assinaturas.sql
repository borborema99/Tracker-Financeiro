-- Dívidas e assinaturas (Fase 2, Onda 2).
-- A dívida gera suas parcelas como despesas PENDENTES em `movimentacoes` (divida_id + divida_parcela), então
-- atraso (RF-07), fluxo, projeção, alertas e orçamento funcionam sem caso especial.
-- Saldo devedor, valor pago e situação NÃO são colunas: são calculados dos lançamentos (dominio/divida.js).
-- Assinatura é uma recorrência de despesa marcada com `assinatura = true`; custo mensal e anual são calculados.

CREATE TABLE dividas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  nome text NOT NULL,
  credor text NOT NULL DEFAULT '',
  parcelas_total integer NOT NULL CHECK (parcelas_total BETWEEN 1 AND 360),
  valor_total_centavos bigint NOT NULL CHECK (valor_total_centavos > 0),
  primeiro_vencimento date NOT NULL,
  conta_id bigint NOT NULL,
  categoria_id bigint,
  observacao text NOT NULL DEFAULT '',
  criada_em timestamptz NOT NULL,
  atualizada_em timestamptz NOT NULL,
  excluida_em timestamptz,
  UNIQUE (usuario_id, id),
  FOREIGN KEY (usuario_id, conta_id) REFERENCES contas (usuario_id, id),
  FOREIGN KEY (usuario_id, categoria_id) REFERENCES categorias (usuario_id, id)
);

ALTER TABLE movimentacoes ADD COLUMN divida_id bigint;
ALTER TABLE movimentacoes ADD COLUMN divida_parcela integer;
ALTER TABLE movimentacoes ADD FOREIGN KEY (usuario_id, divida_id) REFERENCES dividas (usuario_id, id);
CREATE INDEX idx_mov_divida ON movimentacoes (usuario_id, divida_id);
CREATE INDEX idx_dividas_excluida ON dividas (usuario_id, excluida_em);
CREATE INDEX idx_dividas_conta ON dividas (usuario_id, conta_id);
CREATE INDEX idx_dividas_categoria ON dividas (usuario_id, categoria_id);

ALTER TABLE recorrencias ADD COLUMN assinatura boolean NOT NULL DEFAULT false;
