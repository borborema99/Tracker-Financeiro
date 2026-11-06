-- Planejamento (Fase 2): orçamentos por categoria e metas com aportes.
-- Valores em centavos inteiros; datas sem hora em AAAA-MM-DD; meses em AAAA-MM; exclusão lógica.
-- Gasto, restante, percentual e situação do orçamento NÃO são colunas: são calculados (dominio/orcamento.js).
-- Acumulado e situação da meta também são calculados (dominio/meta.js).

-- Limite mensal de uma categoria principal, com vigência: vale de `mes_inicio` até o próximo registro da mesma
-- categoria. Limite 0 = "sem orçamento a partir daquele mês". Meses anteriores nunca mudam.
CREATE TABLE orcamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria_id INTEGER NOT NULL REFERENCES categorias (id),
  mes_inicio TEXT NOT NULL CHECK (mes_inicio GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  limite_centavos INTEGER NOT NULL CHECK (limite_centavos >= 0),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  UNIQUE (categoria_id, mes_inicio)
);

-- Meta: reserva virtual. Aportes e resgates não alteram saldo de conta (RF-13).
CREATE TABLE metas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  valor_alvo_centavos INTEGER NOT NULL CHECK (valor_alvo_centavos > 0),
  prazo TEXT,
  observacao TEXT NOT NULL DEFAULT '',
  criada_em TEXT NOT NULL,
  atualizada_em TEXT NOT NULL,
  excluida_em TEXT
);

CREATE TABLE metas_aportes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meta_id INTEGER NOT NULL REFERENCES metas (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('aporte', 'resgate')),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  data TEXT NOT NULL,
  observacao TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  excluido_em TEXT
);

CREATE INDEX idx_orcamentos_categoria ON orcamentos (categoria_id, mes_inicio);
CREATE INDEX idx_metas_excluida ON metas (excluida_em);
CREATE INDEX idx_metas_aportes_meta ON metas_aportes (meta_id, excluido_em);
