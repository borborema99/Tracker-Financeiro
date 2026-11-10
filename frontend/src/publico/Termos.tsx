import { Link } from 'react-router-dom';
import { LayoutLegal } from './Layout';

// RASCUNHO para revisão jurídica. Os trechos entre colchetes dependem de quem publica a própria cópia do site.
export default function Termos() {
  return (
    <LayoutLegal titulo="Termos de Uso">
      <p>
        Ao criar uma conta ou usar o Tracker Financeiro, você concorda com estes termos. Se não concordar, não use o serviço.
      </p>

      <h2>O que é o serviço</h2>
      <p>
        O Tracker Financeiro é uma ferramenta de organização financeira pessoal. Você registra seus lançamentos e o sistema
        calcula saldos, orçamentos, fluxo de caixa e relatórios a partir do que foi registrado. Ele não movimenta dinheiro, não
        acessa sua conta bancária e não é consultoria financeira, de investimentos, contábil ou tributária.
      </p>

      <h2>Sua conta</h2>
      <ul>
        <li>A conta é pessoal e individual. Não há compartilhamento de dados entre contas.</li>
        <li>Você é responsável por manter a senha em segredo e pelo que acontece com a sua conta.</li>
        <li>Você precisa ter capacidade legal para aceitar estes termos.</li>
        <li>Avise o responsável se suspeitar de acesso indevido à sua conta.</li>
      </ul>

      <h2>Uso adequado</h2>
      <p>Você concorda em não:</p>
      <ul>
        <li>tentar acessar dados de outras contas ou burlar as proteções do serviço;</li>
        <li>sobrecarregar o serviço com uso automatizado abusivo;</li>
        <li>enviar arquivos que não sejam comprovantes ou extratos seus, ou que contenham código malicioso;</li>
        <li>usar o serviço para atividade ilegal.</li>
      </ul>

      <h2>Seus dados e seu conteúdo</h2>
      <p>
        Os dados que você lança são seus. Você pode exportá-los e excluir a conta a qualquer momento, e a exclusão apaga os dados.
        Como tratamos os dados está na{' '}
        <Link to="/privacidade" className="font-medium underline underline-offset-4 hover:no-underline">
          Política de Privacidade
        </Link>
        .
      </p>

      <h2>Precisão dos números</h2>
      <p>
        Os valores mostrados dependem do que você registrou. Confira lançamentos, datas e cotações informadas por você: o
        serviço não valida se um lançamento corresponde a uma operação real. Decisões financeiras são sua responsabilidade.
      </p>

      <h2>Disponibilidade</h2>
      <p>
        O serviço é oferecido como está, sem garantia de funcionamento ininterrupto. Pode haver manutenção, instabilidade dos
        provedores de infraestrutura ou mudanças. Recomendamos exportar seus dados periodicamente.
      </p>

      <h2>Limite de responsabilidade</h2>
      <p>
        Na medida permitida pela lei, o responsável não responde por perdas indiretas decorrentes do uso ou da
        indisponibilidade do serviço, nem por decisões tomadas com base nos números exibidos. [Cláusula a revisar por
        advogado, inclusive a relação de consumo, se houver cobrança.]
      </p>

      <h2>Encerramento</h2>
      <p>
        Você pode encerrar a conta quando quiser. O responsável pode suspender ou encerrar contas que violem estes termos ou
        ponham o serviço ou outras pessoas em risco, e pode encerrar o serviço com aviso razoável para que você exporte seus
        dados.
      </p>

      <h2>Mudanças e foro</h2>
      <p>
        Estes termos podem mudar; a versão atual fica nesta página. Fica eleito o foro da comarca de [comarca a definir], salvo
        regra legal em contrário. Contato do responsável: [e-mail ou canal de contato do responsável].
      </p>
    </LayoutLegal>
  );
}
