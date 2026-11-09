-- Planejamento (Fase 2): orçamentos por categoria e metas com aportes.
-- Meses em AAAA-MM (texto validado); datas em `date`; exclusão lógica.
-- Gasto, restante, percentual e situação do orçamento NÃO são colunas: são calculados (dominio/orcamento.js).
-- Acumulado e situação da meta também são calculados (dominio/meta.js).

-- Limite mensal de uma categoria principal, com vigência: vale de `mes_inicio` até o próximo registro da mesma
-- categoria. Limite 0 = "sem orçamento a partir daquele mês". Meses anteriores nunca mudam.
CREATE TABLE orcamentos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  categoria_id bigint NOT NULL,
  mes_inicio text NOT NULL CHECK (mes_inicio ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  limite_centavos bigint NOT NULL CHECK (limite_centavos >= 0),
  criado_em timestamptz NOT NULL,
  atualizado_em timestamptz NOT NULL,
  UNIQUE (usuario_id, categoria_id, mes_inicio),
  FOREIGN KEY (usuario_id, categoria_id) REFERENCES categorias (usuario_id, id)
);

-- Meta: reserva virtual. Aportes e resgates não alteram saldo de conta (RF-13).
CREATE TABLE metas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  nome text NOT NULL,
  valor_alvo_centavos bigint NOT NULL CHECK (valor_alvo_centavos > 0),
  prazo date,
  observacao text NOT NULL DEFAULT '',
  criada_em timestamptz NOT NULL,
  atualizada_em timestamptz NOT NULL,
  excluida_em timestamptz,
  UNIQUE (usuario_id, id)
);

CREATE TABLE metas_aportes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  meta_id bigint NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('aporte', 'resgate')),
  valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
  data date NOT NULL,
  observacao text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL,
  excluido_em timestamptz,
  FOREIGN KEY (usuario_id, meta_id) REFERENCES metas (usuario_id, id)
);

CREATE INDEX idx_orcamentos_categoria ON orcamentos (usuario_id, categoria_id, mes_inicio);
CREATE INDEX idx_metas_excluida ON metas (usuario_id, excluida_em);
CREATE INDEX idx_metas_aportes_meta ON metas_aportes (usuario_id, meta_id, excluido_em);
