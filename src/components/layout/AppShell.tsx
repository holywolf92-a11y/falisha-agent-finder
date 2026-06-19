import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Building2, LayoutDashboard, Radar, Send, Settings, LogOut, Search, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CommandPalette } from './CommandPalette';

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
      {/* ─── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-[240px] shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        {/* Brand */}
        <div className="h-14 px-4 flex items-center gap-2 border-b border-sidebar-border">
          <div className="h-7 w-7 rounded-md bg-primary/15 text-primary flex items-center justify-center">
            <Radar className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-[11px] font-mono tracking-wider text-muted-foreground uppercase">Falisha</div>
            <div className="text-[13px] font-semibold">Agent Finder</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] font-medium transition-colors',
                  'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  isActive && 'text-foreground bg-muted relative',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />}
                  <n.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span>{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-sidebar-border space-y-2">
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
