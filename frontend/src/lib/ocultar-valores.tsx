import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

// Preferência de ocultar valores: vale para todo `Valor` e fica só neste navegador.

const CHAVE = 'tracker.ocultarValores';

interface Contexto {
  oculto: boolean;
  alternar: () => void;
}

const Ctx = createContext<Contexto>({ oculto: false, alternar: () => {} });

function lerPreferencia(): boolean {
  try {
    return localStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

export function ProvedorOcultarValores({ children }: { children: ReactNode }) {
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
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useOcultarValores(): Contexto {
  return useContext(Ctx);
}
