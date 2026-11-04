import { useState } from 'react';
import { centavosParaCampo, parseDinheiro } from '../../../contratos/dinheiro.js';

/**
 * Campo de valor em reais. Guarda o texto digitado e avisa o pai com os centavos (ou null se
 * estiver vazio ou inválido). `inicial` só vale na montagem: troque a `key` para recarregar.
 */
export function CampoValor({ id, rotulo, inicial = null, aoMudar, autoFocus = false, permitirNegativo = false, erro }) {
  const [texto, setTexto] = useState(inicial == null ? '' : centavosParaCampo(inicial));
  const centavos = texto.trim() === '' ? null : parseDinheiro(texto);
  const invalido = texto.trim() !== '' && (centavos === null || (!permitirNegativo && centavos < 0));

  function mudar(e) {
    const novo = e.target.value;
    setTexto(novo);
    const c = novo.trim() === '' ? null : parseDinheiro(novo);
    aoMudar(c !== null && (permitirNegativo || c >= 0) ? c : null);
  }

  const mensagem = invalido ? 'Valor inválido. Exemplo: 1.234,56' : erro;
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        autoFocus={autoFocus}
        value={texto}
        onChange={mudar}
        aria-invalid={mensagem ? 'true' : undefined}
        aria-describedby={mensagem ? `${id}-erro` : undefined}
      />
      {mensagem && (
        <p id={`${id}-erro`} role="alert" className="erro campo-erro">
          {mensagem}
        </p>
      )}
    </div>
  );
}
