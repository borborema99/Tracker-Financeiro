-- Infraestrutura (Postgres, multiusuário): usuários, sessões, limite de tentativas, configuração e histórico.
-- Convenções de todas as migrations desta pasta (ADR 013):
--   * dinheiro em centavos, `bigint`; o driver converte para Number na leitura (tests/pg-tipos.test.js);
--   * datas sem hora em `date` (o driver devolve texto AAAA-MM-DD); instantes em `timestamptz`;
--   * toda tabela de dados tem `usuario_id NOT NULL` e as chaves estrangeiras entre dados são COMPOSTAS com
--     `usuario_id`: referenciar dado de outra pessoa é impossível no banco, não só na consulta;
--   * exclusão lógica (`excluida_em`) como antes; saldo e totais não são colunas.

CREATE TABLE usuarios (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome_usuario text NOT NULL CHECK (nome_usuario ~ '^[A-Za-z0-9._-]{3,32}$'),
  senha_hash text NOT NULL,
  -- Só o usuário de demonstração (npm run demo) vê a faixa "dados de demonstração".
  demo boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL,
  atualizado_em timestamptz NOT NULL
);

-- Nome de usuário único sem diferenciar maiúsculas.
CREATE UNIQUE INDEX idx_usuarios_nome ON usuarios (lower(nome_usuario));

-- Só o SHA-256 do token fica no banco. Todas as sessões de um usuário caem junto com a conta.
CREATE TABLE sessoes (
  id_hash text PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  criada_em timestamptz NOT NULL,
  expira_em timestamptz NOT NULL
);

CREATE INDEX idx_sessoes_usuario ON sessoes (usuario_id);
CREATE INDEX idx_sessoes_expira ON sessoes (expira_em);

-- Contagem de erros de senha. Chaves: `usuario:<nome em minúsculas>` e `ip:<HMAC do IP>` (o IP nunca é gravado
-- em claro). Fica no banco porque as funções do Netlify não compartilham memória. Não tem usuario_id: vale
-- também para nomes que não existem, para a resposta ser a mesma.
CREATE TABLE tentativas_login (
  chave text PRIMARY KEY,
  erros integer NOT NULL DEFAULT 0,
  bloqueado_ate timestamptz,
  atualizado_em timestamptz NOT NULL
);

CREATE TABLE config (
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  chave text NOT NULL,
  valor text NOT NULL,
  PRIMARY KEY (usuario_id, chave)
);

CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  entidade text NOT NULL,
  entidade_id text NOT NULL,
  acao text NOT NULL CHECK (acao IN ('criar', 'editar', 'excluir', 'restaurar')),
  antes jsonb,
  depois jsonb,
  criado_em timestamptz NOT NULL
);

CREATE INDEX idx_audit_entidade ON audit_log (usuario_id, entidade, entidade_id, id);
