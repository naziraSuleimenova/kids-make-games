import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import gamesRouter from './routes/games';

// ── Startup env check ────────────────────────────────────────────────────────
const REQUIRED = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
] as const;

const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.warn('\x1b[33m[env] Missing env vars — some features will fail:\x1b[0m');
  missing.forEach(k => console.warn(`  ✗  ${k}`));
} else {
  console.log('\x1b[32m[env] All required env vars present ✓\x1b[0m');
}

// ── App ──────────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000' }));
app.use(express.json({ limit: '1mb' }));

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const s = res.statusCode;
    const color = s >= 500 ? '\x1b[31m' : s >= 400 ? '\x1b[33m' : '\x1b[32m';
    console.log(`${color}${req.method} ${req.path} ${s}\x1b[0m  ${ms}ms`);
  });
  next();
});

app.use('/api/games', gamesRouter);

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Catch-all error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Backend → http://localhost:${PORT}`);
});
