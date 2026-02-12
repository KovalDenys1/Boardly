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

## Secret usage policy

- `NEXTAUTH_SECRET`: required for auth/session token signing.
- `JWT_SECRET`: deprecated compatibility only.
- `GUEST_JWT_SECRET`: optional override for guest token signing.

## Realtime integrity expectations

- Server remains authoritative for turn completion and auto-actions.
- Prevent duplicate auto-actions with server guards/debouncing.
- On reconnect or action error, clients reconcile with server snapshots.

## Operational checks

Before production deploy:

- Validate env secrets and origins.
- Verify migration path is separate from socket build.
- Confirm auth/guest flows and websocket room authorization.
- Run lint/tests and smoke test create/join/play/finish cycle.
