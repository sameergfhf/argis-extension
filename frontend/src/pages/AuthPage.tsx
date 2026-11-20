import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, User, ArrowLeft, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import BrandLogo from '../components/BrandLogo';
import { ThemeToggle } from '../components/ui';
import toast from 'react-hot-toast';

type AuthMode = 'signin' | 'signup';

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.185 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.004.07 1.532 1.032 1.532 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.111-4.555-4.944 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.748-1.025 2.748-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.337 4.687-4.565 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .268.18.58.688.482C19.138 20.203 22 16.447 22 12.021 22 6.484 17.523 2 12 2z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.49 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

const fieldClass =
  'min-h-12 w-full rounded-[6px] border border-line-strong bg-paper py-3 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-forest focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--aegis-focus)_14%,transparent)]';
const iconFieldClass = `${fieldClass} pl-11 pr-4`;
const oauthClass =
  'flex min-h-11 items-center justify-center gap-2.5 rounded-[6px] border border-line-strong bg-paper px-3 text-[12.5px] font-medium text-ink transition-colors hover:border-ink hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] disabled:cursor-not-allowed disabled:opacity-50';

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null);

  const { session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (session) navigate('/dashboard', { replace: true });
  }, [session, navigate]);

  // The auth screen is a fixed, single-viewport composition — never a scroll surface.
  useEffect(() => {
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, []);

  function resetState() {
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setLoading(false);
  }

  function toggleMode() {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
    resetState();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'signup' && !name.trim()) {
      return toast.error('Please enter your full name.');
    }
    if (!email.trim() || !password) {
      return toast.error('Please fill in all fields.');
    }
    if (mode === 'signup' && password !== confirmPassword) {
      return toast.error('Passwords do not match.');
    }
    if (password.length < 6) {
      return toast.error('Password must be at least 6 characters.');
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim(), name: name.trim() } },
        });
        if (error) throw error;
        if (data?.session) {
          toast.success('Account created. Welcome to AEGIS.');
          navigate('/dashboard', { replace: true });
          return;
        }
        toast.success('Account created. Check your email to confirm, then sign in.');
        setMode('signin');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        toast.success('Welcome back.');
        navigate('/dashboard', { replace: true });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: 'google' | 'github') {
    setOauthLoading(provider);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : {},
        },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `${provider} sign-in failed.`;
      toast.error(msg, { duration: 6000 });
      setOauthLoading(null);
    }
  }

  const isSignUp = mode === 'signup';

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-canvas lg:grid lg:grid-cols-[1.02fr_1fr]">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <aside className="aegis-invert relative hidden overflow-hidden p-10 lg:flex lg:flex-col xl:p-14">
        <div className="aegis-glow pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
        <div className="aegis-grid-bg pointer-events-none absolute inset-0 opacity-[0.14]" aria-hidden="true" />
        <div className="relative z-10">
          <BrandLogo to="/" size="md" subtitle="Operator console" inverted />
        </div>

        <div className="relative z-10 my-auto max-w-[30rem] py-[clamp(1rem,5vh,3rem)]">
          <p className="aegis-eyebrow">Restricted workspace</p>
          <h1 className="mt-[clamp(1rem,3vh,1.5rem)] font-display text-[clamp(1.8rem,min(4vw,4.6vh),3.6rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-ink">
            Every scan is a record.
            <br />
            Every record is evidence.
          </h1>
          <p className="mt-[clamp(0.75rem,2.4vh,1.5rem)] max-w-[42ch] text-[14px] leading-relaxed text-muted">
            Sign in to run probes, keep an auditable history, and coordinate remediation with your team.
          </p>

          <dl className="mt-[clamp(1.25rem,4vh,2.5rem)] hidden border-t border-line [@media(min-height:760px)]:block">
            {[
              { n: '01', label: 'Non-destructive probes', detail: 'No fuzzing, no writes, no payloads.' },
              { n: '02', label: 'SSRF-guarded targets', detail: 'Private and reserved ranges rejected.' },
              { n: '03', label: 'Evidence-linked findings', detail: 'Every score traces to an observation.' },
            ].map((item) => (
              <div key={item.n} className="grid grid-cols-[32px_1fr] gap-3 border-b border-line py-4">
                <dt className="font-mono text-[10px] tracking-[0.1em] text-muted">{item.n}</dt>
                <div>
                  <dt className="text-[13px] font-medium text-ink">{item.label}</dt>
                  <dd className="mt-1 font-mono text-[10px] leading-relaxed text-muted">{item.detail}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative z-10 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          TLS 1.3 · encrypted at rest · zero payloads
        </div>
      </aside>

      <main
        id="main-content"
        tabIndex={-1}
        className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden outline-none"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5 sm:px-8 lg:justify-end lg:border-b-0">
          <div className="lg:hidden">
            <BrandLogo to="/" size="sm" subtitle="Operator console" />
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="hidden min-h-10 items-center gap-1.5 px-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted hover:text-ink sm:inline-flex"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Public site
            </Link>
            <ThemeToggle />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-5 py-[clamp(0.75rem,3vh,2.5rem)] sm:px-8">
          <div className="aegis-auth-stage w-full max-w-[420px]">
            <p className="aegis-eyebrow">Authentication / operator access</p>
            <h1 className="mt-[clamp(0.5rem,1.8vh,1rem)] font-display text-[clamp(1.5rem,min(4.4vw,4.2vh),2.5rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-ink">
              {isSignUp ? 'Create an operator account.' : 'Sign in to the console.'}
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted [@media(max-height:700px)]:hidden">
              {isSignUp
                ? 'One account for scans, history, OpenAPI operations, and team workspaces.'
                : 'Resume your workspaces, scan history, and posture telemetry.'}
            </p>

            <div className="mt-[clamp(0.75rem,2.6vh,2rem)] grid grid-cols-2 gap-2">
              <button
                id="auth-google-btn"
                type="button"
                onClick={() => handleOAuth('google')}
                disabled={oauthLoading !== null}
                className={oauthClass}
              >
                {oauthLoading === 'google' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <GoogleIcon />}
                Google
              </button>
              <button
                id="auth-github-btn"
                type="button"
                onClick={() => handleOAuth('github')}
                disabled={oauthLoading !== null}
                className={oauthClass}
              >
                {oauthLoading === 'github' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <GitHubIcon />}
                GitHub
              </button>
            </div>

            <div className="my-[clamp(0.5rem,2vh,1.5rem)] flex items-center gap-3">
              <div className="h-px flex-1 bg-line" />
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">or email credentials</span>
              <div className="h-px flex-1 bg-line" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-[clamp(0.375rem,1.4vh,1rem)]">
              {isSignUp ? (
                <div className="space-y-1.5">
                  <label htmlFor="auth-name" className="aegis-label block !text-ink">
                    Full name
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                    <input
                      id="auth-name"
                      type="text"
                      autoComplete="name"
                      placeholder="Alex Morgan"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className={iconFieldClass}
                    />
                  </div>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <label htmlFor="auth-email" className="aegis-label block !text-ink">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={`${iconFieldClass} font-mono text-[13px]`}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="auth-password" className="aegis-label block !text-ink">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    placeholder="Minimum 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={`${iconFieldClass} pr-12 font-mono text-[13px]`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[6px] text-muted transition-colors hover:bg-elevated hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {isSignUp ? (
                <div className="space-y-1.5">
                  <label htmlFor="auth-confirm-password" className="aegis-label block !text-ink">
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                    <input
                      id="auth-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className={`${iconFieldClass} font-mono text-[13px]`}
                    />
                  </div>
                </div>
              ) : null}

              <button
                id="auth-password-submit-btn"
                type="submit"
                disabled={loading}
                className="aegis-primary-action mt-1 min-h-12 w-full px-4 text-[13px] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Authenticating…
                  </>
                ) : (
                  <>
                    {isSignUp ? 'Create account' : 'Sign in with password'}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-[clamp(0.5rem,2.2vh,1.5rem)] border-t border-line pt-[clamp(0.6rem,1.6vh,1.25rem)] text-[12.5px] text-muted">
              {isSignUp ? 'Already have an account? ' : 'No account yet? '}
              <button
                id="auth-mode-toggle"
                type="button"
                onClick={toggleMode}
                className="inline-flex min-h-6 items-center font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-forest"
              >
                {isSignUp ? 'Sign in instead' : 'Create one'}
              </button>
            </p>

            <p className="mt-[clamp(0.5rem,1.8vh,1.5rem)] font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.1em] text-muted [@media(max-height:780px)]:hidden">
              Sessions are issued by Supabase Auth. Credentials never reach the scan engine.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
