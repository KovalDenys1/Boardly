# Security Model

## Defense layers

### Authentication/session layer (NextAuth)

- Registered users are validated via NextAuth session/JWT.
- Canonical signing secret: `NEXTAUTH_SECRET`.

### API authorization layer

- API routes validate actor identity and permissions before state mutation.
- Rate limiting is applied on sensitive routes.

### CSRF layer

- Mutating `/api/*` requests with authenticated session cookies are origin-validated in proxy.
- Same-origin requests are allowed; cross-origin attempts are rejected with `403`.
- Allowed origins are derived from deployment origin plus configured allowed origins.

### Browser CSP layer

- Production CSP keeps `script-src` locked to `'self'` plus explicit trusted domains, and disallows `'unsafe-eval'`.
- Production currently allows `'unsafe-inline'` to support current Next.js App Router bootstrap scripts on statically rendered routes.
- Development keeps relaxed script directives only where needed for local tooling/HMR.

### Database safety layer (RLS)

- RLS policies are used as defense-in-depth for direct DB access scenarios.
- Application traffic via service role remains functional.

## Guest security model

- Guests receive short-lived signed tokens from server endpoints.
- Token transport header: `X-Guest-Token`.
- Guest claims are verified server-side through `lib/guest-auth.ts`; the header is never trusted as sent.
- Raw client-supplied guest IDs/names are not trusted as identity.

## Secret policy

### Required in production

- `DATABASE_URL`: PostgreSQL connection string.
- `NEXTAUTH_SECRET`: NextAuth JWT/session signing, minimum 32 characters.
- `CRON_SECRET`: dedicated cron endpoint auth secret, minimum 32 characters.
- `SUPABASE_SERVICE_ROLE_KEY`: server-side Supabase client used by `broadcastToLobby`.

### Optional and conditional

- `GUEST_JWT_SECRET`: overrides guest token signing secret.
- `BOARDLY_INTERNAL_SECRET`: server-to-server bot-turn triggers. Unset, the state route
  forwards the player's own session instead, which is acceptable locally and not in a
  deployed environment.
- `DISCORD_INTERNAL_SECRET`: bearer the Raspberry Pi gateway bot presents to
  `/api/internal/discord/heartbeat` and `/api/internal/discord/members/[snowflake]`. Unset,
  those routes answer 503.

### Usage rules

- Never expose secrets through `NEXT_PUBLIC_*`.
- Never log raw secrets.
- Keep cron auth isolated to `CRON_SECRET` only (no fallback to `NEXTAUTH_SECRET`).
- Rotate secrets after incidents and on schedule.

### Rotation checklist

1. Generate the new value (`openssl rand -base64 32`).
2. Set it in every environment that reads it – Vercel, GitHub Actions secrets, and the Pi
   env file for `DISCORD_INTERNAL_SECRET`. `docs/DISCORD.md` has the full map.
3. Redeploy so the new value is live.
4. Exercise the paths that use it before removing the old value.
5. Remove the old secret from the secret manager.

## Realtime integrity expectations

- Server remains authoritative for turn completion and auto-actions.
- Prevent duplicate auto-actions with server guards/debouncing.
- On reconnect or action error, clients reconcile with server snapshots.

## Operational checks

Before production deploy:

- Validate env secrets and allowed origins.
- Validate CSRF behavior on key mutating API routes (same-origin pass, cross-origin reject).
- Confirm migrations run from their own job, not from the app build (`.github/workflows/migrate.yml`).
- Confirm auth and guest flows, and that a non-member cannot read a lobby's realtime topic.
- Run lint/tests and smoke test create/join/play/finish cycle.
