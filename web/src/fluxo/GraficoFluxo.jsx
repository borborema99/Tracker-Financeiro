import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatarDinheiro } from '../../../contratos/dinheiro.js';
import { rotuloDoPeriodo } from '../compartilhado/datas.js';
import { useOcultarValores } from '../compartilhado/OcultarValores.jsx';

const emReais = (centavos) => centavos / 100;
const paraDinheiro = (reais) => formatarDinheiro(Math.round(reais * 100));

/** Entradas e saídas realizadas por período. Carregado só na tela de fluxo (Recharts fica fora do pacote inicial). */
export default function GraficoFluxo({ periodos, agrupar }) {
  const { oculto } = useOcultarValores();
  if (oculto) return <p className="suave">Valores ocultos.</p>;
  const dados = periodos.map((p) => ({
    nome: rotuloDoPeriodo(p.periodo, agrupar),
    Entradas: emReais(p.entradas_centavos),
    Saídas: emReais(p.saidas_centavos),
  }));
  return (
    <div className="grafico" role="img" aria-label="Gráfico de entradas e saídas por período; os mesmos números estão na tabela abaixo.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--borda)" />
          <XAxis dataKey="nome" tick={{ fill: 'var(--tinta-suave)', fontSize: 12 }} />
          <YAxis tick={{ fill: 'var(--tinta-suave)', fontSize: 12 }} width={64} tickFormatter={paraDinheiro} />
          <Tooltip formatter={paraDinheiro} />
          <Legend />
          <Bar dataKey="Entradas" fill="var(--entrada)" />
          <Bar dataKey="Saídas" fill="var(--saida)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
