import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  aoConfirmar: () => void;
  pendente?: boolean;
  desabilitado?: boolean;
  titulo?: string | undefined;
  rotulo?: string;
  rotuloDeConfirmacao?: string;
}

/** Exclusão em dois passos: o primeiro toque pede confirmação, o segundo executa. Cancelar volta ao início. */
export function BotaoExcluir({
  aoConfirmar,
  pendente = false,
  desabilitado = false,
  titulo,
  rotulo = 'Excluir',
  rotuloDeConfirmacao = 'Confirmar exclusão',
}: Props) {
  const [confirmando, setConfirmando] = useState(false);
  if (confirmando) {
    return (
      <>
        <Button
          variant="destructive"
          disabled={pendente}
          onClick={() => {
            aoConfirmar();
            setConfirmando(false);
          }}
        >
          {rotuloDeConfirmacao}
        </Button>
        <Button variant="ghost" onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </>
    );
  }
  return (
    <Button variant="outline" disabled={desabilitado || pendente} title={titulo} onClick={() => setConfirmando(true)}>
      {rotulo}
    </Button>
  );
}
