# Security Policy

## Supported versions

Security fixes are applied to the latest active `1.x` line.

## Reporting a vulnerability

Do not open public issues for security reports.

Report privately to: `security@boardly.online`

Please include:

- affected endpoint/file/flow
- reproduction steps
- expected vs actual behavior
- impact assessment
- proof-of-concept (if available)

## Response targets

- Initial acknowledgment: within 48 hours
- Triage update: within 7 days
- Fix release timeline: based on severity

## Security baseline for deployers

- Do not commit `.env` or `.env.local`.
- Use a strong `NEXTAUTH_SECRET` (single auth/session signing secret).
- Set strict `CORS_ORIGIN` values.
- Keep dependencies updated (`npm audit`).
- Use HTTPS in production.

## Guest and auth model

- Registered sessions: NextAuth.
- Guest sessions: signed server-issued token (`X-Guest-Token`).
- Avoid trusting raw client identifiers for guest identity.

## Database and RLS

RLS is used as defense-in-depth at DB level. Application behavior should still enforce authorization in API routes.

See technical model: `docs/SECURITY_MODEL.md`

## Disclosure process

We follow coordinated disclosure and publish advisories after fixes are available.
