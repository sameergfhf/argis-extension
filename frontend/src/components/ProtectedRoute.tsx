import { Navigate, Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { ReactNode } from 'react';
import { BrandMark } from './BrandLogo';

interface Props {
  children?: ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="aegis-shell">
        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-h-screen flex-col items-center justify-center gap-5 outline-none"
        >
          <div className="flex items-center gap-3">
            <BrandMark size="md" />
            <span className="font-display text-[15px] font-semibold uppercase tracking-[0.16em] text-ink">Aegis</span>
          </div>
          <div className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-forest" aria-hidden="true" />
            Verifying session
          </div>
          <span className="sr-only">Loading AEGIS</span>
        </main>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
