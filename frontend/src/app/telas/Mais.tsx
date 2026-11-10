import { Link } from 'react-router-dom';
import { Pagina } from '@/components/Pagina';
import { enderecoDoModulo, MODULOS } from '../modulos';

/** Todos os módulos, para o celular: a barra inferior tem espaço para poucos, o resto mora aqui. */
export default function Mais() {
  return (
    <Pagina titulo="Mais">
      <ul className="grid gap-2 sm:grid-cols-2">
        {MODULOS.map((m) => (
          <li key={m.caminho}>
            <Link
              to={enderecoDoModulo(m)}
              className="flex min-h-14 items-center gap-3 rounded-lg border bg-card px-4 font-medium hover:bg-accent hover:text-accent-foreground"
            >
              <m.icone className="size-5 shrink-0" aria-hidden="true" />
              {m.rotulo}
            </Link>
          </li>
        ))}
      </ul>
    </Pagina>
  );
}
