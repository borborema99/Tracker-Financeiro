import { Button } from '@/components/ui/button';
import { ErroApi } from '@/lib/api';

// Peças repetidas dos formulários de mutação (erro por campo, erro geral, botões Salvar/Cancelar).

export const camposDe = (erro: Error | null): Record<string, string> => (erro instanceof ErroApi ? (erro.campos ?? {}) : {});

export const geralDe = (erro: Error | null): string | null => (erro && !(erro instanceof ErroApi && erro.campos) ? erro.message : null);

export const ErroGeral = ({ texto }: { texto: string | null }) =>
  texto ? (
    <p role="alert" className="text-sm font-medium text-destructive">
      {texto}
    </p>
  ) : null;

export const BotoesDoFormulario = ({ enviar, desabilitado, cancelar }: { enviar: string; desabilitado: boolean; cancelar: () => void }) => (
  <div className="flex flex-wrap gap-2">
    <Button type="submit" disabled={desabilitado}>
      {enviar}
    </Button>
    <Button type="button" variant="ghost" onClick={cancelar}>
      Cancelar
    </Button>
  </div>
);
