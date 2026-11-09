-- migrar: sem-chaves-estrangeiras
-- Resolve os [PENDENTE] do ADR 002 (encerrado pelo ADR 012):
--   1. tipos de conta da seção 4 do escopo: acrescenta digital, beneficio e outro;
--   2. categorias e subcategorias padrão das seções 2 e 3: acrescenta as que faltam.
-- A primeira linha pede ao runner para desligar as chaves estrangeiras durante a migration e conferi-las
-- no fim (reconstruir `contas` exige foreign_keys desligado). Nada aqui apaga ou renomeia dado existente.

-- 1. Tipos de conta. O SQLite não altera CHECK: reconstrói a tabela com as mesmas colunas e ids.
CREATE TABLE contas_nova (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('corrente', 'poupanca', 'carteira', 'investimento', 'digital', 'beneficio', 'outro')),
  saldo_inicial_centavos INTEGER NOT NULL DEFAULT 0,
  arquivada INTEGER NOT NULL DEFAULT 0 CHECK (arquivada IN (0, 1)),
  criada_em TEXT NOT NULL,
  atualizada_em TEXT NOT NULL,
  excluida_em TEXT
);

INSERT INTO contas_nova (id, nome, tipo, saldo_inicial_centavos, arquivada, criada_em, atualizada_em, excluida_em)
SELECT id, nome, tipo, saldo_inicial_centavos, arquivada, criada_em, atualizada_em, excluida_em FROM contas;

DROP TABLE contas;
ALTER TABLE contas_nova RENAME TO contas;

-- 2. Categorias e subcategorias padrão. A lista abaixo traz SÓ o que a semente antiga (Onda 1) não criava.
-- O que já existia, mesmo renomeado, arquivado ou excluído pela pessoa, não é tocado nem recriado.
-- Só entra em banco que já foi semeado (config padroes_semeados = 1); em banco novo quem cria tudo é
-- servidor/banco/padroes.js, que tem a lista completa (tests/padroes-migration.test.js confere as duas).
-- Subcategoria nova só entra se a categoria pai (mesmo nome, ainda não excluída) existir.
CREATE TEMP TABLE padrao_cat (pai TEXT, nome TEXT NOT NULL, tipo TEXT NOT NULL);

INSERT INTO padrao_cat (pai, nome, tipo) VALUES
  (NULL, 'Família e filhos', 'despesa'),
  (NULL, 'Animais de estimação', 'despesa'),
  (NULL, 'Seguros', 'despesa'),
  (NULL, 'Doações', 'despesa'),
  (NULL, 'Dívidas e juros', 'despesa'),
  (NULL, 'Benefícios', 'receita'),
  ('Moradia', 'Gás', 'despesa'),
  ('Moradia', 'Móveis e eletrodomésticos', 'despesa'),
  ('Alimentação', 'Padaria e feira', 'despesa'),
  ('Transporte', 'Estacionamento e pedágio', 'despesa'),
  ('Transporte', 'IPVA e licenciamento', 'despesa'),
  ('Saúde', 'Dentista', 'despesa'),
  ('Saúde', 'Terapia', 'despesa'),
  ('Educação', 'Livros', 'despesa'),
  ('Lazer', 'Cinema e shows', 'despesa'),
  ('Lazer', 'Jogos e hobbies', 'despesa'),
  ('Cuidados pessoais', 'Cabeleireiro e estética', 'despesa'),
  ('Família e filhos', 'Escola e creche', 'despesa'),
  ('Família e filhos', 'Mesada', 'despesa'),
  ('Animais de estimação', 'Ração e petshop', 'despesa'),
  ('Animais de estimação', 'Veterinário', 'despesa'),
  ('Seguros', 'Seguro de vida', 'despesa'),
  ('Seguros', 'Seguro residencial', 'despesa'),
  ('Seguros', 'Seguro do veículo', 'despesa'),
  ('Impostos e taxas', 'IPTU', 'despesa'),
  ('Impostos e taxas', 'Imposto de renda', 'despesa'),
  ('Salário', '13º salário', 'receita'),
  ('Salário', 'Férias', 'receita'),
  ('Rendimentos', 'Juros e dividendos', 'receita'),
  ('Rendimentos', 'Aluguéis recebidos', 'receita'),
  ('Benefícios', 'Vale-alimentação ou refeição', 'receita');

CREATE TEMP TABLE marca_categorias AS SELECT COALESCE(MAX(id), 0) AS maior_id FROM categorias;

INSERT INTO categorias (nome, tipo, pai_id, papel, arquivada, criada_em, atualizada_em)
SELECT d.nome, d.tipo, NULL, NULL, 0,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM padrao_cat d
WHERE d.pai IS NULL
  AND EXISTS (SELECT 1 FROM config WHERE chave = 'padroes_semeados' AND valor = '1')
  AND NOT EXISTS (
    SELECT 1 FROM categorias c
    WHERE c.pai_id IS NULL AND c.tipo = d.tipo AND c.nome = d.nome COLLATE NOCASE
  );

INSERT INTO categorias (nome, tipo, pai_id, papel, arquivada, criada_em, atualizada_em)
SELECT d.nome, d.tipo, p.id, NULL, 0,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM padrao_cat d
JOIN categorias p
  ON p.pai_id IS NULL AND p.tipo = d.tipo AND p.nome = d.pai COLLATE NOCASE AND p.excluida_em IS NULL
WHERE d.pai IS NOT NULL
  AND EXISTS (SELECT 1 FROM config WHERE chave = 'padroes_semeados' AND valor = '1')
  AND NOT EXISTS (
    SELECT 1 FROM categorias c
    WHERE c.pai_id = p.id AND c.nome = d.nome COLLATE NOCASE
  );

-- Toda escrita grava em audit_log, na mesma transação.
INSERT INTO audit_log (entidade, entidade_id, acao, antes, depois, criado_em)
SELECT 'categoria', CAST(c.id AS TEXT), 'criar', NULL,
  json_object('id', c.id, 'nome', c.nome, 'tipo', c.tipo, 'pai_id', c.pai_id, 'papel', c.papel, 'arquivada', 0),
  c.criada_em
FROM categorias c
WHERE c.id > (SELECT maior_id FROM marca_categorias);

DROP TABLE marca_categorias;
DROP TABLE padrao_cat;
