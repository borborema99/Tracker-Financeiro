import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatarDinheiro } from '../../../../contratos/dinheiro.js';
import { formatarData } from '@/lib/datas';
import { useOcultarValores } from '@/lib/ocultar-valores';

export interface DiaProjetado {
  data: string;
  entradas_centavos: number;
  saidas_centavos: number;
  saldo_centavos: number;
}

const paraDinheiro = (reais: number) => formatarDinheiro(Math.round(reais * 100));

/** Saldo total projetado dia a dia (a série vem pronta da API). Carregado sob demanda: Recharts não entra no pacote inicial. */
export default function GraficoProjecao({ serie }: { serie: DiaProjetado[] }) {
  const { oculto } = useOcultarValores();
  if (oculto) return <p className="text-sm text-muted-foreground">Valores ocultos.</p>;
  const dados = serie.map((d) => ({ nome: formatarData(d.data).slice(0, 5), Saldo: d.saldo_centavos / 100 }));
  return (
    <div className="h-72 w-full" role="img" aria-label="Gráfico do saldo projetado dia a dia; os números principais estão no resumo acima.">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="nome" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} minTickGap={24} />
          <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} width={72} tickFormatter={paraDinheiro} />
          <Tooltip formatter={(v) => paraDinheiro(Number(v))} />
          <ReferenceLine y={0} stroke="var(--saida)" strokeDasharray="4 4" />
          <Line type="stepAfter" dataKey="Saldo" stroke="var(--foreground)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
