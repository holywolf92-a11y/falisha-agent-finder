import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, isProduction } from './env.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// ─── security + middleware ──────────────────────────────────────────────────
app.disable('x-powered-by');
app.set('trust proxy', 1); // Railway sits behind a reverse proxy
app.use(helmet({
  contentSecurityPolicy: false, // The SPA injects styles/scripts; lock down once stable
}));

const allowedOrigins = (env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // Same-origin (no Origin header) or explicitly listed origins are allowed.
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS denied for ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

// ─── API routes ────────────────────────────────────────────────────────────
app.use('/api/health', healthRouter);
app.use('/api/auth',   authRouter);

// ─── SPA static serving (production only — dev uses Vite's own server) ─────
if (isProduction) {
  const webDist = path.resolve(__dirname, '../web');
  app.use(express.static(webDist, {
    index: false,
    maxAge: '1y',
    setHeaders: (res, filePath) => {
      // index.html must NOT be aggressively cached or users see stale builds
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

// ─── error handler ─────────────────────────────────────────────────────────
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error({ err: message }, 'unhandled error');
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal_server_error' });
});

const port = env.PORT;
app.listen(port, '0.0.0.0', () => {
  logger.info({ port, env: env.NODE_ENV }, 'falisha-agent-finder listening');
});
