# Bundle Budget Policy

Updated: 2026-02-25

## Goal

Catch client bundle regressions early for critical pages, starting with `"/lobby/[code]"`.

## How To Measure

Production build baseline command (local/CI-safe placeholders for build-time env):

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/boardly_ci_placeholder'
$env:DIRECT_URL='postgresql://postgres:postgres@localhost:5432/boardly_ci_placeholder'
$env:NEXTAUTH_URL='http://localhost:3000'
$env:NEXTAUTH_SECRET='test-nextauth-secret-32chars-min-required-len'
$env:SOCKET_SERVER_INTERNAL_SECRET='test-socket-secret-32chars-min-required-key'
npm run build
npm run check:bundle-budget
```

## 2026-02-25 Baseline (before optimization)

From `next build`:

- `First Load JS shared by all`: `461 kB`
- `"/lobby/[code]"` First Load JS: `557 kB`
- `"/profile"` First Load JS: `535 kB`

From `npm run check:bundle-budget` (`/lobby/[code]/page`):

- Route total JS: `1807.4 KiB`
- Route specific chunk: `120.0 KiB`
- Shared vendor chunk: `1466.8 KiB`
- Shared common chunk: `214.2 KiB`

## 2026-02-25 Optimization Landed

- Moved `YahtzeeGameBoard` in `app/lobby/[code]/page.tsx` to `next/dynamic`
- Deferred `canvas-confetti` loading in `hooks/useConfetti.ts`

Measured result from `next build`:

- `"/lobby/[code]"` route size: `34.2 kB -> 32 kB`
- `"/lobby/[code]"` First Load JS: `557 kB -> 555 kB`

## Enforced Thresholds (default)

`scripts/check-bundle-budget.ts` defaults:

- Route total JS (`/lobby/[code]/page`): `1875 KiB`
- Route specific chunk: `135 KiB`
- Shared vendor chunk: `1525 KiB`
- Shared common chunk: `235 KiB`

These allow modest headroom over the current baseline while failing on meaningful regressions.

## CI Policy

- `npm run check:bundle-budget` runs in `.github/workflows/ci.yml` (blocking `bundle-budget` job)
- The check runs after a production `npm run build`
- Thresholds can be temporarily adjusted via env vars (`BUNDLE_BUDGET_*`) only with documented rationale in PR
