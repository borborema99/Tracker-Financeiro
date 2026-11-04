import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useOcultarValores } from '../compartilhado/OcultarValores.jsx';
import { Icone } from './Icone.jsx';
import { ITENS_MENU } from './menu.js';

const CHAVE_MENU = 'tracker.menuRecolhido';

function menuInicialRecolhido() {
  try {
    return localStorage.getItem(CHAVE_MENU) === '1';
  } catch {
    return false;
  }
}

function Item({ item, mostrarRotulo = true }) {
  return (
    <NavLink to={item.para} end={item.para === '/'} className="nav-item">
      <Icone nome={item.icone} />
      {mostrarRotulo && <span className="nav-rotulo">{item.rotulo}</span>}
    </NavLink>
  );
}

export function Layout({ demo }) {
  const { oculto, alternar } = useOcultarValores();
  const [recolhido, setRecolhido] = useState(menuInicialRecolhido);
  const { pathname } = useLocation();

  function alternarMenu() {
    const novo = !recolhido;
    setRecolhido(novo);
    try {
      localStorage.setItem(CHAVE_MENU, novo ? '1' : '0');
    } catch {
      // sem armazenamento: vale só nesta aba
    }
  }

  return (
    <div className={`app ${recolhido ? 'menu-recolhido' : ''}`}>
      {demo && <div className="faixa-demo">Dados de demonstração</div>}

      <aside className="menu-lateral" aria-label="Menu principal">
        <button
          type="button"
          className="botao-icone"
          onClick={alternarMenu}
          aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
          aria-expanded={!recolhido}
        >
          <Icone nome="menu" />
        </button>
        <nav>
          {ITENS_MENU.map((item) => (
            <Item key={item.para} item={item} />
          ))}
        </nav>
      </aside>

      <div className="conteudo">
        <header className="topo">
          <span className="titulo-marca">Tracker Financeiro</span>
          <button
            type="button"
            className="botao-icone"
            onClick={alternar}
            aria-pressed={oculto}
            aria-label={oculto ? 'Mostrar valores' : 'Ocultar valores'}
          >
            <Icone nome={oculto ? 'olho-fechado' : 'olho'} />
          </button>
        </header>
        <main className="principal">
          <Outlet />
        </main>
      </div>

      {!pathname.startsWith('/lancamentos/novo') && !pathname.startsWith('/cartoes/compras') && (
        <Link to="/lancamentos/novo" className="fab">
          <Icone nome="mais" />
          <span>Novo lançamento</span>
        </Link>
      )}

      <nav className="abas" aria-label="Menu principal">
        {ITENS_MENU.map((item) => (
          <Item key={item.para} item={item} />
        ))}
      </nav>
    </div>
  );
}
