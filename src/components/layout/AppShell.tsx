import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import {
  Building2, LayoutDashboard, Radar, Send, Settings, LogOut, Search, Sun, Moon,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CommandPalette } from './CommandPalette';

const SIDEBAR_STATE_KEY = 'faf:sidebar-collapsed';

const NAV = [
  { to: '/',          label: 'Dashboard', icon: LayoutDashboard },
  { to: '/agencies',  label: 'Agencies',  icon: Building2 },
  { to: '/sweeps',    label: 'Sweeps',    icon: Radar },
  { to: '/outreach',  label: 'Outreach',  icon: Send },
  { to: '/settings',  label: 'Settings',  icon: Settings },
] as const;

export function AppShell() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dark, setDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_STATE_KEY) === '1';
  });
  // True for one render after the route effect force-collapses, so the
  // persistence effect knows not to overwrite the user's saved preference
  // with the route-forced value.
  const routeForcedRef = useRef(false);

  useEffect(() => {
    if (routeForcedRef.current) {
      routeForcedRef.current = false;
      return; // skip persist — preserve user's global preference
    }
    window.localStorage.setItem(SIDEBAR_STATE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Auto-collapse on data-dense pages (Agencies table). Effect re-runs on every
  // route change, so navigating away and back collapses again — but the user
  // can still manually expand while on the page (the effect only fires when
  // the pathname changes, not on every render). The route-forced collapse
  // does NOT persist to localStorage, so other pages keep their user-chosen
  // state. Setting routeForcedRef only when we'd actually flip the state means
  // a subsequent manual toggle still persists correctly.
  useEffect(() => {
    if (location.pathname.startsWith('/agencies')) {
      setCollapsed((prev) => {
        if (!prev) routeForcedRef.current = true;
        return true;
      });
    }
  }, [location.pathname]);

  // ⌘+K / Ctrl+K opens the command palette anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleTheme();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function toggleTheme() {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    setDark(next);
  }

  const currentSection = NAV.find((n) =>
    n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to),
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* ─── Sidebar (collapsible) ────────────────────────────────────────── */}
      <aside
        className={cn(
          'shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col transition-[width] duration-200',
          collapsed ? 'w-[60px]' : 'w-[240px]',
        )}
      >
        {/* Brand */}
        <div className={cn('h-14 flex items-center border-b border-sidebar-border', collapsed ? 'px-0 justify-center' : 'px-4 gap-2')}>
          <div className="h-7 w-7 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Radar className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-[11px] font-mono tracking-wider text-muted-foreground uppercase">Falisha</div>
              <div className="text-[13px] font-semibold">Agent Finder</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className={cn('flex-1 space-y-0.5', collapsed ? 'p-2' : 'p-3')}>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              title={collapsed ? n.label : undefined}
              className={({ isActive }) =>
                cn(
                  'group flex items-center h-8 rounded-md text-[13px] font-medium transition-colors relative',
                  'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  isActive && 'text-foreground bg-muted',
                  collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />}
                  <n.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {!collapsed && <span>{n.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className={cn('border-t border-sidebar-border space-y-1', collapsed ? 'p-2' : 'p-3 space-y-2')}>
          {!collapsed && (
            <>
              <button
                onClick={() => setPaletteOpen(true)}
                className="w-full flex items-center justify-between h-8 px-2.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                <span className="flex items-center gap-2"><Search className="h-3.5 w-3.5" /> Search</span>
                <span className="flex items-center gap-1"><kbd>⌘</kbd><kbd>K</kbd></span>
              </button>
              <button
                onClick={toggleTheme}
                className="w-full flex items-center justify-between h-8 px-2.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                <span className="flex items-center gap-2">
                  {dark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                  {dark ? 'Dark' : 'Light'}
                </span>
                <span className="flex items-center gap-1"><kbd>⌘</kbd><kbd>⇧</kbd><kbd>L</kbd></span>
              </button>
            </>
          )}
          {collapsed && (
            <>
              <button onClick={() => setPaletteOpen(true)} title="Search (⌘K)"
                className="w-full h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60">
                <Search className="h-3.5 w-3.5" />
              </button>
              <button onClick={toggleTheme} title={dark ? 'Light mode' : 'Dark mode'}
                className="w-full h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60">
                {dark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              </button>
            </>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar (⌘\\)' : 'Collapse sidebar (⌘\\)'}
            className={cn(
              'w-full h-8 flex items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors',
              collapsed ? 'justify-center' : 'justify-between px-2.5 text-[12px]'
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            ) : (
              <>
                <span className="flex items-center gap-2"><PanelLeftClose className="h-3.5 w-3.5" /> Collapse</span>
                <span className="flex items-center gap-1"><kbd>⌘</kbd><kbd>\</kbd></span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ─── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top strip */}
        <header className="h-14 px-6 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{currentSection?.label ?? 'Dashboard'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => { void logout(); navigate('/login'); }}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="max-w-[1440px] mx-auto px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
