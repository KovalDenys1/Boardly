# Bundle Budget Policy

Updated: 2026-03-10

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

## 2026-02-27 Baseline (after optimization)

Optimization set:

- Removed static `game-registry` imports from lobby client path and switched to lazy client engine restore.
- Moved lobby metadata/bot-support lookups to lightweight `lib/game-catalog.ts`.
- Removed unused heavy bot-visualization import path from `app/lobby/[code]/page.tsx`.
- Kept server-side engine registry behavior unchanged.

Measured result from `next build`:

- `First Load JS shared by all`: `221 kB`
- `"/lobby/[code]"` route size: `36.4 kB`
- `"/lobby/[code]"` First Load JS: `365 kB`

Measured result from `npm run check:bundle-budget` (`/lobby/[code]/page`):

- Route total JS: `1173.2 KiB`
- Route specific chunk: `128.1 KiB`
- Shared vendor chunk: `0.0 KiB`
- Shared common chunk: `0.0 KiB`

## 2026-03-01 Baseline (after additional route splitting)

Optimization set:

- Kept heavy gameplay page shell and shared modals dynamic-loaded.
- Split additional non-critical lobby UI blocks in `app/lobby/[code]/page.tsx`:
  - `WaitingRoom`
  - `LobbyInfo`
  - `JoinPrompt`
  - `MobileTabPanel`
- Preserved gameplay and socket flows while reducing initial route chunk weight.

Measured result from `next build`:

- `First Load JS shared by all`: `221 kB`
- `"/lobby/[code]"` route size: `28.0 kB`
- `"/lobby/[code]"` First Load JS: `358 kB`

Measured result from `npm run check:bundle-budget` (`/lobby/[code]/page`):

- Route total JS: `1142.8 KiB`
- Route specific chunk: `93.7 KiB`
- Shared vendor chunk: `0.0 KiB`
- Shared common chunk: `0.0 KiB`

## 2026-03-10 Baseline (Next.js 16 / Turbopack manifest migration)

Context:

- Next.js 16 no longer emits the legacy root `.next/app-build-manifest.json` used by the original budget script.
- Budget measurement now falls back to route `client-reference-manifest` files plus the root `build-manifest.json`.
- Route-specific chunk cost stays comparable by counting only chunks unique to the target route across app-route manifests.

Measured result from `npm run check:bundle-budget` (`/lobby/[code]/page`):

- Route total JS: `1417.0 KiB`
- Route specific chunk: `107.9 KiB`
- Shared vendor chunk: `0.0 KiB`
- Shared common chunk: `0.0 KiB`

## Enforced Thresholds (default)

`scripts/check-bundle-budget.ts` defaults:

- Route total JS (`/lobby/[code]/page`): `1500 KiB`
- Route specific chunk: `110 KiB`
- Shared vendor chunk: `256 KiB`
- Shared common chunk: `128 KiB`

These thresholds keep route-specific regressions tight while allowing for the higher raw shared-chunk accounting exposed by Next.js 16/Turbopack manifests.

## CI Policy

- `npm run check:bundle-budget` runs in `.github/workflows/ci.yml` (blocking `bundle-budget` job)
- The check runs after a production `npm run build`
- Thresholds can be temporarily adjusted via env vars (`BUNDLE_BUDGET_*`) only with documented rationale in PR
