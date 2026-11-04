import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/App.jsx';
import { ativarPwa } from './app/pwa.js';
import { ProvedorOcultarValores } from './compartilhado/OcultarValores.jsx';
import './estilos/tokens.css';
import './estilos/base.css';
import './estilos/componentes.css';

const cliente = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 } },
});

ativarPwa();

createRoot(document.getElementById('raiz')).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <ProvedorOcultarValores>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ProvedorOcultarValores>
    </QueryClientProvider>
  </StrictMode>,
);
