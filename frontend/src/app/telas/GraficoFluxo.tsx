import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatarDinheiro } from '../../../../contratos/dinheiro.js';
import { rotuloDoPeriodo, type Agrupamento } from '@/lib/datas';
import { useOcultarValores } from '@/lib/ocultar-valores';

export interface PeriodoDoFluxo {
  periodo: string;
  entradas_centavos: number;
  saidas_centavos: number;
  resultado_centavos: number;
}

const paraDinheiro = (reais: number) => formatarDinheiro(Math.round(reais * 100));

/** Entradas e saídas realizadas por período. Carregado só na tela de fluxo (Recharts fica fora do pacote inicial). */
export default function GraficoFluxo({ periodos, agrupar }: { periodos: PeriodoDoFluxo[]; agrupar: Agrupamento }) {
  const { oculto } = useOcultarValores();
  if (oculto) return <p className="text-sm text-muted-foreground">Valores ocultos.</p>;
  const dados = periodos.map((p) => ({
    nome: rotuloDoPeriodo(p.periodo, agrupar),
    Entradas: p.entradas_centavos / 100,
    Saídas: p.saidas_centavos / 100,
  }));
  return (
    <div className="h-72 w-full" role="img" aria-label="Gráfico de entradas e saídas por período; os mesmos números estão na tabela abaixo.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="nome" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
          <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} width={72} tickFormatter={paraDinheiro} />
          <Tooltip formatter={(v) => paraDinheiro(Number(v))} />
          <Legend />
          <Bar dataKey="Entradas" fill="var(--entrada)" />
          <Bar dataKey="Saídas" fill="var(--saida)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
