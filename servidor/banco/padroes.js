import { gravarConfig, lerConfig } from './config-db.js';
import { criarCategoria } from './repositorios/categorias.js';

// Categorias e subcategorias padrão (seções 2 e 3 do escopo). São só o ponto de partida: tudo é
// editável na tela. Cada usuário recebe a lista inteira uma vez, ao ser criado (ADR 013).
export const CATEGORIAS_DESPESA = {
  Moradia: ['Aluguel ou financiamento', 'Condomínio', 'Energia', 'Água', 'Gás', 'Internet', 'Manutenção', 'Móveis e eletrodomésticos'],
  Alimentação: ['Mercado', 'Padaria e feira', 'Restaurantes', 'Delivery'],
  Transporte: ['Combustível', 'Transporte público', 'Aplicativos', 'Manutenção do veículo', 'Estacionamento e pedágio', 'IPVA e licenciamento'],
  Saúde: ['Plano de saúde', 'Farmácia', 'Consultas e exames', 'Dentista', 'Terapia'],
  Educação: ['Mensalidade', 'Cursos', 'Material', 'Livros'],
  Lazer: ['Assinaturas e streaming', 'Viagens', 'Passeios', 'Cinema e shows', 'Jogos e hobbies'],
  Vestuário: [],
  'Cuidados pessoais': ['Cabeleireiro e estética'],
  'Família e filhos': ['Escola e creche', 'Mesada'],
  'Animais de estimação': ['Ração e petshop', 'Veterinário'],
  Seguros: ['Seguro de vida', 'Seguro residencial', 'Seguro do veículo'],
  Doações: [],
  'Dívidas e juros': [],
  'Impostos e taxas': ['IPTU', 'Imposto de renda'],
  'Tarifas bancárias': [],
  'Outras despesas': [],
};

export const CATEGORIAS_RECEITA = {
  Salário: ['13º salário', 'Férias'],
  'Renda extra': ['Freelance', 'Vendas'],
  Rendimentos: ['Juros e dividendos', 'Aluguéis recebidos'],
  Benefícios: ['Vale-alimentação ou refeição'],
  Reembolsos: [],
  Presentes: [],
  'Outras receitas': [],
};

const CHAVE = 'padroes_semeados';

/** Cria as categorias padrão uma única vez (marcadas no config). Idempotente. */
export async function semearPadroes(esc, agora = new Date()) {
  if ((await lerConfig(esc, CHAVE)) === '1') return false;
  await esc.transacao(async (tx) => {
    for (const [tipo, grupo] of [['despesa', CATEGORIAS_DESPESA], ['receita', CATEGORIAS_RECEITA]]) {
      for (const [nome, filhas] of Object.entries(grupo)) {
        const papel = nome === 'Tarifas bancárias' ? 'tarifa' : null;
        const pai = await criarCategoria(tx, { nome, tipo, arquivada: false }, { agora, papel });
        for (const filha of filhas) {
          await criarCategoria(tx, { nome: filha, tipo, pai_id: pai.id, arquivada: false }, { agora });
        }
      }
    }
    await gravarConfig(tx, CHAVE, '1');
  });
  return true;
}
