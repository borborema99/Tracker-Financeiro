import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Campo } from '@/components/Campo';
import { Pagina } from '@/components/Pagina';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useSessao } from '@/lib/sessao';
import { ErroGeral, geralDe } from './comumFormulario';

const PADRAO = 'America/Sao_Paulo';

function fusosDisponiveis(atual: string): string[] {
  let lista: string[] = [];
  try {
    lista = Intl.supportedValuesOf('timeZone');
  } catch {
    lista = [];
  }
  return Array.from(new Set([PADRAO, atual, ...lista])).sort((a, b) => a.localeCompare(b));
}

function FormularioFuso({ inicial }: { inicial: string }) {
  const cliente = useQueryClient();
  const [fuso, setFuso] = useState(inicial);
  const salvar = useMutation({
    mutationFn: () => api('/config', { metodo: 'PUT', corpo: { fuso } }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['sessao'] }),
  });
  return (
    <form
      noValidate
      className="max-w-xl space-y-4 rounded-lg border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <h2 className="font-display text-2xl font-extrabold tracking-wide uppercase">Fuso horário</h2>
      <Campo id="fuso" rotulo="Fuso horário de exibição">
        <Select id="fuso" value={fuso} onChange={(e) => setFuso(e.target.value)}>
          {fusosDisponiveis(inicial).map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
      </Campo>
      <p className="text-sm text-muted-foreground">
        Define o que é "hoje" e a hora que aparece nos registros. As datas dos lançamentos não mudam. O padrão é {PADRAO}.
      </p>
      <ErroGeral texto={geralDe(salvar.error)} />
      {salvar.isSuccess && fuso === inicial ? (
        <p role="status" className="text-sm font-medium text-entrada">
          Salvo.
        </p>
      ) : null}
      <Button type="submit" disabled={salvar.isPending || fuso === inicial}>
        Salvar
      </Button>
    </form>
  );
}

export default function Configuracoes() {
  const { sessao } = useSessao();
  return (
    <Pagina titulo="Configurações">
      {/* A chave refaz o formulário quando o fuso salvo muda, sem efeito de sincronização. */}
      <FormularioFuso key={sessao?.fuso ?? PADRAO} inicial={sessao?.fuso ?? PADRAO} />
    </Pagina>
  );
}
