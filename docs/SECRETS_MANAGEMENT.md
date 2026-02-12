# Secrets Management

## Required In Production

`DATABASE_URL`
- PostgreSQL connection string.

`NEXTAUTH_SECRET`
- Used for NextAuth JWT/session signing.
- Must be at least 32 characters.

`SOCKET_SERVER_INTERNAL_SECRET`
- Required for internal Socket server endpoints (`/api/notify`, `/metrics`).
- Must be at least 16 characters.
- Must match in both Next.js app environment and socket server environment.

## Optional / Conditional

`GUEST_JWT_SECRET`
- If omitted, guest JWT uses `NEXTAUTH_SECRET`.

`CRON_SECRET`
- Used by cron endpoints only.
- Do not reuse this secret for socket internal auth.

`SOCKET_INTERNAL_SECRET`
- Deprecated alias for `SOCKET_SERVER_INTERNAL_SECRET`.
- Keep only for temporary migration.

## Usage Rules

- Never expose secrets in client-side variables (`NEXT_PUBLIC_*`).
- Do not log raw secret values.
- Use a dedicated secret for socket internal auth; no fallback to unrelated secrets.
- Rotate secrets after incidents and at regular intervals.

## Rotation Checklist

1. Generate a new `SOCKET_SERVER_INTERNAL_SECRET`.
2. Update secret in all environments (Next.js + socket server).
3. Redeploy services.
4. Verify:
   - Internal notifications (`notifySocket`) still work.
   - `/metrics` and `/api/notify` reject unauthorized requests in production.
5. Remove old secret from secret manager.
