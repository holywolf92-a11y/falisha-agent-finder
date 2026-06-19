# Falisha Agent Finder

Internal premium tool for discovering Gulf recruitment agencies via Google
Maps + website enrichment, with WhatsApp / email outreach tracking.

## Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind 3 + shadcn-style UI primitives
- **Backend:** Express + jose (sessions) + Zod (validation) + pino (logs)
- **Data:** Supabase (existing project, new `agency_*` tables)
- **Deploy:** Railway (Dockerfile), auto-deploy from `main`

## Development

```bash
npm install
npm run hash-password -- 'your-strong-password'  # paste hash into .env
npm run dev                                       # web on 5173, api on 4000
```

The Vite dev server proxies `/api/*` to the Express server, so a single URL
(`http://localhost:5173`) serves both during development. The login form
posts to `/api/auth/login`; the session cookie is httpOnly + SameSite=Lax.

## Production

```bash
npm run build
npm start
```

The Express server serves the built SPA from `dist/web` and the API from the
same origin, so cookies are unambiguous and CORS isn't needed.
