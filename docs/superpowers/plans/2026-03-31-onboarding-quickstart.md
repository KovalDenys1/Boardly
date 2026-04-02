# Onboarding Quick Start (#254) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a first-session modal to new users that lets them jump into a bot game in 2 clicks (Quick Start) or dismiss.

**Architecture:** `AccountPreferences` gets two nullable timestamp fields. `OnboardingProvider` context wraps the app, fetches status on mount, and renders `OnboardingModal` when needed. The modal guides the user through Quick Start: pick a game → POST /api/lobby → POST /api/lobby/[code]/add-bot → redirect.

**Tech Stack:** Next.js App Router, Prisma, React Context, next-auth, existing lobby/bot APIs

---

## File Structure

| Action | Path |
|--------|------|
| Modify | `prisma/schema.prisma` |
| Create | `app/api/onboarding/status/route.ts` |
| Create | `app/api/onboarding/route.ts` |
| Create | `contexts/OnboardingContext.tsx` |
| Create | `components/Onboarding/OnboardingModal.tsx` |
| Modify | `app/providers.tsx` |
| Create | `__tests__/api/onboarding-status.test.ts` |
| Create | `__tests__/api/onboarding.test.ts` |

---

### Task 1: DB schema — add onboarding fields to AccountPreferences

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add fields to AccountPreferences model**

Open `prisma/schema.prisma` and find the `AccountPreferences` model. Add two fields after `showOnlineStatus`:

```prisma
model AccountPreferences {
  id                    String            @id @default(cuid())
  userId                String            @unique
  user                  Users             @relation(fields: [userId], references: [id], onDelete: Cascade)
  profileVisibility     ProfileVisibility @default(public)
  showOnlineStatus      Boolean           @default(true)
  onboardingCompletedAt DateTime?         @db.Timestamptz(3)
  onboardingSkippedAt   DateTime?         @db.Timestamptz(3)
  createdAt             DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt             DateTime          @updatedAt @db.Timestamptz(3)

  @@index([userId])
  @@index([profileVisibility])
}
```

- [ ] **Step 2: Generate Prisma client and create migration**

```bash
cd /Users/denyskoval/Documents/Boardly
npm run db:generate
```

Then create the migration (this requires the local DB to be running):
```bash
npx prisma migrate dev --name add_onboarding_fields
```

If the local DB is not available, generate migration files only:
```bash
npx prisma migrate dev --name add_onboarding_fields --create-only
```

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(#254): add onboardingCompletedAt and onboardingSkippedAt to AccountPreferences"
```

---

### Task 2: GET /api/onboarding/status

**Files:**
- Create: `app/api/onboarding/status/route.ts`
- Create: `__tests__/api/onboarding-status.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/onboarding-status.test.ts`:

```typescript
/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { GET } from '@/app/api/onboarding/status/route'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/next-auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  prisma: {
    users: { findUnique: jest.fn() },
    accountPreferences: { findUnique: jest.fn() },
  },
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

function buildRequest() {
  return new NextRequest('http://localhost:3000/api/onboarding/status', { method: 'GET' })
}

describe('GET /api/onboarding/status', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.users.findUnique.mockResolvedValue({ id: 'user-1', username: 'alice', suspended: false } as any)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await GET(buildRequest())
    expect(res.status).toBe(401)
  })

  it('returns needsOnboarding: true when no AccountPreferences row exists', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.accountPreferences.findUnique.mockResolvedValue(null)
    const res = await GET(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.needsOnboarding).toBe(true)
  })

  it('returns needsOnboarding: true when both timestamps are null', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.accountPreferences.findUnique.mockResolvedValue({
      onboardingCompletedAt: null,
      onboardingSkippedAt: null,
    } as any)
    const res = await GET(buildRequest())
    const body = await res.json()
    expect(body.needsOnboarding).toBe(true)
  })

  it('returns needsOnboarding: false when onboardingCompletedAt is set', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.accountPreferences.findUnique.mockResolvedValue({
      onboardingCompletedAt: new Date('2026-01-01'),
      onboardingSkippedAt: null,
    } as any)
    const res = await GET(buildRequest())
    const body = await res.json()
    expect(body.needsOnboarding).toBe(false)
  })

  it('returns needsOnboarding: false when onboardingSkippedAt is set', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.accountPreferences.findUnique.mockResolvedValue({
      onboardingCompletedAt: null,
      onboardingSkippedAt: new Date('2026-01-01'),
    } as any)
    const res = await GET(buildRequest())
    const body = await res.json()
    expect(body.needsOnboarding).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/denyskoval/Documents/Boardly && npx jest __tests__/api/onboarding-status.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '@/app/api/onboarding/status/route'`

- [ ] **Step 3: Implement the route**

Create `app/api/onboarding/status/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const prefs = await prisma.accountPreferences.findUnique({
    where: { userId: session.user.id },
    select: { onboardingCompletedAt: true, onboardingSkippedAt: true },
  })

  const needsOnboarding = !prefs || (!prefs.onboardingCompletedAt && !prefs.onboardingSkippedAt)

  return NextResponse.json({ needsOnboarding })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/denyskoval/Documents/Boardly && npx jest __tests__/api/onboarding-status.test.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add app/api/onboarding/status/route.ts __tests__/api/onboarding-status.test.ts
git commit -m "feat(#254): add GET /api/onboarding/status"
```

---

### Task 3: PATCH /api/onboarding

**Files:**
- Create: `app/api/onboarding/route.ts`
- Create: `__tests__/api/onboarding.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/onboarding.test.ts`:

```typescript
/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { PATCH } from '@/app/api/onboarding/route'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/next-auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  prisma: {
    users: { findUnique: jest.fn() },
    accountPreferences: { upsert: jest.fn() },
  },
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/onboarding', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/onboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.users.findUnique.mockResolvedValue({ id: 'user-1', username: 'alice', suspended: false } as any)
    mockPrisma.accountPreferences.upsert.mockResolvedValue({} as any)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await PATCH(buildRequest({ action: 'complete' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid action', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PATCH(buildRequest({ action: 'invalid' }))
    expect(res.status).toBe(400)
  })

  it('upserts onboardingCompletedAt when action is complete', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PATCH(buildRequest({ action: 'complete' }))
    expect(res.status).toBe(204)
    expect(mockPrisma.accountPreferences.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: expect.objectContaining({ onboardingCompletedAt: expect.any(Date) }),
      })
    )
  })

  it('upserts onboardingSkippedAt when action is skip', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PATCH(buildRequest({ action: 'skip' }))
    expect(res.status).toBe(204)
    expect(mockPrisma.accountPreferences.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: expect.objectContaining({ onboardingSkippedAt: expect.any(Date) }),
      })
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/denyskoval/Documents/Boardly && npx jest __tests__/api/onboarding.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '@/app/api/onboarding/route'`

- [ ] **Step 3: Implement the route**

Create `app/api/onboarding/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { action?: string }
  if (body.action !== 'complete' && body.action !== 'skip') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const now = new Date()
  const updateData = body.action === 'complete'
    ? { onboardingCompletedAt: now }
    : { onboardingSkippedAt: now }

  await prisma.accountPreferences.upsert({
    where: { userId: session.user.id },
    update: updateData,
    create: {
      userId: session.user.id,
      ...updateData,
    },
  })

  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/denyskoval/Documents/Boardly && npx jest __tests__/api/onboarding.test.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add app/api/onboarding/route.ts __tests__/api/onboarding.test.ts
git commit -m "feat(#254): add PATCH /api/onboarding"
```

---

### Task 4: OnboardingContext

**Files:**
- Create: `contexts/OnboardingContext.tsx`

- [ ] **Step 1: Implement OnboardingContext**

Create `contexts/OnboardingContext.tsx`:

```typescript
'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { useGuest } from '@/contexts/GuestContext'

const GUEST_ONBOARDING_KEY = 'boardly_onboarding'

interface OnboardingContextType {
  showModal: boolean
  completeOnboarding: () => Promise<void>
  skipOnboarding: () => Promise<void>
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined)

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { status } = useSession()
  const { isGuest } = useGuest()
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    if (status === 'loading') return

    if (status === 'authenticated') {
      fetch('/api/onboarding/status', { cache: 'no-store' })
        .then((r) => r.json())
        .then((data: { needsOnboarding: boolean }) => {
          if (data.needsOnboarding) setShowModal(true)
        })
        .catch(() => {/* silently ignore — don't block the app */})
      return
    }

    if (isGuest) {
      const stored = localStorage.getItem(GUEST_ONBOARDING_KEY)
      if (!stored) setShowModal(true)
    }
  }, [status, isGuest])

  const completeOnboarding = useCallback(async () => {
    if (status === 'authenticated') {
      await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      })
    } else {
      localStorage.setItem(GUEST_ONBOARDING_KEY, 'completed')
    }
    setShowModal(false)
  }, [status])

  const skipOnboarding = useCallback(async () => {
    if (status === 'authenticated') {
      await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip' }),
      })
    } else {
      localStorage.setItem(GUEST_ONBOARDING_KEY, 'skipped')
    }
    setShowModal(false)
  }, [status])

  return (
    <OnboardingContext.Provider value={{ showModal, completeOnboarding, skipOnboarding }}>
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding(): OnboardingContextType {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider')
  return ctx
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/denyskoval/Documents/Boardly && npx tsc --noEmit 2>&1 | grep "OnboardingContext\|error TS" | head -10
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add contexts/OnboardingContext.tsx
git commit -m "feat(#254): add OnboardingContext and OnboardingProvider"
```

---

### Task 5: OnboardingModal UI

**Files:**
- Create: `components/Onboarding/OnboardingModal.tsx`

The modal is a fixed overlay. Step 1 shows two path buttons + skip. Step 2 shows the game picker + "Start playing" button. Bot-supported games: Yahtzee (`yahtzee`), Tic Tac Toe (`tic_tac_toe`), Rock Paper Scissors (`rock_paper_scissors`).

- [ ] **Step 1: Implement the modal**

Create `components/Onboarding/OnboardingModal.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOnboarding } from '@/contexts/OnboardingContext'
import { showToast } from '@/lib/i18n-toast'

const BOT_GAMES = [
  { type: 'yahtzee', label: 'Yahtzee', icon: '🎲' },
  { type: 'tic_tac_toe', label: 'Tic Tac Toe', icon: '❌⭕' },
  { type: 'rock_paper_scissors', label: 'Rock Paper Scissors', icon: '✊✋✌️' },
] as const

type GameType = typeof BOT_GAMES[number]['type']

export function OnboardingModal() {
  const router = useRouter()
  const { showModal, completeOnboarding, skipOnboarding } = useOnboarding()
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null)
  const [loading, setLoading] = useState(false)

  if (!showModal) return null

  const handleQuickStart = async () => {
    if (!selectedGame || loading) return
    setLoading(true)
    try {
      const lobbyRes = await fetch('/api/lobby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: selectedGame, maxPlayers: 2 }),
      })
      if (!lobbyRes.ok) throw new Error('Failed to create lobby')
      const { lobby } = await lobbyRes.json() as { lobby: { code: string } }

      const botRes = await fetch(`/api/lobby/${lobby.code}/add-bot`, { method: 'POST' })
      if (!botRes.ok) throw new Error('Failed to add bot')

      await completeOnboarding()
      router.push(`/lobby/${lobby.code}`)
    } catch {
      showToast.error('common.error')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 shadow-2xl p-6">
        {step === 1 ? (
          <>
            <div className="text-center mb-6">
              <span className="text-5xl">🎲</span>
              <h2 className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-white">
                Welcome to Boardly!
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                How would you like to start?
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setStep(2)}
                className="w-full flex items-center gap-4 rounded-2xl border-2 border-blue-500 bg-blue-50 dark:bg-blue-500/10 px-5 py-4 text-left hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
              >
                <span className="text-3xl">🚀</span>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">Quick Start</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Get into a game in 2 clicks</p>
                </div>
              </button>

              <button
                disabled
                className="w-full flex items-center gap-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-5 py-4 text-left opacity-50 cursor-not-allowed"
              >
                <span className="text-3xl">🗺</span>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">Show me around</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Guided tour — coming soon</p>
                </div>
              </button>
            </div>

            <button
              onClick={skipOnboarding}
              className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              Skip for now
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => setStep(1)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xl transition-colors"
                aria-label="Back"
              >
                ←
              </button>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Choose a game
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-3 mb-6">
              {BOT_GAMES.map((game) => (
                <button
                  key={game.type}
                  onClick={() => setSelectedGame(game.type)}
                  className={`flex items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-colors ${
                    selectedGame === game.type
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                      : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500/50'
                  }`}
                >
                  <span className="text-3xl">{game.icon}</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{game.label}</span>
                </button>
              ))}
            </div>

            <button
              onClick={handleQuickStart}
              disabled={!selectedGame || loading}
              className="w-full rounded-2xl bg-blue-600 px-6 py-3 font-bold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Starting...' : 'Start playing →'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/denyskoval/Documents/Boardly && npx tsc --noEmit 2>&1 | grep "OnboardingModal\|error TS" | head -10
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/Onboarding/OnboardingModal.tsx
git commit -m "feat(#254): add OnboardingModal with Quick Start flow"
```

---

### Task 6: Wire into providers and layout

**Files:**
- Modify: `app/providers.tsx`
- Modify: `app/layout.tsx` (add OnboardingModal inside body)

- [ ] **Step 1: Add OnboardingProvider to providers.tsx**

In `app/providers.tsx`, add the import:

```typescript
import { OnboardingProvider } from '@/contexts/OnboardingContext'
import { OnboardingModal } from '@/components/Onboarding/OnboardingModal'
```

Wrap the existing `<ToastProvider>` content with `<OnboardingProvider>` and add `<OnboardingModal />` inside it:

```typescript
return (
  <SessionProvider basePath="/api/auth">
    <GuestProvider>
      <OnboardingProvider>
        <ToastProvider>
          <Toaster position="top-right" />
          <DeferredGlobalEffects />
          <OnboardingModal />
          {children}
        </ToastProvider>
      </OnboardingProvider>
    </GuestProvider>
  </SessionProvider>
)
```

- [ ] **Step 2: Run full CI check**

```bash
cd /Users/denyskoval/Documents/Boardly && npm run ci:quick 2>&1 | grep -E "error|Error|✖|✓" | head -20
```

Expected: 0 errors

- [ ] **Step 3: Run all tests**

```bash
cd /Users/denyskoval/Documents/Boardly && npm test -- --testPathPattern="onboarding" --no-coverage 2>&1 | tail -15
```

Expected: all tests pass

- [ ] **Step 4: Commit and push**

```bash
git add app/providers.tsx
git commit -m "feat(#254): wire OnboardingProvider and OnboardingModal into app"
git push -u origin feature/254-onboarding
```
