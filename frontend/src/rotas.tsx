import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

// A landing e o tracker são chunks separados: quem só abre a landing não baixa o código do app (nem o Recharts,
// que por sua vez só é baixado nas telas com gráfico).
const Landing = lazy(() => import('./landing/Landing'));
const Casca = lazy(() => import('./app/Casca'));

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
        <Route path="/app/*" element={<Casca />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
