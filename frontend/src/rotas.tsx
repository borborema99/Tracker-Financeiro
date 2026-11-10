import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { GuardaDeRota } from './app/GuardaDeRota';

// A landing e o tracker são chunks separados: quem só abre a landing não baixa o código do app (nem o Recharts,
// que por sua vez só é baixado nas telas com gráfico).
const Landing = lazy(() => import('./landing/Landing'));
const Casca = lazy(() => import('./app/Casca'));
const Entrar = lazy(() => import('./publico/Entrar'));
const CriarConta = lazy(() => import('./publico/CriarConta'));
const Privacidade = lazy(() => import('./publico/Privacidade'));
const Termos = lazy(() => import('./publico/Termos'));

function Carregando() {
  return (
    <div role="status" aria-label="Carregando" className="p-6">
      <Skeleton className="h-8 w-48" />
    </div>
  );
}

export function Rotas() {
  return (
    <Suspense fallback={<Carregando />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/criar-conta" element={<CriarConta />} />
        <Route path="/privacidade" element={<Privacidade />} />
        <Route path="/termos" element={<Termos />} />
        <Route
          path="/app/*"
          element={
            <GuardaDeRota>
              <Casca />
            </GuardaDeRota>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
