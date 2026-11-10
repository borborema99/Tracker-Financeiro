/* global console */
import { abrirBanco } from '../../servidor/banco/pg/conexao.js';
import { lerAmbiente } from '../../servidor/config.js';
import { limparSessoesExpiradas } from '../../servidor/seguranca/sessao.js';
import { limparTentativasAntigas } from '../../servidor/seguranca/tentativas.js';

// Função agendada, uma vez por dia. Duas utilidades: a consulta diária mantém o projeto do Supabase ativo (o
// plano gratuito pausa bancos sem uso) e a limpeza tira sessões vencidas e contagens antigas de tentativas de login.
export default async function manutencao() {
  const { bancoUrl } = lerAmbiente();
  if (!bancoUrl) {
    console.error('Manutenção: DATABASE_URL ausente.');
    return;
  }
  const banco = abrirBanco(bancoUrl);
  try {
    await banco.consultar('SELECT 1');
    await limparSessoesExpiradas(banco);
    const tentativas = await limparTentativasAntigas(banco);
    console.log(`Manutenção diária concluída (${tentativas} contagens de login antigas removidas).`);
  } finally {
    await banco.fechar();
  }
}

export const config = { schedule: '@daily' };
