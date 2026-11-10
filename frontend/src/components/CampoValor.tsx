import { useState } from 'react';
import { centavosParaCampo, parseDinheiro } from '../../../contratos/dinheiro.js';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  id: string;
  rotulo: string;
  /** Só vale na montagem: troque a `key` para recarregar o campo com outro valor. */
  inicial?: number | null;
  /** Avisa o pai com os centavos, ou null se o campo estiver vazio ou inválido. */
  aoMudar: (centavos: number | null) => void;
  permitirNegativo?: boolean;
  autoFocus?: boolean;
  /** Erro vindo do servidor ou do formulário. */
  erro?: string | undefined;
  disabled?: boolean;
}

/** Deixa só o que pode fazer parte de um valor em reais: dígitos, ponto, vírgula e sinal. */
export function limparTextoDeValor(texto: string): string {
  return texto.replace(/[^\d.,+\-\sR$]/g, '');
}

/**
 * Campo de valor em reais, com `inputmode="decimal"` para abrir o teclado de números no celular. O texto digitado é
 * a verdade enquanto a pessoa digita; ao sair do campo ele é reescrito no formato do contrato ("1234,5" vira
 * "1234,50"). O parse é o do contrato (`parseDinheiro`), o mesmo do servidor.
 */
export function CampoValor({
  id,
  rotulo,
  inicial = null,
  aoMudar,
  permitirNegativo = false,
  autoFocus = false,
  erro,
  disabled = false,
}: Props) {
  const [texto, setTexto] = useState(inicial == null ? '' : centavosParaCampo(inicial));
  const centavos = texto.trim() === '' ? null : (parseDinheiro(texto) as number | null);
  const invalido = texto.trim() !== '' && (centavos === null || (!permitirNegativo && centavos < 0));
  const mensagem = invalido ? 'Valor inválido. Exemplo: 1.234,56' : erro;

  const aoDigitar = (novo: string) => {
    const limpo = limparTextoDeValor(novo);
    setTexto(limpo);
    const c = limpo.trim() === '' ? null : (parseDinheiro(limpo) as number | null);
    aoMudar(c !== null && (permitirNegativo || c >= 0) ? c : null);
  };

  const aoSair = () => {
    if (centavos !== null && !invalido) setTexto(centavosParaCampo(centavos));
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        autoFocus={autoFocus}
        disabled={disabled}
        value={texto}
        className="tabular"
        onChange={(e) => aoDigitar(e.target.value)}
        onBlur={aoSair}
        aria-invalid={mensagem ? true : undefined}
        aria-describedby={mensagem ? `${id}-erro` : undefined}
      />
      {mensagem ? (
        <p id={`${id}-erro`} role="alert" className="text-sm text-destructive">
          {mensagem}
        </p>
      ) : null}
    </div>
  );
}
