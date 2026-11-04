import { Link } from 'react-router-dom';
import { Icone } from './Icone.jsx';
import { ITENS_MAIS } from './menu.js';

/** Telas que não cabem na barra de baixo do celular. */
export function Mais() {
  return (
    <section>
      <h1>Mais</h1>
      <ul className="lista-limpa lista-mais">
        {ITENS_MAIS.map((item) => (
          <li key={item.para}>
            <Link to={item.para} className="item-mais">
              <Icone nome={item.icone} />
              <span>{item.rotulo}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
