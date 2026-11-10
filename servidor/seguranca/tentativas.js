import { createHmac } from 'node:crypto';

export const MAX_ERROS = 5;
export const BLOQUEIO_MS = 15 * 60 * 1000;

// Contagem de erros de senha, no banco (funções do Netlify não compartilham memória), por duas chaves ao mesmo
// tempo: `usuario:<nome em minúsculas>` e `ip:<HMAC do IP>`. O IP nunca é gravado em claro. Vale também para nomes
// que não existem, para a resposta ser a mesma.

export const chaveDoUsuario = (nome) => `usuario:${nome.trim().toLowerCase()}`;

export const chaveDoIp = (ip, chaveHmac) =>
  `ip:${createHmac('sha256', chaveHmac).update(String(ip ?? 'desconhecido')).digest('base64url')}`;

/**
 * Maior tempo de bloqueio entre as chaves: { bloqueado, segundos }. Bloqueio vencido é limpo. Chaves sem erro
 * novo há mais de 15 minutos não contam (ver registrarErro).
 */
export async function verificarBloqueio(banco, chaves, agora = new Date()) {
  let segundos = 0;
  for (const chave of chaves) {
    const [linha] = await banco.consultar('SELECT bloqueado_ate FROM tentativas_login WHERE chave = $1', [chave]);
    if (!linha?.bloqueado_ate) continue;
    const fim = new Date(linha.bloqueado_ate).getTime();
    if (fim > agora.getTime()) segundos = Math.max(segundos, Math.ceil((fim - agora.getTime()) / 1000));
    else await limparTentativas(banco, chave);
  }
  return { bloqueado: segundos > 0, segundos };
}

/**
 * Soma um erro em cada chave. Se o último erro da chave foi há mais de 15 minutos, a contagem recomeça: cinco
 * erros espalhados em semanas não bloqueiam ninguém. No quinto erro seguido, bloqueia por 15 minutos.
 */
export async function registrarErro(banco, chaves, agora = new Date()) {
  const instante = agora.toISOString();
  const janela = new Date(agora.getTime() - BLOQUEIO_MS).toISOString();
  let bloqueado = false;
  for (const chave of chaves) {
    const [{ erros }] = await banco.consultar(
      `INSERT INTO tentativas_login (chave, erros, bloqueado_ate, atualizado_em) VALUES ($1, 1, NULL, $2)
       ON CONFLICT (chave) DO UPDATE SET
         erros = CASE WHEN tentativas_login.atualizado_em < $3 THEN 1 ELSE tentativas_login.erros + 1 END,
         atualizado_em = $2
       RETURNING erros`,
      [chave, instante, janela],
    );
    if (erros >= MAX_ERROS) {
      bloqueado = true;
      await banco.consultar('UPDATE tentativas_login SET bloqueado_ate = $2 WHERE chave = $1', [
        chave,
        new Date(agora.getTime() + BLOQUEIO_MS).toISOString(),
      ]);
    }
  }
  return { bloqueado };
}

export async function limparTentativas(banco, chave) {
  await banco.consultar('DELETE FROM tentativas_login WHERE chave = $1', [chave]);
}

/** Tarefa agendada: some com linhas antigas (inclusive de nomes inventados por quem testa senhas). */
export async function limparTentativasAntigas(banco, agora = new Date()) {
  const corte = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const apagadas = await banco.consultar('DELETE FROM tentativas_login WHERE atualizado_em < $1 RETURNING chave', [corte]);
  return apagadas.length;
}
