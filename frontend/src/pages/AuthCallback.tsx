import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, Loader2, XCircle, ArrowLeft } from 'lucide-react';

import { supabase } from '../lib/supabase';
import BrandLogo from '../components/BrandLogo';
import { ThemeToggle } from '../components/ui';
import { useState } from 'react';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('[AuthCallback] session error:', error);
        setError(error.message);
        setTimeout(() => navigate('/auth', { replace: true }), 3000);
        return;
      }

      if (session) {
        navigate('/dashboard', { replace: true });
      } else {
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN' && session) {
            subscription.unsubscribe();
            navigate('/dashboard', { replace: true });
          } else if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
            subscription.unsubscribe();
            navigate('/auth', { replace: true });
          }
        });

        const timeout = setTimeout(() => {
          subscription.unsubscribe();
          setError('Authentication timed out. Please try again.');
          setTimeout(() => navigate('/auth', { replace: true }), 2000);
        }, 8000);

        return () => {
          subscription.unsubscribe();
          clearTimeout(timeout);
        };
      }
    });
  }, [navigate]);

  return (
    <div className="relative flex min-h-screen flex-col bg-canvas">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="aegis-statusbar">
        <div className="aegis-container aegis-statusbar-inner">
          <span className="flex items-center gap-2">
            <span className="aegis-live-dot" aria-hidden="true" />
            AEGIS / AUTH
          </span>
          <span className="ml-auto font-mono">Session exchange</span>
        </div>
      </div>
      <div className="absolute right-4 top-12 z-10 sm:right-8">
        <ThemeToggle />
      </div>

      <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center px-5 py-16 outline-none">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center">
            <BrandLogo to="/" size="md" subtitle="API security, scored" />
          </div>

          <div className="aegis-panel p-6 sm:p-8" role={error ? 'alert' : 'status'} aria-live="polite">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] border ${
                  error ? 'border-critical/30 bg-critical/10 text-critical' : 'border-line-strong bg-canvas text-forest'
                }`}
              >
                {error ? (
                  <XCircle className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Shield className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="aegis-label mb-1.5">{error ? 'Authentication failed' : 'Verifying session'}</p>
                <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
                  {error ? 'Could not complete sign in.' : 'Completing sign in…'}
                </h1>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">
                  {error ? error : 'Keep this tab open while AEGIS verifies your session.'}
                </p>
                {error ? (
                  <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
                    Redirecting back to sign in…
                  </p>
                ) : (
                  <div className="mt-5 flex items-center gap-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">
                    <Loader2 className="h-4 w-4 animate-spin text-forest" aria-hidden="true" />
                    Exchanging credentials
                  </div>
                )}
              </div>
            </div>

            {error ? (
              <Link to="/auth" className="aegis-secondary-action mt-6 min-h-11 w-full">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Return to sign in
              </Link>
            ) : null}
          </div>

          <p className="mt-6 text-center font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
            Sessions issued by Supabase Auth
          </p>
        </div>
      </main>
    </div>
  );
}
