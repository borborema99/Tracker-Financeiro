import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './estilos/tailwind.css';
import { ErroApi } from './lib/api';
import { iniciarTema } from './lib/tema';
import { Rotas } from './rotas';

iniciarTema();

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Erro de validação ou de permissão não melhora tentando de novo; falha de rede sim, uma vez.
      retry: (tentativas, erro) => !(erro instanceof ErroApi && erro.status >= 400) && tentativas < 1,
    },
  },
});

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado.');

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <BrowserRouter>
        <Rotas />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
