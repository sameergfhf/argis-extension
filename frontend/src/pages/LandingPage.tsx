import { useState, useId } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Globe,
  Lock,
  Menu,
  Shield,
  X,
  Terminal,
  Activity,
  Crosshair,
  FileCode2,
  Minus,
  Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { createScan, getErrorMessage } from '../services/api';
import BrandLogo from '../components/BrandLogo';
import { ThemeToggle } from '../components/ui/ThemeToggle';

const SAMPLE_PRESETS = [
  { label: 'GitHub', url: 'https://api.github.com' },
  { label: 'Stripe', url: 'https://api.stripe.com/v1/charges' },
  { label: 'JSONPlaceholder', url: 'https://jsonplaceholder.typicode.com/posts' },
  { label: 'HTTPBin', url: 'https://httpbin.org/get' },
];

const CURRENT_YEAR = new Date().getFullYear();

const ESTIMATOR_OPTIONS = [
  { id: 'tls', label: 'TLS 1.3 + forward secrecy', points: 25, hint: 'Certificate chain, AEAD ciphers' },
  { id: 'headers', label: 'HSTS, CSP, framing controls', points: 35, hint: 'Browser-enforced policy surface' },
  { id: 'leakage', label: 'Zero information leakage', points: 20, hint: 'No server banners or stack traces' },
  { id: 'reputation', label: 'Clean threat-intel signal', points: 20, hint: 'VirusTotal & Safe Browsing clear' },
];

const FAQ_ITEMS = [
  {
    q: 'Is this safe on production APIs?',
    a: 'Yes. AEGIS only runs observable, non-destructive probes. It does not fuzz, brute-force, or mutate data.',
  },
  {
    q: 'How do you prevent SSRF?',
    a: 'Every URL is resolved and checked against private and reserved ranges, including RFC 1918, loopback, and cloud metadata addresses.',
  },
  {
    q: 'How is the score calculated?',
    a: 'A weighted model across four pillars: TLS (25), headers (35), leakage (20), and reputation (20). Unassessed checks reduce coverage, not mystery.',
  },
  {
    q: 'Can I import OpenAPI specs?',
    a: 'Paste a spec URL or upload JSON/YAML, then scan individual operations with optional auth headers.',
  },
  {
    q: 'Can I export a report?',
    a: 'Every completed scan generates an audit-ready PDF with findings, evidence, and remediation guidance.',
  },
];

const PILLARS = [
  {
    n: '01',
    title: 'Transport',
    body: 'Protocol version, AEAD ciphers, certificate window, and hostname match.',
    evidence: 'TLS handshake · certificate chain',
    icon: Lock,
  },
  {
    n: '02',
    title: 'Headers',
    body: 'HSTS, CSP, nosniff, framing, and dangerous CORS on authenticated routes.',
    evidence: 'Response policy · CORS surface',
    icon: Shield,
  },
  {
    n: '03',
    title: 'Leakage',
    body: 'Server banners, X-Powered-By, stack traces, and credential redaction in evidence.',
    evidence: 'Body fingerprints · sanitised excerpts',
    icon: Terminal,
  },
  {
    n: '04',
    title: 'Reputation',
    body: 'VirusTotal and Safe Browsing, with a calm fallback when keys are absent.',
    evidence: 'Domain reputation · redirects',
    icon: Activity,
  },
];

const REPORT_ITEMS = [
  { label: 'Assessment score', detail: '0–100, weighted, with explicit coverage.' },
  { label: 'Findings ledger', detail: 'Severity, evidence, and remediation per failing check.' },
  { label: 'Request inspector', detail: 'Sanitised headers, body, redirects, and timing.' },
  { label: 'Lifecycle diagram', detail: 'Resolve → connect → exchange → verdict, node by node.' },
  { label: 'Latency samples', detail: 'Multi-probe timings with average and failure marks.' },
  { label: 'PDF audit export', detail: 'A portable record for review and sign-off.' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const scanInputId = useId();
  const [targetUrl, setTargetUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [selectedChecks, setSelectedChecks] = useState<Record<string, boolean>>({
    tls: true,
    headers: true,
    leakage: false,
    reputation: true,
  });
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const estimatedScore = ESTIMATOR_OPTIONS.reduce(
    (acc, opt) => acc + (selectedChecks[opt.id] ? opt.points : 0),
    0,
  );
  const enabledCount = ESTIMATOR_OPTIONS.filter((opt) => selectedChecks[opt.id]).length;
  const grade = estimatedScore >= 90 ? 'A+' : estimatedScore >= 75 ? 'B' : estimatedScore >= 55 ? 'C' : 'F';

  const handleScanSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const url = targetUrl.trim();
    if (!url) return toast.error('Enter an API URL to scan.');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return toast.error('URL must begin with http:// or https://');
    }
    try {
      setIsScanning(true);
      toast.loading('Initiating scan…', { id: 'scan-toast' });
      const scan = await createScan(url, 'Triggered from AEGIS landing page');
      toast.success('Scan initiated', { id: 'scan-toast' });
      navigate(`/scan/${scan.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err), { id: 'scan-toast', duration: 5000 });
      setIsScanning(false);
    }
  };

  const navLinks = [
    { href: '#scan', label: 'Run a scan' },
    { href: '#method', label: 'Method' },
    { href: '#report', label: 'Report' },
    { href: '#questions', label: 'Questions' },
  ];

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className="aegis-statusbar">
        <div className="aegis-container aegis-statusbar-inner">
          <span className="flex items-center gap-2">
            <span className="aegis-live-dot" aria-hidden="true" />
            AEGIS / SIGNAL
          </span>
          <span className="hidden border-l border-white/15 pl-4 sm:inline">Non-destructive probes · zero payloads</span>
          <span className="ml-auto hidden font-mono md:inline">External attack surface</span>
        </div>
      </div>

      <header className="sticky top-0 z-50 border-b border-line bg-paper">
        <div className="aegis-container flex h-16 items-center justify-between gap-4">
          <BrandLogo to="/" size="sm" subtitle="API security, scored" />
          <nav aria-label="Page" className="hidden items-center gap-5 lg:flex xl:gap-7">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="aegis-navlink">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-flex" />
            {session ? (
              <span className="hidden min-[380px]:block">
                <Link to="/dashboard" className="aegis-primary-action min-h-10 px-3.5 text-[12.5px]">
                  Console
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </span>
            ) : (
              <>
                <Link to="/auth" className="hidden min-h-10 items-center whitespace-nowrap px-3 text-[13px] font-medium text-muted hover:text-ink sm:inline-flex">
                  Sign in
                </Link>
                <span className="hidden min-[380px]:block">
                  <a href="#scan" className="aegis-primary-action min-h-10 px-3.5 text-[12.5px]">
                    Run a scan
                    <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </span>
              </>
            )}
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-line-strong text-muted transition-colors hover:bg-canvas hover:text-ink lg:hidden"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={mobileNavOpen}
              aria-controls="landing-mobile-nav"
            >
              {mobileNavOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
        {mobileNavOpen ? (
          <nav id="landing-mobile-nav" aria-label="Mobile page" className="border-t border-line bg-paper px-5 py-3 lg:hidden">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileNavOpen(false)}
                className="flex min-h-11 items-center border-b border-line/70 text-[13px] font-medium text-muted last:border-0 hover:text-ink"
              >
                {link.label}
              </a>
            ))}
            {!session ? (
              <Link
                to="/auth"
                onClick={() => setMobileNavOpen(false)}
                className="flex min-h-11 items-center text-[13px] font-medium text-forest"
              >
                Sign in to the console
              </Link>
            ) : null}
          </nav>
        ) : null}
      </header>

      <main id="main-content" tabIndex={-1} className="outline-none">
        <section id="scan" className="relative overflow-hidden border-b border-line">
          <div className="aegis-glow pointer-events-none absolute inset-0 opacity-80" aria-hidden="true" />
          <div
            className="aegis-grid-bg pointer-events-none absolute inset-0 opacity-45 [mask-image:linear-gradient(to_bottom,black,transparent_88%)]"
            aria-hidden="true"
          />
          <div className="aegis-container relative grid items-start gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.12fr)_minmax(340px,0.88fr)] lg:gap-16 lg:py-20">
            <div className="min-w-0">
              <p className="aegis-eyebrow">
                <span className="h-1.5 w-1.5 bg-forest" aria-hidden="true" />
                External attack surface · live evidence
              </p>
              <h1 className="aegis-display mt-7 max-w-[13ch]">
                Evidence,
                <br />
                not assumptions.
              </h1>
              <p className="aegis-lede mt-7">
                AEGIS runs observable, non-destructive probes against a live API and returns a defensible
                0–100 posture score across TLS, headers, leakage, and reputation.
              </p>

              <form onSubmit={handleScanSubmit} className="mt-9 max-w-2xl">
                <div className="aegis-input-shell gap-3 px-3.5 pl-4">
                  <Globe className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  <label htmlFor={scanInputId} className="sr-only">
                    Target API URL
                  </label>
                  <input
                    id={scanInputId}
                    type="url"
                    value={targetUrl}
                    onChange={(event) => setTargetUrl(event.target.value)}
                    placeholder="https://api.example.com/v1/health"
                    className="min-h-12 w-full bg-transparent font-mono text-[13.5px] text-ink outline-none placeholder:text-muted"
                    disabled={isScanning}
                    autoComplete="url"
                  />
                  <button
                    type="submit"
                    disabled={isScanning || !targetUrl.trim()}
                    className="aegis-primary-action min-h-10 shrink-0 px-3.5 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isScanning ? 'Starting…' : 'Run scan'}
                    <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="aegis-label">Try</span>
                  {SAMPLE_PRESETS.map((preset) => (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() => setTargetUrl(preset.url)}
                      disabled={isScanning}
                      className="inline-flex min-h-6 items-center font-mono text-[11px] text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink disabled:text-faint disabled:no-underline"
                    >
                      {preset.label}
                    </button>
                  ))}
                  <span className="ml-auto hidden font-mono text-[10px] uppercase tracking-[0.1em] text-muted sm:inline">
                    No account required
                  </span>
                </div>
                <p className="sr-only" aria-live="polite">
                  {isScanning ? 'Scan request submitted. Opening scan status.' : ''}
                </p>
              </form>

              <dl className="mt-10 grid grid-cols-2 border-t border-line-strong sm:grid-cols-4">
                {[
                  { v: '0–100', l: 'Deterministic score' },
                  { v: '04', l: 'Assessment pillars' },
                  { v: 'Zero', l: 'Exploit payloads' },
                  { v: 'PDF', l: 'Audit export' },
                ].map((item, index) => (
                  <div
                    key={item.l}
                    className={`py-4 pr-3 ${index > 0 ? 'sm:border-l sm:border-line sm:pl-4' : ''} ${index % 2 === 1 ? 'border-l border-line pl-4 sm:pl-4' : ''}`}
                  >
                    <dt className="font-display text-lg font-semibold leading-none tracking-tight text-ink">{item.v}</dt>
                    <dd className="mt-1.5 font-mono text-[10px] uppercase leading-tight tracking-[0.1em] text-muted">
                      {item.l}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <aside
              aria-label="Interactive posture estimator"
              className="aegis-panel relative lg:sticky lg:top-24"
            >
              <div className="aegis-panel-head">
                <div>
                  <p className="aegis-label">Posture estimator</p>
                  <p className="mt-1 text-[12.5px] text-muted">Model the score before you scan.</p>
                </div>
                <span className="rounded-[4px] border border-line-strong px-1.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
                  Planning tool
                </span>
              </div>

              <div className="flex items-end justify-between gap-4 px-5 pb-4 pt-5">
                <div>
                  <p className="aegis-label">Projected score</p>
                  <p className="mt-2 flex items-baseline gap-2" aria-live="polite">
                    <span className="aegis-metric-value text-ink">{estimatedScore}</span>
                    <span className="font-mono text-[11px] text-muted">/ 100</span>
                  </p>
                </div>
                <span
                  className={`border px-2 py-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] ${
                    grade === 'F'
                      ? 'border-critical/30 bg-critical/10 text-critical'
                      : grade === 'C'
                        ? 'border-medium/30 bg-medium/10 text-medium'
                        : 'border-safe/30 bg-safe/10 text-safe'
                  }`}
                >
                  Grade {grade}
                </span>
              </div>
              <div className="mx-5 mb-2 h-[3px] bg-line" aria-hidden="true">
                <div
                  className="h-full bg-forest transition-[width] duration-300"
                  style={{ width: `${estimatedScore}%` }}
                />
              </div>
              <p className="px-5 pb-5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                {enabledCount} of 4 controls · 100 weighted points
              </p>

              <div className="border-t border-line">
                {ESTIMATOR_OPTIONS.map((option) => {
                  const on = selectedChecks[option.id];
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setSelectedChecks((previous) => ({ ...previous, [option.id]: !previous[option.id] }))
                      }
                      className="flex min-h-[62px] w-full items-center gap-3 border-b border-line px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--aegis-focus)]"
                    >
                      <span
                        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center border ${
                          on ? 'border-forest bg-forest text-canvas' : 'border-line-strong bg-paper text-transparent'
                        }`}
                        aria-hidden="true"
                      >
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-medium leading-snug text-ink">{option.label}</span>
                        <span className="mt-0.5 block font-mono text-[10px] leading-snug text-muted">{option.hint}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">+{option.points}</span>
                    </button>
                  );
                })}
              </div>

              <p className="border-t border-line bg-canvas px-5 py-3.5 text-[11.5px] leading-relaxed text-muted">
                An estimate, not a verdict. A real scan probes the endpoint and scores the evidence it observes.
              </p>
            </aside>
          </div>
        </section>

        <section id="method" className="aegis-invert border-b border-line">
          <div className="aegis-container py-16 sm:py-20">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-16">
              <div>
                <p className="aegis-eyebrow">Probe sequence</p>
                <h2 className="aegis-section-title mt-4 text-ink">
                  Four checks.
                  <br />
                  One posture.
                </h2>
                <p className="mt-5 max-w-[42ch] text-[14.5px] leading-relaxed text-muted">
                  Every scan executes the same deterministic sequence. Nothing is inferred that was not observed,
                  and unassessed checks reduce coverage instead of inventing a result.
                </p>
                <a
                  href="#report"
                  className="mt-7 inline-flex min-h-6 items-center gap-2 border-b border-line-strong pb-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-accent hover:border-accent"
                >
                  See the report anatomy
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>

              <div className="border-t border-line">
                {PILLARS.map((pillar) => (
                  <article
                    key={pillar.n}
                    className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-b border-line py-6 sm:grid-cols-[auto_180px_1fr] sm:items-baseline sm:gap-x-6"
                  >
                    <span className="font-mono text-[10.5px] tracking-[0.1em] text-muted">{pillar.n}</span>
                    <h3 className="flex items-center gap-2.5 font-display text-[17px] font-semibold tracking-tight text-ink">
                      <pillar.icon className="h-4 w-4 text-accent" aria-hidden="true" />
                      {pillar.title}
                    </h3>
                    <div className="col-span-2 sm:col-span-1">
                      <p className="text-[13.5px] leading-relaxed text-muted">{pillar.body}</p>
                      <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                        {pillar.evidence}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="report" className="border-b border-line">
          <div className="aegis-container py-16 sm:py-20">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
              <div>
                <p className="aegis-eyebrow">Report anatomy</p>
                <h2 className="aegis-section-title mt-4">What arrives after the scan.</h2>
                <p className="mt-4 max-w-[52ch] text-[14.5px] leading-relaxed text-muted">
                  Not a wall of alerts. A structured record you can read top to bottom, then defend line by line.
                </p>

                <ol className="mt-8 border-t border-line-strong">
                  {REPORT_ITEMS.map((item, index) => (
                    <li key={item.label} className="grid grid-cols-[28px_1fr] gap-3 border-b border-line py-4">
                      <span className="font-mono text-[10.5px] leading-5 tracking-[0.08em] text-muted">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <span className="text-[13.5px] font-semibold text-ink">{item.label}</span>
                        <p className="mt-1 text-[13px] leading-relaxed text-muted">{item.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="lg:pt-14">
                <div className="aegis-panel overflow-hidden">
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                      <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                      OpenAPI · operation scope
                    </span>
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">YAML</span>
                  </div>
                  <pre className="overflow-x-auto bg-canvas p-5 font-mono text-[12px] leading-relaxed text-muted">
                    <code>{`openapi: 3.0.3
info:
  title: Payments
paths:
  /v2/charges:
    get:
      security: [bearerAuth]
      responses:
        "200":
          description: Charge list`}</code>
                  </pre>
                  <div className="flex flex-col gap-3 border-t border-line px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[13px] leading-relaxed text-muted">
                      Import a catalog, choose one operation, and probe it in isolation.
                    </p>
                    <Link
                      to="/spec"
                      className="aegis-secondary-action min-h-10 shrink-0 px-3.5 text-[12.5px]"
                    >
                      Open spec analyzer
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-3 divide-x divide-line border-y border-line py-5">
                  {[
                    { k: '25', v: 'TLS points' },
                    { k: '35', v: 'Header points' },
                    { k: '20 + 20', v: 'Leak / reputation' },
                  ].map((item) => (
                    <div key={item.v} className="px-3 first:pl-0 last:pr-0">
                      <p className="font-display text-xl font-semibold tracking-tight text-ink">{item.k}</p>
                      <p className="mt-1 font-mono text-[9.5px] uppercase leading-tight tracking-[0.1em] text-muted">
                        {item.v}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="questions" className="border-b border-line bg-paper">
          <div className="aegis-container grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)] lg:gap-16">
            <div>
              <p className="aegis-eyebrow">Common questions</p>
              <h2 className="aegis-section-title mt-4">Before you point it at production.</h2>
              <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
                Still uncertain? The console includes a live health and configuration surface.
              </p>
              <Link to="/settings" className="aegis-link mt-5 inline-flex min-h-6 items-center text-[13px] text-ink">
                Inspect runtime settings
              </Link>
            </div>
            <div className="border-t border-line-strong">
              {FAQ_ITEMS.map((item, index) => {
                const isOpen = openFaq === index;
                return (
                  <div key={item.q} className="border-b border-line">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`faq-panel-${index}`}
                      onClick={() => setOpenFaq(isOpen ? null : index)}
                      className="flex min-h-[58px] w-full items-center justify-between gap-4 py-4 text-left transition-colors hover:text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--aegis-focus)]"
                    >
                      <span className="flex items-baseline gap-3 text-[13.5px] font-medium text-ink">
                        <span className="font-mono text-[10px] text-muted">{String(index + 1).padStart(2, '0')}</span>
                        {item.q}
                      </span>
                      {isOpen ? (
                        <Minus className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      ) : (
                        <Plus className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      )}
                    </button>
                    {isOpen ? (
                      <p
                        id={`faq-panel-${index}`}
                        className="max-w-[68ch] pb-5 pl-8 pr-4 text-[13px] leading-relaxed text-muted"
                      >
                        {item.a}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="aegis-container py-14 sm:py-20">
          <div className="aegis-invert relative overflow-hidden border border-line-strong px-6 py-10 sm:px-10 sm:py-12">
            <div className="aegis-grid-bg pointer-events-none absolute inset-0 opacity-[0.16]" aria-hidden="true" />
            <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="aegis-eyebrow">Start with one endpoint</p>
                <h2 className="mt-4 max-w-[18ch] font-display text-[clamp(1.75rem,3.6vw,3rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-ink">
                  Fifteen seconds to a real picture.
                </h2>
                <p className="mt-4 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
                  Paste a URL. Read the score. Fix what matters. No agent, no instrumentation, no production writes.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-3">
                <a href="#scan" className="aegis-signal-action">
                  <Crosshair className="h-4 w-4" aria-hidden="true" />
                  Run a scan
                </a>
                <Link
                  to={session ? '/dashboard' : '/auth'}
                  className="inline-flex min-h-11 items-center justify-center gap-2 border border-line-strong px-4 text-[13.5px] font-medium text-ink transition-colors hover:border-accent hover:text-accent"
                >
                  {session ? 'Open console' : 'Create an account'}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-paper py-8">
        <div className="aegis-container flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <BrandLogo to="/" size="sm" subtitle="API security, scored" />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
            <a href="#method" className="inline-flex min-h-6 items-center hover:text-ink">Method</a>
            <Link to="/dashboard" className="inline-flex min-h-6 items-center hover:text-ink">Console</Link>
            <Link to="/spec" className="inline-flex min-h-6 items-center hover:text-ink">Specs</Link>
            <Link to="/settings" className="inline-flex min-h-6 items-center hover:text-ink">Runtime</Link>
          </nav>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">© {CURRENT_YEAR} AEGIS</p>
        </div>
      </footer>
    </div>
  );
}
