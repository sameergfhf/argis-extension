import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  History,
  FileCode2,
  Settings,
  LogOut,
  Users,
  Building2,
  ChevronDown,
  Plus,
  Check,
  Globe,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { ThemeToggle } from './ui';
import BrandLogo from './BrandLogo';
import toast from 'react-hot-toast';

const navItems = [
  { to: '/dashboard', label: 'Overview', exact: true, icon: LayoutDashboard },
  { to: '/spec', label: 'Specs', icon: FileCode2 },
  { to: '/history', label: 'History', icon: History },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const routeNames: Record<string, string> = {
  dashboard: 'Overview',
  history: 'Scan history',
  team: 'Team',
  spec: 'Spec analyzer',
  'operation-scan': 'Operation scan',
  settings: 'Settings',
  scan: 'Scan report',
};

export default function Layout({ children }: { children?: React.ReactNode } = {}) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { workspaces, currentWorkspace, setCurrentWorkspace, invitations } = useWorkspace();
  const [openMenu, setOpenMenu] = useState<'workspace' | 'account' | null>(null);

  useEffect(() => {
    setOpenMenu(null);
  }, [location.pathname]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenMenu(null);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function handleSignOut() {
    setOpenMenu(null);
    await signOut();
    toast.success('Signed out.');
  }

  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email?.split('@')[0] ??
    'Operator';
  const avatarUrl: string | undefined = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture;
  const initials = displayName
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join('');

  const sectionKey = location.pathname.split('/').filter(Boolean)[0] ?? 'dashboard';
  const sectionName = routeNames[sectionKey] ?? 'Console';

  const WorkspaceMenu = (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 cursor-default"
        aria-label="Close workspace menu"
        tabIndex={-1}
        onClick={() => setOpenMenu(null)}
      />
      <div
        role="menu"
        aria-label="Switch workspace"
        className="absolute right-0 top-full z-50 mt-2 max-h-[60vh] w-72 overflow-y-auto rounded-[6px] border border-line-strong bg-paper p-1.5 shadow-[var(--shadow-overlay)]"
      >
        <p className="aegis-label px-3 pb-2 pt-2">Workspace</p>
        {workspaces.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted">No workspaces yet</p>
        ) : (
          workspaces.map((ws) => {
            const active = ws.id === currentWorkspace?.id;
            return (
              <button
                key={ws.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setCurrentWorkspace(ws);
                  setOpenMenu(null);
                }}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-[4px] px-3 py-2 text-left text-sm transition-colors ${
                  active ? 'bg-elevated font-semibold text-ink' : 'text-muted hover:bg-elevated hover:text-ink'
                }`}
              >
                <span className="min-w-0 truncate">{ws.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{ws.role}</span>
                  {active ? <Check className="h-3.5 w-3.5 text-forest" aria-hidden="true" /> : null}
                </span>
              </button>
            );
          })
        )}
        {invitations.length > 0 ? (
          <Link
            to="/team"
            onClick={() => setOpenMenu(null)}
            className="mt-1 flex min-h-11 items-center justify-between gap-2 border-t border-line px-3 pt-2 text-sm font-semibold text-forest"
          >
            <span>Pending invitations</span>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-accent px-1.5 font-mono text-[10px] font-semibold text-[var(--aegis-accent-ink)]">
              {invitations.length}
            </span>
          </Link>
        ) : null}
        <Link
          to="/team"
          onClick={() => setOpenMenu(null)}
          className="mt-1 flex min-h-11 items-center gap-2 border-t border-line px-3 pt-2 text-sm font-semibold text-ink hover:text-forest"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Manage workspaces
        </Link>
      </div>
    </>
  );

  return (
    <div className="aegis-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <div className="aegis-statusbar">
        <div className="aegis-container aegis-statusbar-inner">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-3 w-3 text-accent" aria-hidden="true" />
            <span className="hidden sm:inline">AEGIS / CONTROL</span>
            <span className="sm:hidden">AEGIS</span>
          </span>
          <span className="hidden items-center gap-2 border-l border-white/15 pl-4 sm:flex">
            <Building2 className="h-3 w-3" aria-hidden="true" />
            {currentWorkspace?.name ?? 'Personal workspace'}
          </span>
          <span className="ml-auto flex items-center gap-4">
            <span className="hidden items-center gap-2 md:flex">
              <span className="aegis-live-dot aegis-live-dot--pulse" aria-hidden="true" />
              Session active
            </span>
            <span className="hidden border-l border-white/15 pl-4 md:inline">{sectionName}</span>
          </span>
        </div>
      </div>

      <header className="aegis-appbar">
        <div className="aegis-container relative flex h-16 items-center gap-4">
          <BrandLogo to="/dashboard" size="sm" />

          <nav
            aria-label="Primary"
            className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-4 lg:flex xl:gap-6"
          >
            {navItems.map(({ to, label, exact }) => (
              <NavLink key={to} to={to} end={exact} className="aegis-navlink">
                {label}
                {to === '/team' && invitations.length > 0 ? (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-accent px-1 font-mono text-[9px] font-semibold text-[var(--aegis-accent-ink)]">
                    {invitations.length}
                  </span>
                ) : null}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <div className="relative hidden xl:block">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={openMenu === 'workspace'}
                onClick={() => setOpenMenu((current) => (current === 'workspace' ? null : 'workspace'))}
                className="flex min-h-10 max-w-[200px] items-center gap-2 rounded-[6px] border border-transparent px-2.5 transition-colors hover:border-line-strong hover:bg-canvas"
              >
                <span className="min-w-0 truncate text-[13px] font-medium leading-tight text-ink">
                  {currentWorkspace?.name ?? 'Personal'}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-150 ${openMenu === 'workspace' ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {openMenu === 'workspace' ? WorkspaceMenu : null}
            </div>

            <ThemeToggle className="hidden sm:inline-flex" />

            <span className="hidden min-[380px]:block">
              <Link
                to="/dashboard"
                className="aegis-signal-action min-h-10 items-center gap-2 px-3.5"
              >
                <span>New scan</span>
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Link>
            </span>

            <div className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={openMenu === 'account'}
                onClick={() => setOpenMenu((current) => (current === 'account' ? null : 'account'))}
                className="flex min-h-11 items-center gap-2 rounded-[6px] border border-transparent p-1 transition-colors hover:border-line-strong hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                aria-label={`Account menu for ${displayName}`}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-8 w-8 rounded-[6px] object-cover" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-forest/30 bg-forest/10 font-mono text-[11px] font-medium text-forest">
                    {initials || 'OP'}
                  </span>
                )}
                <span className="hidden max-w-[120px] truncate text-[13px] font-medium text-ink min-[1440px]:block">{displayName}</span>
                <ChevronDown
                  className={`hidden h-3.5 w-3.5 text-muted transition-transform duration-150 sm:block ${openMenu === 'account' ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {openMenu === 'account' ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default"
                    aria-label="Close account menu"
                    tabIndex={-1}
                    onClick={() => setOpenMenu(null)}
                  />
                  <div
                    role="menu"
                    aria-label="Account"
                    className="absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-5.5rem)] w-[min(88vw,300px)] overflow-y-auto rounded-[6px] border border-line-strong bg-paper p-1.5 shadow-[var(--shadow-overlay)]"
                  >
                    <div className="border-b border-line px-3 pb-3 pt-2">
                      <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted">{user?.email}</p>
                    </div>

                    <div className="border-b border-line py-1.5 xl:hidden">
                      <p className="aegis-label px-3 pb-1 pt-1">Workspace</p>
                      {workspaces.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted">No workspaces yet</p>
                      ) : (
                        workspaces.map((ws) => (
                          <button
                            key={ws.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={ws.id === currentWorkspace?.id}
                            onClick={() => {
                              setCurrentWorkspace(ws);
                              setOpenMenu(null);
                            }}
                            className="flex min-h-10 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-muted hover:bg-elevated hover:text-ink"
                          >
                            <span className="min-w-0 truncate">{ws.name}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{ws.role}</span>
                              {ws.id === currentWorkspace?.id ? (
                                <Check className="h-3.5 w-3.5 shrink-0 text-forest" aria-hidden="true" />
                              ) : null}
                            </span>
                          </button>
                        ))
                      )}
                    </div>

                    <div className="flex items-center justify-between px-3 py-2 md:hidden">
                      <span className="text-sm text-muted">Appearance</span>
                      <ThemeToggle />
                    </div>

                    <Link
                      to="/team"
                      role="menuitem"
                      onClick={() => setOpenMenu(null)}
                      className="flex min-h-11 items-center gap-2.5 px-3 text-sm text-ink hover:bg-elevated"
                    >
                      <Users className="h-4 w-4 text-muted" aria-hidden="true" />
                      Team &amp; workspaces
                    </Link>
                    <Link
                      to="/"
                      role="menuitem"
                      onClick={() => setOpenMenu(null)}
                      className="flex min-h-11 items-center gap-2.5 px-3 text-sm text-ink hover:bg-elevated"
                    >
                      <Globe className="h-4 w-4 text-muted" aria-hidden="true" />
                      Public site
                    </Link>
                    <Link
                      to="/settings"
                      role="menuitem"
                      onClick={() => setOpenMenu(null)}
                      className="flex min-h-11 items-center gap-2.5 px-3 text-sm text-ink hover:bg-elevated"
                    >
                      <Settings className="h-4 w-4 text-muted" aria-hidden="true" />
                      Configuration &amp; health
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleSignOut}
                      className="mt-1 flex min-h-11 w-full items-center gap-2.5 border-t border-line px-3 text-left text-sm font-medium text-critical hover:bg-elevated"
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                      Sign out
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="aegis-main focus:outline-none">
        {children ?? <Outlet />}
      </main>

      <nav aria-label="Primary mobile" className="aegis-bottomnav lg:hidden">
        {navItems.map(({ to, label, exact, icon: Icon }) => (
          <NavLink key={to} to={to} end={exact} aria-label={label}>
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
