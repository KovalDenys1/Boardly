# Onboarding Quick Start (#254, Subproject 1) — Design Spec

**Goal:** Show a first-session modal to new users that lets them jump into a bot game in 2 clicks (Quick Start) or dismiss. Full Tour (Path B) is out of scope — deferred to Subproject 2.

**Architecture:** `OnboardingProvider` context wraps the app and checks onboarding status on mount. For authenticated users it calls `GET /api/onboarding/status`; for guests it reads localStorage. If onboarding is needed, it renders the `OnboardingModal`. Quick Start creates a lobby + adds a bot via existing APIs, then redirects.

**Tech Stack:** Next.js, Prisma, React Context, existing `/api/lobby` and `/api/lobby/[code]/add-bot` APIs

---

## 1. Database

Add two nullable fields to `AccountPreferences`:

```prisma
onboardingCompletedAt  DateTime?  @db.Timestamptz(3)
onboardingSkippedAt    DateTime?  @db.Timestamptz(3)
```

A user needs onboarding if both fields are null.

## 2. Guest Storage

Key: `boardly_onboarding` in localStorage.
Values: `'completed'` | `'skipped'` | absent (needs onboarding).

## 3. API

### `GET /api/onboarding/status`
- Authenticated: reads `AccountPreferences.onboardingCompletedAt` and `onboardingSkippedAt`
- Returns `{ needsOnboarding: boolean }`
- If `AccountPreferences` row doesn't exist yet → `needsOnboarding: true`
- Unauthenticated → `401`

### `PATCH /api/onboarding`
- Body: `{ action: 'complete' | 'skip' }`
- Upserts `AccountPreferences` row, sets `onboardingCompletedAt` or `onboardingSkippedAt` to `now()`
- Returns `204`
- Unauthenticated → `401`

## 4. OnboardingProvider

`contexts/OnboardingContext.tsx` — wraps the app in `app/layout.tsx` inside `<Providers>`.

On mount:
- If `status === 'authenticated'` → fetch `GET /api/onboarding/status`; if `needsOnboarding` → set `showModal = true`
- If guest (from `GuestContext`) → read localStorage `boardly_onboarding`; if absent → set `showModal = true`
- Does nothing while `status === 'loading'`

Exposes: `completeOnboarding()`, `skipOnboarding()` — each call the API (or write localStorage for guests), then set `showModal = false`.

## 5. OnboardingModal

`components/Onboarding/OnboardingModal.tsx`

Two steps, rendered as a centered overlay with backdrop:

### Step 1 — Choose path
- "🚀 Quick Start" button → go to Step 2
- "🗺 Show me around" button → disabled, labelled "(coming soon)"
- "Skip for now" link → calls `skipOnboarding()`

### Step 2 — Pick a game (Quick Start)
- Back arrow → return to Step 1
- Game cards for bot-supported games: Yahtzee 🎲, Tic Tac Toe ❌⭕, Rock Paper Scissors ✊✋✌️
- Selected game highlighted
- "Start playing →" button (disabled until a game is selected)
- On click:
  1. `POST /api/lobby` with `{ gameType, maxPlayers: 2 }`
  2. `POST /api/lobby/[code]/add-bot` on the returned lobby code
  3. Call `completeOnboarding()`
  4. `router.push('/lobby/[code]')`
  5. On any API error: show toast, stay on Step 2

## 6. Files

| Action | Path |
|--------|------|
| Modify | `prisma/schema.prisma` |
| Create | `prisma/migrations/…_add_onboarding_fields` (auto-generated) |
| Create | `app/api/onboarding/status/route.ts` |
| Create | `app/api/onboarding/route.ts` |
| Create | `contexts/OnboardingContext.tsx` |
| Create | `components/Onboarding/OnboardingModal.tsx` |
| Modify | `app/providers.tsx` — add `OnboardingProvider` |

## 7. Out of scope (Subproject 2)

- Path B: Full guided tour with tooltips/overlays
- Post-game "Invite a friend" prompt
- Syncing guest onboarding state to DB on account upgrade
