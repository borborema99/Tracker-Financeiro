import { Link } from 'react-router-dom';
import { LayoutLegal } from './Layout';

// RASCUNHO para revisão jurídica. Descreve o que o sistema faz hoje (ADR 013); os trechos entre colchetes
// dependem de quem publica a própria cópia do site e precisam ser preenchidos antes de valer.
export default function Privacidade() {
  return (
    <LayoutLegal titulo="Política de Privacidade">
      <p>
        Esta política explica quais dados o Tracker Financeiro guarda sobre você, por quê, com quem eles passam e como
        você exerce os direitos previstos na Lei Geral de Proteção de Dados (Lei 13.709/2018, a LGPD).
      </p>

      <h2>Quem cuida dos dados</h2>
      <p>
        O responsável (controlador) é quem publica este site: [nome ou razão social do responsável], [CPF ou CNPJ]. Contato
        para assuntos de privacidade: [e-mail ou canal de contato do responsável].
      </p>

      <h2>Quais dados guardamos</h2>
      <ul>
        <li>Nome de usuário, escolhido por você.</li>
        <li>
          Senha: nunca guardamos a senha em si, só um código irreversível (hash) gerado com scrypt e um segredo do servidor.
        </li>
        <li>
          Dados financeiros que você lança ou importa: contas, lançamentos, categorias, cartões, compromissos, orçamentos,
          metas, dívidas, assinaturas, investimentos, moedas e o histórico de alterações de cada registro.
        </li>
        <li>Comprovantes que você anexa (PDF ou imagem), guardados em armazenamento privado.</li>
        <li>
          Dados de segurança: sessões abertas (com data de criação e validade) e tentativas de login. O endereço IP não é
          guardado em texto: só um código derivado dele, usado para limitar tentativas erradas.
        </li>
        <li>Preferências de uso, como o fuso horário de exibição.</li>
      </ul>
      <p>
        Não pedimos acesso ao seu banco, não lemos suas contas bancárias e não usamos cotação automática. O que aparece no
        Tracker é o que você mesmo registrou ou importou.
      </p>

      <h2>Para que usamos</h2>
      <p>
        Usamos os dados só para fazer o Tracker funcionar para você: calcular saldos, orçamentos e relatórios, manter a sua
        sessão aberta e proteger a conta contra acesso indevido. Não vendemos dados, não usamos para publicidade e não
        fazemos perfil comportamental.
      </p>

      <h2>Base legal</h2>
      <p>
        Execução do serviço que você pediu ao criar a conta (LGPD, art. 7º, V) e proteção do próprio serviço contra fraude e
        abuso (art. 7º, IX, legítimo interesse, no caso dos dados de segurança).
      </p>

      <h2>Com quem os dados passam</h2>
      <ul>
        <li>Netlify, que hospeda o site e executa o servidor.</li>
        <li>Supabase, que guarda o banco de dados e os comprovantes.</li>
      </ul>
      <p>
        São operadores de infraestrutura e tratam os dados em nome do responsável. Podem ter servidores fora do Brasil
        [confirmar a região escolhida no projeto]. Não há outros destinatários nem ferramentas de análise ou de publicidade
        de terceiros no site.
      </p>

      <h2>Cookies e armazenamento no navegador</h2>
      <p>
        Usamos um único cookie, o da sessão, necessário para você continuar logado. Ele não é lido por scripts da página e só
        vai para este site. O navegador também guarda, localmente, preferências suas, como o tema claro ou escuro e se o menu
        está recolhido.
      </p>

      <h2>Por quanto tempo</h2>
      <p>
        Guardamos os dados enquanto a conta existir. Quando você exclui a conta, apagamos os dados e os comprovantes. Cópias de
        segurança do provedor de banco de dados podem levar [prazo a confirmar com o provedor] para sair.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Pela LGPD (art. 18) você pode confirmar que tratamos seus dados, acessá-los, corrigi-los, pedir portabilidade e pedir a
        eliminação. No Tracker, na tela da conta, você pode exportar todos os seus dados (JSON e CSV), trocar a senha, encerrar
        as outras sessões e excluir a conta com todos os dados. Para qualquer outro pedido, use o contato acima.
      </p>

      <h2>Segurança</h2>
      <p>
        Cada conta só alcança os próprios dados, o banco recusa referências a dados de outra pessoa, a senha é protegida com
        scrypt, a conexão é cifrada (HTTPS) e cinco senhas erradas bloqueiam o acesso por 15 minutos. Nenhum sistema é
        invulnerável: se houver incidente que possa causar dano relevante a você, avisaremos como a lei exige.
      </p>

      <h2>Mudanças nesta política</h2>
      <p>
        Se a política mudar, a nova versão aparece nesta página. Veja também os{' '}
        <Link to="/termos" className="font-medium underline underline-offset-4 hover:no-underline">
          Termos de Uso
        </Link>
        .
      </p>
    </LayoutLegal>
  );
}
