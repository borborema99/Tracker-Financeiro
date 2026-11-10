import { Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { lerPreferencia, salvarPreferencia, type PreferenciaDeTema } from '@/lib/tema';

const PROXIMA: Record<PreferenciaDeTema, PreferenciaDeTema> = { sistema: 'claro', claro: 'escuro', escuro: 'sistema' };
const ROTULO: Record<PreferenciaDeTema, string> = { sistema: 'o do sistema', claro: 'claro', escuro: 'escuro' };

/** Alterna entre tema do sistema, claro e escuro. A escolha fica só neste navegador. */
export function AlternarTema() {
  const [preferencia, setPreferencia] = useState<PreferenciaDeTema>(lerPreferencia);
  const Icone = preferencia === 'claro' ? Sun : preferencia === 'escuro' ? Moon : Monitor;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Tema: ${ROTULO[preferencia]}. Trocar para ${ROTULO[PROXIMA[preferencia]]}`}
      title={`Tema: ${ROTULO[preferencia]}`}
      onClick={() => {
        const proxima = PROXIMA[preferencia];
        salvarPreferencia(proxima);
        setPreferencia(proxima);
      }}
    >
      <Icone className="size-5" aria-hidden="true" />
    </Button>
  );
}
