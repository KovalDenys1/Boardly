# Security Model

## Defense layers

### Authentication/session layer (NextAuth)

- Registered users are validated via NextAuth session/JWT.
- Canonical signing secret: `NEXTAUTH_SECRET`.
- Sessions are stateless JWTs, so revocation is a per-user cutoff: `Users.sessionsValidFrom`.
  The custom `jwt.decode` in `lib/next-auth.ts` reads it on every request and treats any session
  whose `authenticatedAt` is earlier, or whose account no longer exists, as an invalid cookie
  (#1136). It sits in decode, not the jwt callback, because NextAuth's OAuth callback decodes the
  existing cookie to choose the account a new provider identity is linked to and never runs the
  jwt callback on it. A password reset and a completed email change set it to now; NULL, the
  default, revokes nothing. `proxy.ts` uses `getToken`'s default decode and does not check it.
- An email change needs the current password, or a sign-in within the last ten minutes for an
  account without one, and the address being replaced is told (#1136).

### API authorization layer

- API routes validate actor identity and permissions before state mutation.
- Routes read the signed-in user through `lib/session-user.ts`, never `getServerSession`
  directly (`__tests__/api/session-user-routes.test.ts` enforces it). It refuses a suspended
  claim on every method and re-reads `suspended` from the database on writes, so a suspension
  applies on the next write rather than after the 30-minute token refresh (#1137). The two
  account-deletion routes pass `allowSuspended`: erasure stays open to a suspended account.
  Game and lobby routes get the same from `lib/request-auth.ts`.
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

- The public anon key ships in every client bundle, so table grants plus RLS are the only control
  between the public and the tables, not defence-in-depth. Grants decide which columns are readable
  (RLS filters rows only); since migration `20260924141000` the API roles hold no table privilege in
  `public` except a column-limited `SELECT` on `Lobbies` for Realtime, schema defaults are revoked so
  new tables stay closed, and `scripts/rls-smoke.psql` asserts it after every production migration.
  The Supabase security advisor checks only whether RLS is enabled, never grants or column exposure.
- Application traffic runs as the table owner through Prisma and bypasses RLS; the server broadcasts
  with the service key.

## Guest security model

- Guests receive two signed HS256 tokens from server endpoints: a 12-hour session token and a 180-day
  identity token (`lib/guest-auth.ts`), both on `GUEST_JWT_SECRET` with `NEXTAUTH_SECRET` as fallback.
- Token transport header: `X-Guest-Token`.
- Guest claims are verified server-side through `lib/guest-auth.ts`; the header is never trusted as sent.
- Raw client-supplied guest IDs/names are not trusted as identity.

## Secret policy

### Required in production

- `DATABASE_URL`: PostgreSQL connection string.
- `NEXTAUTH_SECRET`: NextAuth JWT/session signing, minimum 32 characters.
- `CRON_SECRET`: dedicated cron endpoint auth secret, minimum 32 characters.
- `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL`: `broadcastToLobby` needs
  both and returns `false` without either, silently, so realtime dies quietly if one is
  missing.

### Optional and conditional

- `GUEST_JWT_SECRET`: overrides guest token signing secret.
- `BOARDLY_INTERNAL_SECRET`: server-to-server bot-turn triggers. The state route forwards
  the caller's own session either way and adds this header on top when it is set, so
  leaving it unset means the bot turn runs on the player's identity – acceptable locally
  and not in a deployed environment.
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
- On reconnect or action error, clients reconcile with server snapshots. Known gap (audit 2026-09-24,
  advisory GHSA-g868-9224-wr3p): four game pages apply a broadcast `state-change` payload directly, and
  the lobby topic is a public channel any holder can send on, so reconciliation is the target state,
  not the current one.

## Operational checks

Before production deploy:

- Validate env secrets and allowed origins.
- Validate CSRF behavior on key mutating API routes (same-origin pass, cross-origin reject).
- Confirm migrations run from their own job, not from the app build (`.github/workflows/migrate.yml`).
- Confirm auth and guest flows, and that a non-member cannot read a lobby's realtime topic.
- Run lint/tests and smoke test create/join/play/finish cycle.
