# Security Model

## Defense layers

### Authentication/session layer (NextAuth)

- Registered users are validated via NextAuth session/JWT.
- Canonical signing secret: `NEXTAUTH_SECRET`.

### API authorization layer

- API routes validate actor identity and permissions before state mutation.
- Rate limiting is applied on sensitive routes.

### Database safety layer (RLS)

- RLS policies are used as defense-in-depth for direct DB access scenarios.
- Application traffic via service role remains functional.

## Guest security model

- Guests receive short-lived signed tokens from server endpoints.
- Token transport header: `X-Guest-Token`.
- Guest claims are verified in API and socket auth paths.
- Raw client-supplied guest IDs/names are not trusted as identity.

## Secret policy

### Required in production

- `DATABASE_URL`: PostgreSQL connection string.
- `NEXTAUTH_SECRET`: NextAuth JWT/session signing, minimum 32 characters.
- `SOCKET_SERVER_INTERNAL_SECRET`: internal socket endpoints (`/api/notify`, `/metrics`), minimum 16 characters.

### Optional and conditional

- `GUEST_JWT_SECRET`: overrides guest token signing secret.
- `CRON_SECRET`: only for cron endpoints.
- `SOCKET_INTERNAL_SECRET`: deprecated alias of `SOCKET_SERVER_INTERNAL_SECRET`.

### Usage rules

- Never expose secrets through `NEXT_PUBLIC_*`.
- Never log raw secrets.
- Keep a dedicated internal socket secret (no fallback to unrelated app secrets).
- Rotate secrets after incidents and on schedule.

### Rotation checklist

1. Generate a new `SOCKET_SERVER_INTERNAL_SECRET`.
2. Update secret in all environments (Next.js + socket server).
3. Redeploy both services.
4. Verify internal notifications and metrics auth behavior.
5. Remove old secret from secret manager.

## Realtime integrity expectations

- Server remains authoritative for turn completion and auto-actions.
- Prevent duplicate auto-actions with server guards/debouncing.
- On reconnect or action error, clients reconcile with server snapshots.

## Operational checks

Before production deploy:

- Validate env secrets and allowed origins.
- Verify migration path is separate from socket build.
- Confirm auth/guest flows and websocket room authorization.
- Run lint/tests and smoke test create/join/play/finish cycle.
