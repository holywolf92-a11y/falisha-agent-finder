# Falisha Agent Finder — Frontend Guide

> A premium internal B2B SaaS dashboard built in 5 days. Dark-primary, deep-teal
> brand, Linear/Vercel-inspired density. This document is a complete walkthrough
> of the stack, the design system, and the patterns we use so another developer
> can replicate the look-and-feel from scratch.

---

## Visual reference

### 1. App shell — sidebar + main content + side drawer

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 360" width="100%" style="max-width:880px;background:#0a0f0e;border-radius:8px;font-family:Inter,system-ui,sans-serif">
  <!-- sidebar -->
  <rect x="0" y="0" width="200" height="360" fill="#0f1716"/>
  <rect x="199" y="0" width="1" height="360" fill="#1a2624"/>
  <!-- brand block -->
  <rect x="16" y="14" width="28" height="28" rx="6" fill="#14B8A6" opacity="0.18"/>
  <circle cx="30" cy="28" r="6" fill="none" stroke="#14B8A6" stroke-width="1.5"/>
  <text x="52" y="22" fill="#6b7775" font-size="9" letter-spacing="1.4">FALISHA</text>
  <text x="52" y="34" fill="#e7eeec" font-size="12" font-weight="600">Agent Finder</text>
  <line x1="0" y1="56" x2="200" y2="56" stroke="#1a2624"/>
  <!-- nav items -->
  <g font-size="12" fill="#9ba7a4">
    <rect x="12" y="72" width="176" height="28" rx="6" fill="#1a2624"/>
    <rect x="12" y="72" width="2" height="28" rx="1" fill="#14B8A6"/>
    <text x="36" y="89" fill="#e7eeec">Dashboard</text>
    <text x="36" y="119">Agencies</text>
    <text x="36" y="149">Sweeps</text>
    <text x="36" y="179">Outreach</text>
    <text x="36" y="209">Settings</text>
  </g>
  <!-- collapse button -->
  <rect x="12" y="316" width="176" height="28" rx="6" fill="none" stroke="#1a2624"/>
  <text x="24" y="334" fill="#6b7775" font-size="10.5">⟨ Collapse</text>

  <!-- main content -->
  <rect x="201" y="0" width="679" height="48" fill="#0a0f0e"/>
  <line x1="201" y1="48" x2="880" y2="48" stroke="#1a2624"/>
  <text x="220" y="30" fill="#6b7775" font-size="11">Agencies</text>
  <text x="820" y="30" fill="#9ba7a4" font-size="11">Sign out</text>

  <!-- filter bar -->
  <rect x="220" y="68" width="240" height="28" rx="6" fill="#0f1716" stroke="#1a2624"/>
  <text x="240" y="86" fill="#6b7775" font-size="11">🔍 Search by name or address…</text>
  <rect x="470" y="68" width="80" height="28" rx="6" fill="#0f1716" stroke="#1a2624"/>
  <text x="482" y="86" fill="#9ba7a4" font-size="11">★ 4+ ▾</text>
  <rect x="560" y="68" width="100" height="28" rx="6" fill="#0f1716" stroke="#1a2624"/>
  <text x="572" y="86" fill="#9ba7a4" font-size="11">≥ 20 reviews ▾</text>

  <!-- table headers -->
  <line x1="220" y1="118" x2="860" y2="118" stroke="#1a2624"/>
  <g font-size="10" fill="#6b7775">
    <text x="220" y="134">Agency</text>
    <text x="380" y="134">Country</text>
    <text x="460" y="134">Rating</text>
    <text x="530" y="134">Contact</text>
    <text x="720" y="134">Status</text>
  </g>
  <line x1="220" y1="144" x2="860" y2="144" stroke="#1a2624"/>
  <!-- table rows -->
  <g font-size="11" fill="#e7eeec">
    <text x="220" y="164">MedGlob Consultancy</text>
    <text x="380" y="164" fill="#9ba7a4">🇦🇪 UAE</text>
    <text x="460" y="164">★ 5 (1538)</text>
    <text x="530" y="164" fill="#9ba7a4" font-family="JetBrains Mono,monospace" font-size="10">+971 50 214 2696</text>
    <rect x="650" y="156" width="14" height="14" rx="3" fill="#14B8A6" opacity="0.15"/>
    <text x="655" y="166" fill="#14B8A6" font-size="9">💬</text>
    <rect x="720" y="156" width="56" height="14" rx="7" fill="#10b981" opacity="0.15"/>
    <text x="728" y="166" fill="#10b981" font-size="9">Enriched</text>
  </g>
  <line x1="220" y1="180" x2="860" y2="180" stroke="#1a2624"/>
  <g font-size="11" fill="#e7eeec">
    <text x="220" y="200">TCI HR Consultancy</text>
    <text x="380" y="200" fill="#9ba7a4">🇦🇪 UAE</text>
    <text x="460" y="200">★ 4.9 (267)</text>
    <text x="530" y="200" fill="#9ba7a4" font-family="JetBrains Mono,monospace" font-size="10">+971 56 994 7486</text>
    <rect x="720" y="192" width="56" height="14" rx="7" fill="#10b981" opacity="0.15"/>
    <text x="728" y="202" fill="#10b981" font-size="9">Enriched</text>
  </g>
  <line x1="220" y1="216" x2="860" y2="216" stroke="#1a2624"/>
  <g font-size="11" fill="#e7eeec">
    <text x="220" y="236">Antons Recruitment</text>
    <text x="380" y="236" fill="#9ba7a4">🇦🇪 UAE</text>
    <text x="460" y="236">★ 5 (24)</text>
    <text x="530" y="236" fill="#9ba7a4">—</text>
    <rect x="720" y="228" width="42" height="14" rx="7" fill="#374151" opacity="0.5"/>
    <text x="728" y="238" fill="#9ba7a4" font-size="9">Pending</text>
  </g>

  <!-- drawer (right side) -->
  <rect x="600" y="0" width="280" height="360" fill="#0f1716" stroke="#1a2624"/>
  <line x1="600" y1="48" x2="600" y2="360" stroke="#1a2624"/>
  <text x="616" y="22" fill="#6b7775" font-size="9" letter-spacing="1">AGENCY</text>
  <text x="616" y="36" fill="#e7eeec" font-size="11" font-weight="600">MedGlob Consultancy</text>
  <text x="858" y="30" fill="#9ba7a4" font-size="14">✕</text>
  <rect x="800" y="60" width="60" height="18" rx="9" fill="#10b981" opacity="0.15" stroke="#10b981" stroke-opacity="0.3"/>
  <text x="812" y="73" fill="#10b981" font-size="9">Operational</text>
  <text x="616" y="78" fill="#e7eeec" font-size="14" font-weight="600">MedGlob Consultancy</text>
  <text x="616" y="98" fill="#f59e0b" font-size="11">★</text>
  <text x="626" y="98" fill="#e7eeec" font-size="11" font-weight="500">5</text>
  <text x="636" y="98" fill="#9ba7a4" font-size="11">(1538)</text>
  <text x="616" y="124" fill="#6b7775" font-size="9" letter-spacing="1.2">CONTACT</text>
  <rect x="616" y="132" width="24" height="24" rx="4" fill="#1a2624"/>
  <text x="624" y="148" fill="#9ba7a4" font-size="11">☎</text>
  <text x="648" y="143" fill="#e7eeec" font-family="JetBrains Mono,monospace" font-size="10">+971 50 214 2696</text>
  <text x="648" y="155" fill="#6b7775" font-size="8" letter-spacing="1">MAIN</text>
</svg>
```

### 2. Color tokens — dark theme primary, deep teal accent

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 130" width="100%" style="max-width:800px;font-family:Inter,system-ui,sans-serif">
  <g>
    <rect x="0"   y="0" width="120" height="100" rx="6" fill="#0a0f0e"/>
    <text x="60"  y="118" text-anchor="middle" font-size="10" fill="#666">--background</text>
    <text x="60"  y="50" text-anchor="middle" font-size="9" fill="#fff" font-family="JetBrains Mono,monospace">#0a0f0e</text>

    <rect x="130" y="0" width="120" height="100" rx="6" fill="#111313"/>
    <text x="190" y="118" text-anchor="middle" font-size="10" fill="#666">--card</text>
    <text x="190" y="50" text-anchor="middle" font-size="9" fill="#fff" font-family="JetBrains Mono,monospace">#111313</text>

    <rect x="260" y="0" width="120" height="100" rx="6" fill="#14B8A6"/>
    <text x="320" y="118" text-anchor="middle" font-size="10" fill="#666">--primary (dark)</text>
    <text x="320" y="50" text-anchor="middle" font-size="9" fill="#fff" font-family="JetBrains Mono,monospace">#14B8A6</text>

    <rect x="390" y="0" width="120" height="100" rx="6" fill="#0F766E"/>
    <text x="450" y="118" text-anchor="middle" font-size="10" fill="#666">--primary (light)</text>
    <text x="450" y="50" text-anchor="middle" font-size="9" fill="#fff" font-family="JetBrains Mono,monospace">#0F766E</text>

    <rect x="520" y="0" width="120" height="100" rx="6" fill="#10b981"/>
    <text x="580" y="118" text-anchor="middle" font-size="10" fill="#666">--success</text>
    <text x="580" y="50" text-anchor="middle" font-size="9" fill="#fff" font-family="JetBrains Mono,monospace">#10b981</text>

    <rect x="650" y="0" width="120" height="100" rx="6" fill="#f43f5e"/>
    <text x="710" y="118" text-anchor="middle" font-size="10" fill="#666">--destructive</text>
    <text x="710" y="50" text-anchor="middle" font-size="9" fill="#fff" font-family="JetBrains Mono,monospace">#f43f5e</text>
  </g>
</svg>
```

---

## Table of contents

- [Stack at a glance](#stack-at-a-glance)
- [Design philosophy](#design-philosophy)
- [Design tokens](#design-tokens)
- [Layout: AppShell pattern](#layout-appshell-pattern)
- [Collapsible sidebar](#collapsible-sidebar)
- [Command palette (⌘+K)](#command-palette-k)
- [Auth pattern (login + session)](#auth-pattern-login--session)
- [Data fetching: typed `api` helper + React Query](#data-fetching-typed-api-helper--react-query)
- [Premium UX building blocks](#premium-ux-building-blocks)
  - [Cards & status badges](#cards--status-badges)
  - [Filterable data table](#filterable-data-table)
  - [Side drawer with Framer Motion](#side-drawer-with-framer-motion)
  - [Modal dialogs (Radix)](#modal-dialogs-radix)
  - [Toast notifications (Sonner)](#toast-notifications-sonner)
- [Feature deep-dive: filter-based enrichment](#feature-deep-dive-filter-based-enrichment)
- [Feature deep-dive: monthly quota widget](#feature-deep-dive-monthly-quota-widget)
- [File structure](#file-structure)
- [Running locally](#running-locally)
- [References & credits](#references--credits)

---

## Stack at a glance

| Layer | Choice | Version | Why |
|---|---|---|---|
| Build tool | **Vite** | 6.x | Fast HMR, native ESM, instant builds. |
| UI lib | **React 18** | 18.3.x | Stable, mature, suspense + hooks. |
| Language | **TypeScript** | 5.7.x | Strict mode catches refactors. |
| Styling | **Tailwind CSS 3** | 3.4.x | Utility-first; pairs with shadcn primitives. |
| Component primitives | **Radix UI** + **shadcn-style** | 1.x | Accessibility for free; copy-paste-owned components. |
| Icons | **Lucide React** | 0.468.x | Clean, consistent, stroke 1.5 reads premium at 16px. |
| Animations | **Framer Motion** | 11.x | Used sparingly — drawer slide + login shake only. |
| Command palette | **cmdk** | 1.x | The Raycast-style palette underneath every premium tool. |
| Toast | **Sonner** | 1.x | Best modern toast — stacked, dismissable, promise-aware. |
| Forms | **React Hook Form** + **Zod** | 7 + 3 | Typed validation across client + server. |
| Data | **TanStack Query** | 5.x | Caching + optimistic mutations. |
| Routing | **React Router** | 7.x | Plain client routing. |
| Backend (same repo) | **Express 4** + **jose** + **bcryptjs** | — | Auth middleware + cookie sessions. |
| Database | **Supabase** | — | Hosted Postgres + JS client. |
| Deploy | **Railway** (Dockerfile) | — | Single container runs the Express server which serves the built SPA from `dist/web`. |

The whole app is **~30 components, 6 pages, 5 backend routers**, single container, single Postgres.

---

## Design philosophy

Three rules that drive every visual decision:

1. **Dark primary, single accent.** Internal-tool users live here for hours — dark reduces eye strain and reads as "premium tool" (Linear, Vercel, Arc, Raycast all default dark). The accent is **deep teal** because it's recruitment-coded (Falisha is a manpower agency) and distinct from the generic shadcn violet that every starter dashboard uses.
2. **Information density wins over whitespace.** 12–13px body text, 32px table rows, tabular numerals — the agencies table needs to show 25+ rows above the fold. Linear-tight, not Stripe-airy.
3. **Animations exist only when they signal something.** Drawer slide (iOS-feel spring), login shake on bad password, command palette fade+zoom. Everything else is a 120ms CSS transition. No scroll-driven animation. No micro-interactions on hover beyond color changes.

---

## Design tokens

All theming flows through **CSS variables** so the dark/light swap is a single class on `<html>`. Configured in `src/index.css`:

```css
@layer base {
  :root {
    /* Light theme tokens */
    --background:           0 0% 100%;
    --foreground:           220 25% 12%;
    --card:                 0 0% 100%;
    --primary:              173 80% 26%;   /* #0F766E deep teal */
    --primary-foreground:   0 0% 100%;
    --muted-foreground:     215 15% 45%;
    --success:              160 84% 39%;
    --warning:              38 92% 50%;
    --destructive:          0 84% 60%;
    --border:               220 15% 90%;
    --radius:               0.6rem;
  }
  .dark {
    /* Dark theme — daily-driver mode */
    --background:           180 10% 6%;    /* near-black with a teal tint */
    --foreground:           210 17% 95%;
    --card:                 180 10% 8%;
    --primary:              172 66% 50%;   /* #14B8A6 brighter teal for dark */
    --muted:                180 10% 12%;
    --muted-foreground:     215 10% 65%;
    --success:              160 70% 45%;
    --border:               180 8% 16%;
  }
}
```

Tailwind picks them up via the config:

```ts
// tailwind.config.ts
extend: {
  colors: {
    background: 'hsl(var(--background))',
    foreground: 'hsl(var(--foreground))',
    primary:    { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
    success:    { DEFAULT: 'hsl(var(--success))',  foreground: 'hsl(var(--success-foreground))' },
    // ...
  },
  fontFamily: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
  },
}
```

### Typography

- **Inter Variable** for UI (one file covers 100–900 weights, no FOUT)
- **JetBrains Mono** for phone numbers, IDs, masked API keys — true monospace ligatures
- Numbers in tables use `font-variant-numeric: tabular-nums` via a `.tabular` utility class so columns line up

### Spacing scale

```
2  4  6  8  12  16  24  32  48  px
```
The 32px row height is the Linear standard — comfortably fits a country flag + name + status badge at 13px line-height 1.4.

---

## Layout: AppShell pattern

The whole authenticated app sits inside one shell component that owns the sidebar, the top strip, and the routed outlet.

```tsx
// src/App.tsx
return (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<AppShell />}>
      <Route path="/"          element={<DashboardPage />} />
      <Route path="/agencies"  element={<AgenciesPage />} />
      <Route path="/sweeps"    element={<SweepsPage />} />
      <Route path="/outreach"  element={<OutreachPage />} />
      <Route path="/settings"  element={<SettingsPage />} />
    </Route>
  </Routes>
);
```

```tsx
// src/components/layout/AppShell.tsx (simplified)
export function AppShell() {
  return (
    <div className="min-h-screen flex">
      <aside className="w-[240px] shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        {/* brand */}
        {/* nav */}
        {/* footer with theme + collapse buttons */}
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 px-6 flex items-center justify-between border-b border-border">
          {/* breadcrumb + sign out */}
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
```

The `max-w-[1440px] mx-auto` keeps content readable on ultra-wide monitors without locking the sidebar position.

---

## Collapsible sidebar

The sidebar collapses from 240px to 60px (icon-only) with the state persisted in `localStorage` so it survives refreshes. Keyboard shortcut: **⌘+\\**.

```tsx
const SIDEBAR_STATE_KEY = 'faf:sidebar-collapsed';

const [collapsed, setCollapsed] = useState<boolean>(() => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SIDEBAR_STATE_KEY) === '1';
});

useEffect(() => {
  localStorage.setItem(SIDEBAR_STATE_KEY, collapsed ? '1' : '0');
}, [collapsed]);

useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
      e.preventDefault();
      setCollapsed((c) => !c);
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, []);
```

```tsx
<aside
  className={cn(
    'shrink-0 border-r bg-sidebar flex flex-col transition-[width] duration-200',
    collapsed ? 'w-[60px]' : 'w-[240px]',
  )}
>
  {NAV.map((n) => (
    <NavLink
      to={n.to}
      title={collapsed ? n.label : undefined}
      className={({ isActive }) =>
        cn(
          'group flex items-center h-8 rounded-md text-[13px] font-medium relative',
          'text-muted-foreground hover:text-foreground hover:bg-muted/60',
          isActive && 'text-foreground bg-muted',
          collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5',
        )
      }
    >
      <n.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      {!collapsed && <span>{n.label}</span>}
    </NavLink>
  ))}
</aside>
```

The `transition-[width]` animates only the width (not all properties), avoiding the layout thrash you'd get from `transition-all`.

---

## Command palette (⌘+K)

The single most powerful "premium" touch. Built with the `cmdk` library.

```tsx
// src/components/layout/CommandPalette.tsx (simplified)
import { Command } from 'cmdk';

export function CommandPalette({ open, onOpenChange }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm animate-in fade-in-0"
         onClick={() => onOpenChange(false)}>
      <div className="absolute left-1/2 top-[20%] -translate-x-1/2 w-full max-w-lg
                      rounded-xl border bg-popover shadow-2xl overflow-hidden animate-in zoom-in-95"
           onClick={(e) => e.stopPropagation()}>
        <Command>
          <Command.Input placeholder="Type a command or search…"
            className="w-full h-12 px-4 bg-transparent border-b text-sm outline-none" />
          <Command.List className="max-h-[60vh] overflow-y-auto p-1">
            <Command.Group heading="Jump to">
              <Item icon={<LayoutDashboard />} label="Dashboard" hint="G then D" onSelect={() => navigate('/')} />
              <Item icon={<Building2 />}       label="Agencies"  hint="G then A" onSelect={() => navigate('/agencies')} />
              <Item icon={<Radar />}           label="Sweeps"    hint="G then S" onSelect={() => navigate('/sweeps')} />
            </Command.Group>
            <Command.Group heading="Actions">
              <Item icon={<PlusCircle />} label="Start a new sweep" onSelect={() => navigate('/sweeps?new=1')} />
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
```

Registered globally in `AppShell`:

```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setPaletteOpen((o) => !o);
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, []);
```

---

## Auth pattern (login + session)

The login page is intentionally minimal — one password field, a brand block, and a **shake animation** on bad password using Framer Motion:

```tsx
// src/pages/LoginPage.tsx (key bits)
import { motion } from 'framer-motion';

const [shake, setShake] = useState(0);

async function onSubmit(e) {
  e.preventDefault();
  const { ok, error } = await login(password);
  if (!ok) {
    setErr(error ?? 'Incorrect password');
    setShake((n) => n + 1);  // re-key triggers a fresh animation
  }
}

return (
  <motion.div
    key={shake}
    animate={err ? { x: [-8, 8, -4, 4, 0] } : undefined}
    transition={{ duration: 0.3 }}
  >
    {/* form */}
  </motion.div>
);
```

The whole session flow:

```tsx
// src/hooks/useAuth.ts
let cached: SessionState | null = null;
const subscribers = new Set<(s: SessionState) => void>();

async function fetchSession() {
  try {
    const data = await api.get('/auth/session');
    return { authenticated: !!data.authenticated, loading: false };
  } catch {
    return { authenticated: false, loading: false };
  }
}

export function useAuth() {
  const [state, setState] = useState(cached ?? { authenticated: false, loading: true });
  useEffect(() => {
    subscribers.add(setState);
    if (!cached) void fetchSession().then(publish);
    return () => subscribers.delete(setState);
  }, []);
  // login / logout omitted
  return state;
}
```

The cookie is `httpOnly` + `SameSite=Lax`, signed with `jose` HS256 — XSS-safe and CSRF-resistant for our use.

---

## Data fetching: typed `api` helper + React Query

We never use `fetch` directly in components. Everything goes through a 20-line typed helper:

```ts
// src/lib/api.ts
const BASE = import.meta.env.VITE_API_BASE ?? '/api';

async function request<T>(method, path, body?) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',  // sends the session cookie
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = parsed?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, parsed, message);
  }
  return parsed as T;
}

export const api = {
  get:    <T = unknown>(path)                => request<T>('GET',    path),
  post:   <T = unknown>(path, body?)         => request<T>('POST',   path, body),
  patch:  <T = unknown>(path, body?)         => request<T>('PATCH',  path, body),
  delete: <T = unknown>(path)                => request<T>('DELETE', path),
};
```

React Query is set up in `main.tsx` with sensible defaults:

```tsx
const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});
```

Usage in a page is two lines:

```tsx
const { data: stats, isLoading } = useQuery({
  queryKey: ['dashboard-stats'],
  queryFn: () => api.get<Stats>('/dashboard/stats'),
});
```

---

## Premium UX building blocks

### Cards & status badges

The badge component is doing a lot of work — three statuses, optional pulse, four semantic colors:

```tsx
// src/components/ui/badge.tsx
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none',
  {
    variants: {
      variant: {
        default:    'bg-primary/15 text-primary border-primary/30',
        success:    'bg-success/15 text-success border-success/30',
        warning:    'bg-warning/15 text-warning border-warning/30',
        destructive:'bg-destructive/15 text-destructive border-destructive/30',
        outline:    'bg-transparent text-muted-foreground border-border',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge({ variant, pulse, children, ...props }) {
  return (
    <span className={cn(badgeVariants({ variant }), props.className)} {...props}>
      {pulse && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
      {children}
    </span>
  );
}
```

Usage:
```tsx
<Badge variant="success">Operational</Badge>
<Badge pulse>Running</Badge>
<Badge variant="destructive">Failed</Badge>
```

### Filterable data table

The agencies table is the heart of the app. Key patterns:

1. **Filters as state**, debounced search:
   ```tsx
   const [q, setQ] = useState('');
   const [debounced, setDebounced] = useState('');
   useEffect(() => {
     const t = setTimeout(() => setDebounced(q), 250);
     return () => clearTimeout(t);
   }, [q]);
   ```

2. **Server-side everything** — pagination, search, filters all happen in SQL:
   ```tsx
   const params = new URLSearchParams({
     page: String(page), pageSize: String(pageSize),
     ...(country    ? { country }    : {}),
     ...(minRating  ? { minRating }  : {}),
     ...(minReviews ? { minReviews } : {}),
     ...(debounced  ? { q: debounced }: {}),
   });
   api.get(`/agencies?${params}`);
   ```

3. **Click row → open drawer; click icons in row → no bubble**:
   ```tsx
   <tr onClick={() => setSelectedId(a.id)} className="cursor-pointer">
     <td>...</td>
     <td>
       {/* WhatsApp icon — stops propagation so row click doesn't fire */}
       <a href={waHref} onClick={(e) => e.stopPropagation()}>
         <MessageSquare className="h-3 w-3" />
       </a>
     </td>
   </tr>
   ```

4. **Tight density**: `text-[12px]`, `py-1.5`, `whitespace-nowrap`, `tabular` for numbers.

### Side drawer with Framer Motion

A custom side drawer (vs a Radix Sheet) for a more controlled spring animation. 560px wide, slides from right.

```tsx
// src/components/app/AgencyDrawer.tsx (simplified)
import { motion, AnimatePresence } from 'framer-motion';

<AnimatePresence>
  {agencyId && (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.aside
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="fixed top-0 right-0 z-50 h-full w-[560px] bg-card border-l shadow-2xl overflow-y-auto"
      >
        {/* sticky header + sections */}
      </motion.aside>
    </>
  )}
</AnimatePresence>
```

`stiffness: 380, damping: 32` gives that iOS / Linear / Cal.com snap.

ESC closes:
```tsx
useEffect(() => {
  if (!agencyId) return;
  const onKey = (e) => { if (e.key === 'Escape') onClose(); };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [agencyId, onClose]);
```

### Modal dialogs (Radix)

For confirmation flows (Start sweep, Enrich filtered) we use the standard Radix Dialog with a custom-styled `DialogContent`:

```tsx
// src/components/ui/dialog.tsx — the bit that defines the look
<DialogPrimitive.Content
  className={cn(
    'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%]',
    'gap-4 border bg-card p-6 shadow-2xl rounded-xl',
    'data-[state=open]:animate-in data-[state=closed]:animate-out',
    'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
  )}
/>
```

### Toast notifications (Sonner)

Mounted once in `main.tsx`:
```tsx
<Toaster theme="dark" position="bottom-right" richColors closeButton />
```

Usage anywhere:
```tsx
import { toast } from 'sonner';
toast.success(`Enriched ${count} agencies`);
toast.error('Network error');
toast.warning('Quota cap reached');
```

---

## Feature deep-dive: filter-based enrichment

This is the cleanest example of the patterns above coming together.

### The flow

1. User picks filters: `Country = UAE · ★ 4+ · ≥ 20 reviews · Not yet enriched`
2. The agencies table refetches with those filters, showing matching count
3. User clicks **"Enrich filtered"** button
4. **Preview dialog** opens:
   ```
   Matching agencies                  287
   Free quota remaining this month    950
   Will be enriched now               287
                                    [Cancel] [Enrich 287]
   ```
5. On confirm, backend processes the batch, hard-stops at quota cap, returns summary
6. Toast announces result; quota widget refreshes; table reloads

### The filter UI

```tsx
const MIN_RATINGS = [
  { value: '',    label: 'Any rating' },
  { value: '4',   label: '★ 4+' },
  { value: '4.5', label: '★ 4.5+' },
  { value: '5',   label: '★ 5' },
];

<FilterSelect value={minRating} onChange={setMinRating} options={MIN_RATINGS} />

// FilterSelect is a styled <select>:
function FilterSelect({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-9 px-3 rounded-md border border-input bg-background text-sm
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
```

### The "Enrich filtered" button

```tsx
<Button
  onClick={() => setConfirmOpen(true)}
  disabled={enriching || quotaRemaining === 0 || total === 0}
  variant="outline"
>
  {enriching
    ? <><Loader2 className="h-4 w-4 animate-spin" /> Enriching…</>
    : <><Sparkles className="h-4 w-4" /> Enrich filtered</>}
</Button>
```

Auto-disables when:
- Already running
- Quota at zero
- Zero matching agencies

### The confirmation dialog with quota math

```tsx
const enrichQuota = quotas.find((q) => q.method === 'place_details');
const quotaRemaining = enrichQuota ? Math.max(0, enrichQuota.cap - enrichQuota.used) : 0;
const candidateCount = enrichmentStatus === 'not_enriched' ? total : Math.min(total, 1000);
const planned = Math.min(candidateCount, quotaRemaining);
const willStopEarly = candidateCount > quotaRemaining;

<DialogContent>
  <DialogHeader>
    <DialogTitle>Confirm batch enrichment</DialogTitle>
    <DialogDescription>
      Pulls phone, website, hours &amp; rating from Google Maps for the filtered agencies.
    </DialogDescription>
  </DialogHeader>
  <div className="space-y-3">
    <Row label="Matching agencies"                value={total.toLocaleString()} />
    <Row label="Free quota remaining this month"  value={quotaRemaining.toLocaleString()} />
    <Row label="Will be enriched now"             value={planned.toLocaleString()} highlight />
    {willStopEarly && (
      <p className="text-warning bg-warning/10 border border-warning/30 rounded p-2 text-[12px]">
        Not enough free quota for all matches — will stop after {planned}.
      </p>
    )}
    <p className="text-[12px] text-muted-foreground">
      Hard-capped to free tier. <strong>Zero charge possible.</strong>
    </p>
  </div>
  <DialogFooter>
    <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
    <Button onClick={confirmAndEnrich} disabled={planned === 0}>
      {planned === 0 ? 'Quota exhausted' : `Enrich ${planned.toLocaleString()}`}
    </Button>
  </DialogFooter>
</DialogContent>
```

### Backend safety cap (TypeScript)

The frontend `planned` count is advisory — the backend re-verifies and never exceeds free tier:

```ts
// src/server/services/enrichmentService.ts
export async function enrichBatch(args) {
  const requested = Math.min(Math.max(args.limit ?? 50, 1), 1000);
  // Cap planned batch at the remaining quota so we never spend a paid call.
  const remainingQuota = await remaining('place_details');
  const limit = Math.min(requested, remainingQuota);
  // …query agencies, run workers…
}
```

Each Place Details call routes through `recordOrThrow` which throws `QuotaExhaustedError` before the network call if we'd exceed the cap:

```ts
// src/server/services/placesService.ts
export async function getPlaceDetails(placeId: string) {
  const key = await getApiKey();
  await recordOrThrow('place_details');  // ← throws if at cap
  const res = await fetch(`${BASE}/places/${encodeURIComponent(placeId)}`, { /* ... */ });
  // …
}
```

The worker catches that error and gracefully stops the batch:

```ts
try {
  await enrichAgency(a.id);
} catch (err) {
  if (err instanceof QuotaExhaustedError) {
    summary.quotaHit = true;
    idx = queue.length;  // signal all workers to stop
    break;
  }
  // …other errors are per-agency failures, continue
}
```

---

## Feature deep-dive: monthly quota widget

A reusable component that shows your free-tier usage with auto-refresh + colour-coded progress bars.

```tsx
// src/components/app/QuotaWidget.tsx (essence)
let cached: Quota[] | null = null;
const subscribers = new Set<(q: Quota[]) => void>();

export function refreshQuota() { void load(); }

async function load() {
  const data = await api.get<{ quotas: Quota[] }>('/quota');
  cached = data.quotas;
  subscribers.forEach((fn) => fn(cached!));
  return cached;
}

export function useQuota() {
  const [quotas, setQuotas] = useState(cached ?? []);
  useEffect(() => {
    subscribers.add(setQuotas);
    if (!cached || stale) void load();
    return () => subscribers.delete(setQuotas);
  }, []);
  return quotas;
}

export function QuotaWidget() {
  const quotas = useQuota();
  return (
    <div className="rounded-lg border bg-card p-3">
      <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Google Maps free quota
      </h3>
      <div className="grid grid-cols-2 gap-3 mt-2">
        {quotas.map((q) => <QuotaBar key={q.method} q={q} />)}
      </div>
      <div className="mt-2.5 pt-2 border-t text-[10.5px] text-muted-foreground">
        Resets {fmtReset(quotas[0]?.resetsAt)}
      </div>
    </div>
  );
}

function QuotaBar({ q }) {
  const danger = q.percentage >= 95;
  const warn   = q.percentage >= 70;
  const colorClass = danger ? 'bg-destructive' : warn ? 'bg-warning' : 'bg-primary';
  return (
    <div>
      <div className="flex items-center justify-between text-[12px]">
        <span>{q.method}</span>
        <span className="tabular"><strong>{q.used}</strong> / {q.cap}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full transition-all ${colorClass}`}
             style={{ width: `${Math.min(100, q.percentage)}%` }} />
      </div>
    </div>
  );
}
```

The module-level `cached` + `subscribers` pattern means multiple `QuotaWidget` instances on the same page share state — and a single `refreshQuota()` call after a batch enrichment updates them all without re-render thrash.

---

## File structure

```
falisha-agent-finder/
├── src/
│   ├── App.tsx                      # Router + auth gate
│   ├── main.tsx                     # React root + providers (Query, Toaster, Router)
│   ├── index.css                    # Tailwind + design tokens
│   │
│   ├── hooks/
│   │   └── useAuth.ts               # Session state, login/logout
│   │
│   ├── lib/
│   │   ├── api.ts                   # Typed fetch helper
│   │   ├── utils.ts                 # cn() classname merge
│   │   └── phone.ts                 # bestPhone, whatsAppHref, telHref helpers
│   │
│   ├── pages/
│   │   ├── LoginPage.tsx            # Single-password login with shake
│   │   ├── DashboardPage.tsx        # KPIs + country breakdown + quota
│   │   ├── AgenciesPage.tsx         # Filterable table + drawer + enrich dialog
│   │   ├── SweepsPage.tsx           # Run sweep dialog + history
│   │   ├── OutreachPage.tsx         # Outreach log (placeholder)
│   │   └── SettingsPage.tsx         # Encrypted API keys with reveal toggle
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx         # Sidebar + top strip + outlet + palette
│   │   │   └── CommandPalette.tsx   # Cmd+K
│   │   ├── app/
│   │   │   ├── AgencyDrawer.tsx     # Framer Motion side drawer
│   │   │   └── QuotaWidget.tsx      # Free-tier usage bars
│   │   └── ui/                      # Primitives (shadcn-style, copy-paste-owned)
│   │       ├── button.tsx           # cva-variant button
│   │       ├── badge.tsx            # Status badge with optional pulse
│   │       ├── card.tsx             # Card / CardHeader / CardContent
│   │       ├── dialog.tsx           # Radix Dialog with our styling
│   │       ├── input.tsx
│   │       └── label.tsx
│   │
│   └── server/                      # Express backend in same repo
│       ├── index.ts                 # App setup + route mounting
│       ├── env.ts                   # Zod env validation
│       ├── session.ts               # jose JWT cookie helpers
│       ├── db.ts                    # Supabase client (lazy)
│       ├── logger.ts                # pino
│       ├── routes/                  # auth, settings, sweeps, agencies, enrich, quota, dashboard
│       └── services/                # placesService, sweepService, enrichmentService, settingsService, quotaService, dashboardService
│
├── supabase/migrations/             # SQL migrations (timestamped)
├── tailwind.config.ts               # Token wiring
├── vite.config.ts                   # Dev proxy /api → :4000
├── tsconfig.json                    # Client TS (excludes server)
├── tsconfig.server.json             # Server TS (server only, emits to dist/server)
├── Dockerfile                       # node:20-bookworm-slim
└── railway.json                     # builder=DOCKERFILE, healthcheck=/api/health
```

---

## Running locally

```bash
# 1. Clone + install
git clone https://github.com/holywolf92-a11y/falisha-agent-finder
cd falisha-agent-finder
npm install

# 2. Generate a password hash + secrets
npm run hash-password -- 'pick-a-strong-password'   # outputs bcrypt hash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # session secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" # settings master key

# 3. Fill .env (copy .env.example)
cat > .env <<EOF
NODE_ENV=development
PORT=4000
ADMIN_PASSWORD_HASH=<hash from step 2>
ADMIN_SESSION_SECRET=<hex from step 2>
APP_SETTINGS_MASTER_KEY=<base64 from step 2>
SUPABASE_URL=https://YOUR.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE
EOF

# 4. Run both halves with one command
npm run dev                          # Vite on :5173, Express on :4000
# Open http://localhost:5173 and log in with the password you hashed
```

For Vite to proxy `/api/*` to Express:
```ts
// vite.config.ts
server: {
  port: 5173,
  proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
},
```

For production, Express serves the built SPA from `dist/web`:
```ts
if (isProduction) {
  const webDist = path.resolve(__dirname, '../web');
  app.use(express.static(webDist, { index: false, maxAge: '1y' }));
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}
```

So one container serves both `/api` and the SPA — no CORS, no second service to manage.

---

## References & credits

The aesthetic is a synthesis of:

- **Linear** — for the sidebar nav + density + keyboard shortcuts
- **Vercel Dashboard** — for the dark-with-teal vibe and the side-strip nav indicator
- **Mercury Bank** — for the cards-and-tables rhythm
- **Cal.com** — for the side drawer pattern (Radix-style, slides from right)
- **Raycast** — for the command palette layout (centered, 480px wide)

Specific library choices:

- [shadcn/ui](https://ui.shadcn.com) — the copy-paste-owned component pattern
- [Radix UI](https://www.radix-ui.com) — accessibility primitives
- [Tailwind CSS](https://tailwindcss.com) v3 — utility-first styling
- [Lucide](https://lucide.dev) — icon set (stroke-width 1.5 looks premium at small sizes)
- [Framer Motion](https://www.framer.com/motion) — spring animations on the drawer
- [Sonner](https://sonner.emilkowal.ski) — modern toast library
- [cmdk](https://cmdk.paco.me) — command palette
- [TanStack Query](https://tanstack.com/query) — data fetching with caching

If you copy any of this for your own app: keep three things and you'll be 80% of the way there.

1. **Single accent color** — pick one you'll commit to. Not the default shadcn violet.
2. **Density over decoration** — 12–13px body, 32px rows, tabular numerals, single-line truncation.
3. **One animation per surface** — drawer slide, command palette zoom, login shake. That's it.

Everything else is just CSS variables + Lucide icons + Tailwind.
