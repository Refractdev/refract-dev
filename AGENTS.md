# AGENTS.md

## Cursor Cloud specific instructions

Refract is a single product: a Vite + React 18 SPA (`src/`) plus Vercel serverless
functions (`api/`), backed by Supabase (Postgres + Auth). Both are served together in
dev by a custom Node server (`scripts/dev.mjs`). See `README.md` and `APP_DOCUMENTATION.md`
for product details and `package.json` scripts for the canonical commands.

### Running the app (non-obvious)

- The frontend **throws on import** if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are
  missing (`src/lib/supabase.ts`), so a Supabase backend must be configured before the UI
  will load at all. Local dev uses a local Supabase stack.
- Local Supabase runs via the Supabase CLI: `npx supabase start` (requires Docker running).
  It is a **service**, so it is intentionally NOT part of the startup/update script — start
  it manually each session before `npm run dev`. Get its keys with `npx supabase status`.
- The DB schema is applied automatically by `supabase start` from `supabase/migrations/`:
  `00000000000000_schema.sql` mirrors `supabase-schema.sql`, and
  `00000000000001_users_insert_policy.sql` adds the **missing** `public.users` INSERT RLS
  policy. Without that policy the email sign-up profile insert is blocked by RLS and the app
  hangs on the splash screen after login.
- `.env.local` (gitignored) holds the local Supabase URL + anon key + service role key.
  After a fresh `supabase start`, refresh it from `npx supabase status` if keys changed.
- Dev server: `npm run dev` (port 3000) serves Vite + `/api/*.ts` handlers together.
  `npm run dev:client` is Vite-only (no API). The dev server loads `.env.local` then `.env`.

### Auth

- Email/password sign-up works fully against local Supabase (`enable_confirmations = false`
  in `supabase/config.toml`, so accounts are auto-confirmed and get an immediate session).
- GitHub OAuth ("Connect GitHub", repo cloning, PR comments) needs real GitHub OAuth
  credentials configured in Supabase Auth and is not available with the local stack.

### Optional integrations (degrade gracefully if unset)

Groq (`GROQ_API_KEY`, AI suggestions/docs), Upstash Redis (rate limiting, fails open),
PostHog (analytics, no-ops), GitHub webhooks/cron (drift monitor). Core analysis and the
dashboard work without them.

### Lint / test / typecheck

- `npm test` — Vitest unit suite (passes).
- `npm run typecheck` / `npm run typecheck:all` — TS frontend / frontend+API (pass).
- `npm run lint` — Biome over `src/`. The repo currently has many **pre-existing** Biome
  lint errors/warnings; the command runs but is not clean. Do not treat that as caused by
  your changes.
- `npm run test:refract-regression` is a separate baseline script that **currently fails**
  (its hardcoded expectations are out of date with the engine output); it is not part of the
  default test suite.
