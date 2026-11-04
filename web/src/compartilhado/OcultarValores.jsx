import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const CHAVE = 'tracker.ocultarValores';
const Contexto = createContext({ oculto: false, alternar: () => {} });

function lerPreferencia() {
  try {
    return localStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

export function ProvedorOcultarValores({ children }) {
  const [oculto, setOculto] = useState(lerPreferencia);

  const alternar = useCallback(() => {
    setOculto((atual) => {
      const novo = !atual;
      try {
        localStorage.setItem(CHAVE, novo ? '1' : '0');
      } catch {
        // sem armazenamento: a preferência vale só nesta aba
      }
      return novo;
    });
  }, []);

  const valor = useMemo(() => ({ oculto, alternar }), [oculto, alternar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useOcultarValores() {
  return useContext(Contexto);
}
