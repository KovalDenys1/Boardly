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

#### `unsafe-inline` in `script-src`: why it is still enforced, and what ships instead (#1145)

Found by the 2026-09-24 security audit (S4-05): `script-src` carries `'unsafe-inline'` with no
nonce and no reporting, so an HTML-injection bug executes silently and `img-src https:` gives
it somewhere to exfiltrate to.

**Why the enforced policy is not switched to a nonce today.** A nonce has to be printed into
every `<script>` tag on the response, which means the response can no longer be the same bytes
for every visitor — it has to be rendered per request. Next's app-router bootstrap emits inline
scripts on every route, so switching `script-src` to `'nonce-<value>' 'strict-dynamic'` would
force per-request rendering everywhere, including the 15 guide pages this repo's CLAUDE.md
requires to stay statically prerendered (see "Ads" there — a server-side check already turns
all 15 dynamic once, and that is treated as a build-time regression to catch, not something to
choose again for this). Separately, Google documents the only CSP shape AdSense supports as a
nonce with `'strict-dynamic'`
(<https://support.google.com/adsense/answer/16283098>) with no allowlist fallback, so switching
without first proving AdSense still serves ads under that policy risks the ad stack, and it has
never been tested that way.

**What ships now: `Content-Security-Policy-Report-Only`, enforcing nothing.** `proxy.ts`
(`buildCspReportOnlyHeaderValue`) sends a second header alongside the enforced one, on every
response, with `script-src 'self' https: 'nonce-<random>' 'strict-dynamic'` and no
`'unsafe-inline'`. The nonce is real (drawn fresh per request from the Edge runtime's
`crypto.randomUUID()`) but is never written into any script tag on the page — nothing on the
site carries it. That is deliberate: since nothing matches the nonce, every inline bootstrap
script and every third-party tag (AdSense included) reports a violation without blocking
anything, which makes the report count an honest measurement of what the nonce migration would
actually break, rather than a guess. The enforced `Content-Security-Policy` header is untouched
by this — `__tests__/proxy-csp.test.ts` still asserts it keeps `'unsafe-inline'` and carries no
nonce or `'strict-dynamic'`, unmodified by this change.

**Reporting.** Violations post to same-origin `POST /api/security/csp-report`
(`app/api/security/csp-report/route.ts`, `lib/csp-report.ts`), wired via three headers so every
browser has a path: `Reporting-Endpoints` (Chrome 96+), the legacy `Report-To` header, and the
`report-uri` CSP directive (Safari, which supports neither reporting header). The route accepts
either the old `report-uri` body shape (`{"csp-report": {...}}`) or a `report-to` batch
(`[{"type":"csp-violation","body":{...}}]`), is rate-limited (120 requests/minute/IP) and
body-size-capped (20 KB) since it is public and unauthenticated by necessity — a CSP report has
no session and no CSRF proof to offer, and `proxy.ts` exempts this one path from the CSRF gate
for exactly that reason (`isUnauthenticatedReportingEndpoint`, `lib/csrf.ts`) — and it always
answers `204` (even to a malformed body) since a report has no useful retry behaviour. Each
report is logged via `apiLogger` and best-effort recorded as an `OperationalEvents` row
(`eventName: 'csp_violation_reported'`), so the violation count is queryable and can back an
alert the same way `cron_run` does today, without ever throwing back into the response path.

**What is left as a separate decision, not decided here:** whether and when to enforce the
nonce'd policy for real. That needs, in order: (1) a measured breakage count from the
Report-Only rows above over a real time window, (2) AdSense verified serving under
`strict-dynamic` on a preview deployment, and (3) a decision on the static-guides constraint —
either accept per-request rendering for those 15 routes, or keep them on the current
`'unsafe-inline'` policy while the rest of the app moves to nonces. None of that is resolved by
this change; it only makes the decision possible to make with data instead of a guess.

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
