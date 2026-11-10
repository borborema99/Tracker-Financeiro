import { Link } from 'react-router-dom';
import { useSessao } from '@/lib/sessao';
import { cn } from '@/lib/utils';
import { BotoesDeAcesso, Marca, Rodape } from '@/publico/Layout';

// Landing pública. Só promete o que o tracker faz de verdade; os valores das etiquetas são fictícios e dizem isso.
// Tudo aqui vive no chunk da landing: nada do tracker e nenhum gráfico entra nesta página.

interface Etiqueta {
  nome: string;
  valor: string;
  tipo: 'entrada' | 'saida';
  inclinacao: string;
  atraso: string;
}

const ETIQUETAS: Etiqueta[] = [
  { nome: 'Mercado', valor: '− R$ 182,40', tipo: 'saida', inclinacao: '-rotate-2', atraso: 'motion-safe:delay-100' },
  { nome: 'Salário', valor: '+ R$ 3.000,00', tipo: 'entrada', inclinacao: 'rotate-1', atraso: 'motion-safe:delay-300' },
  { nome: 'Aluguel', valor: '− R$ 1.350,00', tipo: 'saida', inclinacao: '-rotate-1', atraso: 'motion-safe:delay-500' },
];

const CONTROLES: { nome: string; descricao: string }[] = [
  { nome: 'Contas', descricao: 'Carteira, conta corrente, poupança e investimento, cada uma com o saldo calculado do que foi liquidado.' },
  { nome: 'Lançamentos', descricao: 'Receitas, despesas e transferências, com categorias, divisão entre categorias, filtros e exportação em CSV.' },
  { nome: 'Cartões', descricao: 'Compras no cartão, parcelas, faturas e limite disponível.' },
  { nome: 'Contas a pagar e receber', descricao: 'Compromissos com vencimento, aviso de atraso e liquidação.' },
  { nome: 'Recorrências', descricao: 'O que se repete todo mês entra sozinho no calendário.' },
  { nome: 'Fluxo de caixa', descricao: 'Projeção dos próximos dias a partir do que está previsto.' },
  { nome: 'Orçamento e metas', descricao: 'Limite por categoria no mês e metas com progresso.' },
  { nome: 'Dívidas e assinaturas', descricao: 'Parcelas que você deve e assinaturas que você paga, com pausa.' },
  { nome: 'Investimentos e patrimônio', descricao: 'Aportes, valor atual e patrimônio líquido.' },
  { nome: 'Moedas', descricao: 'Contas em dólar, euro e outras sete moedas, com cotação informada por você.' },
  { nome: 'Relatórios', descricao: 'Evolução mês a mês e gastos por categoria.' },
  { nome: 'Comprovantes e extratos', descricao: 'Anexe PDF ou foto ao lançamento e importe extrato OFX.' },
  { nome: 'Alertas', descricao: 'Aviso do que vence e do que estourou.' },
];

const PROTECOES: { titulo: string; texto: string }[] = [
  { titulo: 'Só você vê', texto: 'Cada conta alcança apenas os próprios dados, e o banco recusa qualquer referência a dados de outra pessoa.' },
  { titulo: 'Senha que não se lê', texto: 'A senha nunca é guardada: só um código irreversível (scrypt) com um segredo do servidor. Cinco erros bloqueiam o acesso por 15 minutos.' },
  { titulo: 'Sessão fechada para scripts', texto: 'O cookie de sessão é HttpOnly, Secure e SameSite=Strict. Dá para encerrar as outras sessões pela tela da conta.' },
  { titulo: 'Comprovantes em cofre privado', texto: 'Os arquivos ficam em armazenamento privado e só saem pelo servidor, depois de conferir de quem são.' },
  { titulo: 'Os dados são seus', texto: 'Exporte tudo em JSON e CSV, ou exclua a conta e todos os dados, quando quiser.' },
  { titulo: 'Sem acesso ao seu banco', texto: 'Não há integração bancária: ninguém pede a senha do seu banco. O que aparece é o que você registrou.' },
];

export default function Landing() {
  const { sessao } = useSessao();
  return (
    <div>
      <section className="bg-amarelo text-amarelo-foreground [--ring:var(--tinta)]">
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
          <Marca />
          {sessao?.autenticado ? null : (
            <Link to="/entrar" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:no-underline">
              Entrar
            </Link>
          )}
        </header>
        <div className="mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-8 sm:pt-16 lg:pt-24">
          <h1 className="font-display text-[clamp(3.5rem,13vw,6rem)] leading-[0.9] font-black tracking-tight uppercase">
            Entrou. Saiu. Sobrou.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed sm:text-xl">
            Controle financeiro pessoal sem enrolação. Cada saldo é calculado no servidor a partir do que você lançou ou
            importou, e nada se conecta ao seu banco.
          </p>
          <BotoesDeAcesso className="mt-8" />

          <ul aria-label="Exemplo com dados fictícios" className="mt-14 flex flex-wrap items-start gap-x-6 gap-y-5">
            {ETIQUETAS.map((e) => (
              <li
                key={e.nome}
                className={cn(
                  'relative min-w-44 rounded-md border-2 border-tinta bg-card px-4 pt-6 pb-3 text-card-foreground shadow-md',
                  'before:absolute before:top-2 before:left-1/2 before:size-2.5 before:-translate-x-1/2 before:rounded-full before:border-2 before:border-tinta before:bg-amarelo',
                  'motion-safe:animate-in motion-safe:fill-mode-backwards motion-safe:duration-700 motion-safe:ease-out motion-safe:fade-in motion-safe:slide-in-from-top-8',
                  e.inclinacao,
                  e.atraso,
                )}
              >
                <span className="block text-sm font-medium">{e.nome}</span>
                <span
                  className={cn(
                    'tabular block font-display text-3xl font-extrabold tracking-wide',
                    e.tipo === 'entrada' ? 'text-entrada' : 'text-saida',
                  )}
                >
                  <span className="sr-only">{e.tipo === 'entrada' ? 'Entrada de ' : 'Saída de '}</span>
                  {e.valor}
                </span>
              </li>
            ))}
            <li className="self-center text-sm font-medium">Exemplos fictícios, só para mostrar o jeito.</li>
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
        <h2 className="max-w-2xl font-display text-5xl font-black tracking-tight uppercase sm:text-6xl">
          O que dá para controlar
        </h2>
        <dl className="mt-10 border-t-2 border-foreground">
          {CONTROLES.map((c) => (
            <div
              key={c.nome}
              className="grid gap-1 border-b-2 border-dotted border-foreground/50 py-4 sm:grid-cols-[minmax(0,20rem)_1fr] sm:gap-8"
            >
              <dt className="font-display text-2xl font-extrabold tracking-wide uppercase">{c.nome}</dt>
              <dd className="text-muted-foreground sm:pt-1">{c.descricao}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="bg-tinta text-amarelo dark:border-y-2 dark:border-amarelo">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
          <p className="font-display text-[clamp(2.75rem,10vw,6rem)] leading-[0.95] font-black tracking-tight uppercase">
            Valor. Categoria. Salvar.
          </p>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-amarelo/90">
            Lançar uma despesa leva até três toques. O botão de novo lançamento fica sempre à mão, os campos de valor abrem o
            teclado de números e a tela se ajusta ao celular, com barra de navegação embaixo. O Tracker abre no navegador e
            pode ser instalado na tela inicial.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
        <h2 className="max-w-2xl font-display text-5xl font-black tracking-tight uppercase sm:text-6xl">
          Como os dados são protegidos
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Os dados ficam na nuvem: o site roda no Netlify e o banco e os comprovantes ficam no Supabase. O que o sistema faz
          para guardá-los:
        </p>
        <dl className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2">
          {PROTECOES.map((p) => (
            <div key={p.titulo} className="border-t-2 border-foreground pt-3">
              <dt className="font-display text-2xl font-extrabold tracking-wide uppercase">{p.titulo}</dt>
              <dd className="mt-1 text-muted-foreground">{p.texto}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-10">
          Leia a{' '}
          <Link to="/privacidade" className="font-medium underline underline-offset-4 hover:no-underline">
            Política de Privacidade
          </Link>{' '}
          e os{' '}
          <Link to="/termos" className="font-medium underline underline-offset-4 hover:no-underline">
            Termos de Uso
          </Link>
          .
        </p>
      </section>

      <section className="bg-amarelo text-amarelo-foreground [--ring:var(--tinta)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
          <h2 className="max-w-3xl font-display text-5xl font-black tracking-tight uppercase sm:text-7xl">
            Comece pelo primeiro lançamento.
          </h2>
          <BotoesDeAcesso className="mt-8" />
        </div>
      </section>
      <Rodape />
    </div>
  );
}
