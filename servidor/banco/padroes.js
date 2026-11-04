import { gravarConfig, lerConfig } from './config-db.js';
import { criarCategoria } from './repositorios/categorias.js';

// PADRÕES A CONFIRMAR contra o escopo original (seções 2 e 3). Ver docs/adr/003-padroes-onda-1.md.
// São só o ponto de partida: tudo é editável na tela. Para mudar o padrão de quem ainda não
// instalou, edite esta lista; quem já semeou continua com o que tem (a semente roda uma vez).
export const CATEGORIAS_DESPESA = {
  Moradia: ['Aluguel ou financiamento', 'Condomínio', 'Energia', 'Água', 'Internet', 'Manutenção'],
  Alimentação: ['Mercado', 'Restaurantes', 'Delivery'],
  Transporte: ['Combustível', 'Transporte público', 'Aplicativos', 'Manutenção do veículo'],
  Saúde: ['Plano de saúde', 'Farmácia', 'Consultas e exames'],
  Educação: ['Mensalidade', 'Cursos', 'Material'],
  Lazer: ['Assinaturas e streaming', 'Viagens', 'Passeios'],
  Vestuário: [],
  'Cuidados pessoais': [],
  'Impostos e taxas': [],
  'Tarifas bancárias': [],
  'Outras despesas': [],
};

export const CATEGORIAS_RECEITA = {
  Salário: [],
  'Renda extra': ['Freelance', 'Vendas'],
  Rendimentos: [],
  Reembolsos: [],
  Presentes: [],
  'Outras receitas': [],
};

const CHAVE = 'padroes_semeados';

/** Cria as categorias padrão uma única vez (marcadas no config). Idempotente. */
export function semearPadroes(db, agora = new Date()) {
  if (lerConfig(db, CHAVE) === '1') return false;
  db.transaction(() => {
    for (const [tipo, grupo] of [['despesa', CATEGORIAS_DESPESA], ['receita', CATEGORIAS_RECEITA]]) {
      for (const [nome, filhas] of Object.entries(grupo)) {
        const papel = nome === 'Tarifas bancárias' ? 'tarifa' : null;
        const pai = criarCategoria(db, { nome, tipo, arquivada: false }, { agora, papel });
        for (const filha of filhas) {
          criarCategoria(db, { nome: filha, tipo, pai_id: pai.id, arquivada: false }, { agora });
        }
      }
    }
    gravarConfig(db, CHAVE, '1');
  })();
  return true;
}
