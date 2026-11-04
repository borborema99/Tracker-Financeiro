import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatarDinheiro } from '../../../contratos/dinheiro.js';
import { formatarData } from '../compartilhado/datas.js';
import { useOcultarValores } from '../compartilhado/OcultarValores.jsx';

const paraDinheiro = (reais) => formatarDinheiro(Math.round(reais * 100));

/** Saldo total projetado dia a dia (a série vem pronta da API). Carregado sob demanda: Recharts não entra no pacote inicial. */
export default function GraficoProjecao({ serie }) {
  const { oculto } = useOcultarValores();
  if (oculto) return <p className="suave">Valores ocultos.</p>;
  const dados = serie.map((d) => ({ nome: formatarData(d.data).slice(0, 5), Saldo: d.saldo_centavos / 100 }));
  return (
    <div className="grafico" role="img" aria-label="Gráfico do saldo projetado dia a dia; os números principais estão no resumo acima.">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--borda)" />
          <XAxis dataKey="nome" tick={{ fill: 'var(--tinta-suave)', fontSize: 12 }} minTickGap={24} />
          <YAxis tick={{ fill: 'var(--tinta-suave)', fontSize: 12 }} width={64} tickFormatter={paraDinheiro} />
          <Tooltip formatter={paraDinheiro} />
          <ReferenceLine y={0} stroke="var(--saida)" strokeDasharray="4 4" />
          <Line type="stepAfter" dataKey="Saldo" stroke="var(--acento)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
