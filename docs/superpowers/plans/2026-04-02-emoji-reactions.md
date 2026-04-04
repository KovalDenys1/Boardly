# Emoji Reactions (#266) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating reaction bar during active gameplay so players can send animated emoji reactions (👍 😂 😮 🎉 🔥) that appear on all players' screens with the sender's name.

**Architecture:** New `send-reaction` socket handler (follows `player-typing` pattern) validates and broadcasts reactions to the lobby room. `ReactionOverlay` component renders a fixed pill bar and animates incoming reactions as floating emojis with a name tag. Added to `LobbyPageContent`, `TicTacToeLobbyPage`, and `RockPaperScissorsLobbyPage` when `gameStatus === 'playing'`.

**Tech Stack:** Socket.IO, React state, CSS keyframe animations, TypeScript

---

## File Structure

| Action | Path |
|--------|------|
| Modify | `types/socket-events.ts` — add `SEND_REACTION` and `REACTION` event names |
| Modify | `lib/socket/handlers/types.ts` — add `SendReactionSocket` type |
| Create | `lib/socket/handlers/send-reaction.ts` — handler factory |
| Create | `__tests__/socket/handlers/send-reaction.test.ts` — handler unit tests |
| Modify | `socket-server.ts` — import + register handler |
| Create | `components/ReactionOverlay.tsx` — bar + animations |
| Modify | `app/lobby/[code]/LobbyPageClient.tsx` — add overlay when playing |
| Modify | `app/lobby/[code]/tic-tac-toe-page.tsx` — add overlay when playing |
| Modify | `app/lobby/[code]/rock-paper-scissors-page.tsx` — add overlay when playing |

---

### Task 1: Add socket event names and handler type

**Files:**
- Modify: `types/socket-events.ts`
- Modify: `lib/socket/handlers/types.ts`

- [ ] **Step 1: Add SEND_REACTION and REACTION to SocketEvents**

In `types/socket-events.ts`, find the block where `SEND_CHAT_MESSAGE` and `CHAT_MESSAGE` are defined (around line 81-84) and add after them:

```typescript
  SEND_REACTION: 'send-reaction',    // Client → Server
  REACTION: 'reaction',              // Server → All in room
```

- [ ] **Step 2: Add SendReactionSocket type to handler types**

In `lib/socket/handlers/types.ts`, add after `SendChatMessageSocket`:

```typescript
export type SendReactionSocket = SocketWithUser & HasRoomSet
```

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/denyskoval/Documents/Boardly && npm run typecheck 2>&1 | tail -5
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add types/socket-events.ts lib/socket/handlers/types.ts
git commit -m "feat(#266): add SEND_REACTION and REACTION socket event names"
```

---

### Task 2: send-reaction handler + tests

**Files:**
- Create: `lib/socket/handlers/send-reaction.ts`
- Create: `__tests__/socket/handlers/send-reaction.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/socket/handlers/send-reaction.test.ts`:

```typescript
import { createSendReactionHandler } from '../../../lib/socket/handlers/send-reaction'
import { SocketEvents, SocketRooms } from '../../../types/socket-events'

const ALLOWED_EMOJIS = ['👍', '😂', '😮', '🎉', '🔥']

describe('createSendReactionHandler', () => {
  function createDeps(overrides?: Partial<Parameters<typeof createSendReactionHandler>[0]>) {
    return {
      socketMonitor: { trackEvent: jest.fn() },
      checkRateLimit: jest.fn().mockReturnValue(true),
      isSocketAuthorizedForLobby: jest.fn().mockReturnValue(true),
      getUserDisplayName: jest.fn().mockReturnValue('Alice'),
      emitWithMetadata: jest.fn(),
      now: jest.fn().mockReturnValue(1000),
      ...overrides,
    }
  }

  function createSocket() {
    return {
      id: 'socket-1',
      data: { user: { id: 'user-1', username: 'Alice' } },
      rooms: new Set<string>(['socket-1', 'lobby:LOBBY1']),
    }
  }

  it('broadcasts reaction to lobby room on valid payload', () => {
    const deps = createDeps()
    const handler = createSendReactionHandler(deps)
    const socket = createSocket()

    handler(socket, { lobbyCode: 'LOBBY1', emoji: '👍' })

    expect(deps.socketMonitor.trackEvent).toHaveBeenCalledWith('send-reaction')
    expect(deps.emitWithMetadata).toHaveBeenCalledWith(
      SocketRooms.lobby('LOBBY1'),
      SocketEvents.REACTION,
      expect.objectContaining({
        userId: 'user-1',
        username: 'Alice',
        emoji: '👍',
        timestamp: 1000,
      })
    )
    expect(deps.emitWithMetadata.mock.calls[0][2]).toHaveProperty('id')
  })

  it('trims lobby code before auth check', () => {
    const deps = createDeps()
    const handler = createSendReactionHandler(deps)
    const socket = createSocket()

    handler(socket, { lobbyCode: ' LOBBY1 ', emoji: '👍' })

    expect(deps.isSocketAuthorizedForLobby).toHaveBeenCalledWith(socket, 'LOBBY1')
    expect(deps.emitWithMetadata).toHaveBeenCalled()
  })

  it.each(ALLOWED_EMOJIS)('allows emoji %s', (emoji) => {
    const deps = createDeps()
    const handler = createSendReactionHandler(deps)
    handler(createSocket(), { lobbyCode: 'LOBBY1', emoji })
    expect(deps.emitWithMetadata).toHaveBeenCalled()
  })

  it('silently ignores emoji not in whitelist', () => {
    const deps = createDeps()
    const handler = createSendReactionHandler(deps)
    handler(createSocket(), { lobbyCode: 'LOBBY1', emoji: '💀' })
    expect(deps.emitWithMetadata).not.toHaveBeenCalled()
  })

  it('silently ignores when rate limited', () => {
    const deps = createDeps({ checkRateLimit: jest.fn().mockReturnValue(false) })
    const handler = createSendReactionHandler(deps)
    handler(createSocket(), { lobbyCode: 'LOBBY1', emoji: '👍' })
    expect(deps.emitWithMetadata).not.toHaveBeenCalled()
  })

  it('silently ignores when socket not authorized for lobby', () => {
    const deps = createDeps({ isSocketAuthorizedForLobby: jest.fn().mockReturnValue(false) })
    const handler = createSendReactionHandler(deps)
    handler(createSocket(), { lobbyCode: 'LOBBY1', emoji: '👍' })
    expect(deps.emitWithMetadata).not.toHaveBeenCalled()
  })

  it('silently ignores missing lobby code', () => {
    const deps = createDeps()
    const handler = createSendReactionHandler(deps)
    handler(createSocket(), { lobbyCode: '   ', emoji: '👍' })
    expect(deps.emitWithMetadata).not.toHaveBeenCalled()
  })

  it('throttles to one reaction per user per 3 seconds', () => {
    let now = 1000
    const deps = createDeps({ now: () => now })
    const handler = createSendReactionHandler(deps)
    const socket = createSocket()

    handler(socket, { lobbyCode: 'LOBBY1', emoji: '👍' })
    handler(socket, { lobbyCode: 'LOBBY1', emoji: '😂' })
    expect(deps.emitWithMetadata).toHaveBeenCalledTimes(1)

    now += 3000
    handler(socket, { lobbyCode: 'LOBBY1', emoji: '🎉' })
    expect(deps.emitWithMetadata).toHaveBeenCalledTimes(2)
  })

  it('throttles independently per user', () => {
    const deps = createDeps()
    const handler = createSendReactionHandler(deps)
    const socket1 = createSocket()
    const socket2 = { ...createSocket(), id: 'socket-2', data: { user: { id: 'user-2', username: 'Bob' } } }

    handler(socket1, { lobbyCode: 'LOBBY1', emoji: '👍' })
    handler(socket2, { lobbyCode: 'LOBBY1', emoji: '😂' })
    expect(deps.emitWithMetadata).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/denyskoval/Documents/Boardly && npx jest __tests__/socket/handlers/send-reaction.test.ts --no-coverage 2>&1 | tail -5
```

Expected: FAIL — `Cannot find module '../../../lib/socket/handlers/send-reaction'`

- [ ] **Step 3: Implement the handler**

Create `lib/socket/handlers/send-reaction.ts`:

```typescript
import { randomUUID } from 'crypto'
import { SocketEvents, SocketRooms } from '../../../types/socket-events'
import { SendReactionSocket } from './types'

const ALLOWED_EMOJIS = new Set(['👍', '😂', '😮', '🎉', '🔥'])
const DEFAULT_REACTION_THROTTLE_MS = 3000
const DEFAULT_REACTION_THROTTLE_STALE_MS = 60000

interface SocketMonitorLike {
  trackEvent: (event: string) => void
}

interface SendReactionPayload {
  lobbyCode: string
  emoji: string
}

interface SendReactionDependencies {
  socketMonitor: SocketMonitorLike
  checkRateLimit: (socketId: string) => boolean
  isSocketAuthorizedForLobby: (socket: SendReactionSocket, lobbyCode: string) => boolean
  getUserDisplayName: (user: { username?: string | null; email?: string | null } | undefined) => string
  emitWithMetadata: (room: string, event: string, data: Record<string, unknown>) => void
  now?: () => number
  reactionThrottleMs?: number
  reactionThrottleStaleMs?: number
}

export function createSendReactionHandler({
  socketMonitor,
  checkRateLimit,
  isSocketAuthorizedForLobby,
  getUserDisplayName,
  emitWithMetadata,
  now = () => Date.now(),
  reactionThrottleMs = DEFAULT_REACTION_THROTTLE_MS,
  reactionThrottleStaleMs = DEFAULT_REACTION_THROTTLE_STALE_MS,
}: SendReactionDependencies) {
  const lastReactionAtByUser = new Map<string, number>()
  let lastCleanupAt = 0

  function cleanupStale(timestamp: number) {
    if (timestamp - lastCleanupAt < reactionThrottleStaleMs) return
    lastCleanupAt = timestamp
    for (const [key, last] of lastReactionAtByUser.entries()) {
      if (timestamp - last >= reactionThrottleStaleMs) {
        lastReactionAtByUser.delete(key)
      }
    }
  }

  return (socket: SendReactionSocket, data: SendReactionPayload) => {
    socketMonitor.trackEvent('send-reaction')

    if (!checkRateLimit(socket.id)) return

    const lobbyCode = typeof data?.lobbyCode === 'string' ? data.lobbyCode.trim() : ''
    if (!lobbyCode) return

    const emoji = typeof data?.emoji === 'string' ? data.emoji : ''
    if (!ALLOWED_EMOJIS.has(emoji)) return

    if (!isSocketAuthorizedForLobby(socket, lobbyCode)) return

    const userId = socket.data.user.id
    const nowTs = now()
    const lastAt = lastReactionAtByUser.get(userId)
    if (typeof lastAt === 'number' && nowTs - lastAt < reactionThrottleMs) return

    lastReactionAtByUser.set(userId, nowTs)
    cleanupStale(nowTs)

    emitWithMetadata(SocketRooms.lobby(lobbyCode), SocketEvents.REACTION, {
      id: randomUUID(),
      userId,
      username: getUserDisplayName(socket.data.user),
      emoji,
      timestamp: nowTs,
    })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/denyskoval/Documents/Boardly && npx jest __tests__/socket/handlers/send-reaction.test.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add lib/socket/handlers/send-reaction.ts __tests__/socket/handlers/send-reaction.test.ts
git commit -m "feat(#266): add send-reaction socket handler with throttle and emoji whitelist"
```

---

### Task 3: Register handler in socket-server.ts

**Files:**
- Modify: `socket-server.ts`

- [ ] **Step 1: Import the handler**

At the top of `socket-server.ts`, alongside the other handler imports, add:

```typescript
import { createSendReactionHandler } from './lib/socket/handlers/send-reaction'
```

- [ ] **Step 2: Create handler instance**

In `socket-server.ts`, find where `handlePlayerTyping` is created (after the `handleSendChatMessage` block, around line 700-720). Add after the `handlePlayerTyping` creation:

```typescript
const handleSendReaction = createSendReactionHandler({
  socketMonitor,
  checkRateLimit,
  isSocketAuthorizedForLobby,
  getUserDisplayName,
  emitWithMetadata: (room, event, data) => {
    emitWithMetadata(io, room, event, data)
  },
})
```

- [ ] **Step 3: Register the socket.on listener**

Find where `socket.on(SocketEvents.PLAYER_TYPING, ...)` is registered (around line 845). Add immediately after it:

```typescript
  socket.on(SocketEvents.SEND_REACTION, (data: { lobbyCode: string; emoji: string }) => {
    handleSendReaction(socket, data)
  })
```

- [ ] **Step 4: Run typecheck**

```bash
cd /Users/denyskoval/Documents/Boardly && npm run typecheck 2>&1 | tail -5
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add socket-server.ts
git commit -m "feat(#266): register send-reaction handler in socket server"
```

---

### Task 4: ReactionOverlay component

**Files:**
- Create: `components/ReactionOverlay.tsx`

- [ ] **Step 1: Create the component**

Create `components/ReactionOverlay.tsx`:

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { Socket } from 'socket.io-client'
import { SocketEvents } from '@/types/socket-events'

const ALLOWED_EMOJIS = ['👍', '😂', '😮', '🎉', '🔥'] as const
type AllowedEmoji = typeof ALLOWED_EMOJIS[number]

const REACTION_DURATION_MS = 1600
const CLIENT_THROTTLE_MS = 3000

interface FloatingReaction {
  id: string
  emoji: string
  username: string
  x: number // percent of screen width, 25–75
}

interface ReactionPayload {
  id: string
  userId: string
  username: string
  emoji: string
  timestamp: number
}

interface ReactionOverlayProps {
  socket: Socket | null
  lobbyCode: string
}

export function ReactionOverlay({ socket, lobbyCode }: ReactionOverlayProps) {
  const [reactions, setReactions] = useState<FloatingReaction[]>([])
  const [disabledEmoji, setDisabledEmoji] = useState<AllowedEmoji | null>(null)
  const lastSentAtRef = useRef<number>(0)

  useEffect(() => {
    if (!socket) return

    const handler = (data: ReactionPayload) => {
      if (!data?.id || !data?.emoji || !data?.username) return
      setReactions((prev) => [
        ...prev,
        {
          id: data.id,
          emoji: data.emoji,
          username: data.username,
          x: 25 + Math.random() * 50,
        },
      ])
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== data.id))
      }, REACTION_DURATION_MS)
    }

    socket.on(SocketEvents.REACTION, handler)
    return () => { socket.off(SocketEvents.REACTION, handler) }
  }, [socket])

  const sendReaction = (emoji: AllowedEmoji) => {
    if (!socket || disabledEmoji) return
    const now = Date.now()
    if (now - lastSentAtRef.current < CLIENT_THROTTLE_MS) return
    lastSentAtRef.current = now
    socket.emit(SocketEvents.SEND_REACTION, { lobbyCode, emoji })
    setDisabledEmoji(emoji)
    setTimeout(() => setDisabledEmoji(null), CLIENT_THROTTLE_MS)
  }

  return (
    <>
      {/* Floating reactions */}
      {reactions.map((r) => (
        <div
          key={r.id}
          className="pointer-events-none fixed z-40 flex flex-col items-center gap-0.5 animate-reaction-float"
          style={{ left: `${r.x}%`, bottom: '80px' }}
        >
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white/90 leading-none">
            {r.username}
          </span>
          <span className="text-[28px] leading-none">{r.emoji}</span>
        </div>
      ))}

      {/* Reaction bar */}
      <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
        <div className="flex gap-1 rounded-full bg-black/50 px-3 py-2 backdrop-blur-sm">
          {ALLOWED_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => sendReaction(emoji)}
              disabled={!!disabledEmoji}
              aria-label={`React with ${emoji}`}
              className={`rounded-full px-1.5 py-0.5 text-[22px] transition-all duration-150 hover:scale-125 active:scale-110 disabled:cursor-not-allowed ${
                disabledEmoji ? 'opacity-50' : 'opacity-100'
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Add the CSS keyframe animation**

In `app/globals.css`, add the `animate-reaction-float` keyframe. Find the end of the file and add:

```css
@keyframes reaction-float {
  0%   { opacity: 1; transform: translateY(0) scale(1); }
  15%  { opacity: 1; transform: translateY(-12px) scale(1.15); }
  100% { opacity: 0; transform: translateY(-120px) scale(1.1); }
}
.animate-reaction-float {
  animation: reaction-float 1.6s ease-out forwards;
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/denyskoval/Documents/Boardly && npm run typecheck 2>&1 | tail -5
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add components/ReactionOverlay.tsx app/globals.css
git commit -m "feat(#266): add ReactionOverlay component with floating emoji animation"
```

---

### Task 5: Wire ReactionOverlay into all three game pages

**Files:**
- Modify: `app/lobby/[code]/LobbyPageClient.tsx`
- Modify: `app/lobby/[code]/tic-tac-toe-page.tsx`
- Modify: `app/lobby/[code]/rock-paper-scissors-page.tsx`

#### 5a — LobbyPageContent (Yahtzee, Spy, Memory)

The `LobbyPageContent` component is the large component inside `LobbyPageClient.tsx`. It has `isGameStarted = game?.status === 'playing'` (line ~1400) and `socket` from `useSocketConnection` (line ~772). `code` comes from `useParams()`.

- [ ] **Step 5a-1: Add import to LobbyPageClient.tsx**

At the top of `app/lobby/[code]/LobbyPageClient.tsx`, add:

```typescript
import { ReactionOverlay } from '@/components/ReactionOverlay'
```

- [ ] **Step 5a-2: Add overlay in LobbyPageContent return**

Find the main `return (` in `LobbyPageContent` (line ~1588). The outer div is:
```tsx
<div className={`${!isGameStarted ? 'bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500' : ''}`}>
```

Add the `ReactionOverlay` as a sibling just before the closing `</div>` of that outermost div:

```tsx
  {isGameStarted && socket && (
    <ReactionOverlay socket={socket} lobbyCode={code} />
  )}
</div>
```

Note: `code` is already available as `const code = params.code as string` near the top of `LobbyPageContent`.

#### 5b — TicTacToeLobbyPage

- [ ] **Step 5b-1: Add import to tic-tac-toe-page.tsx**

```typescript
import { ReactionOverlay } from '@/components/ReactionOverlay'
```

- [ ] **Step 5b-2: Add overlay in the main return**

In `TicTacToeLobbyPage`, the game is shown when `resolvedStatus === 'playing' || resolvedStatus === 'finished'`. The main return is at line ~780. The outer div is `<div className="container mx-auto px-4 py-8 max-w-6xl">`.

Find the closing `</div>` of that outermost container and add before it:

```tsx
  {resolvedStatus === 'playing' && socket && (
    <ReactionOverlay socket={socket} lobbyCode={code} />
  )}
</div>
```

Note: `code` is a prop of `TicTacToeLobbyPage` (from `TicTacToeLobbyPageProps`). `socket` is `useState<Socket | null>(null)`. `resolvedStatus` is already computed (`const resolvedStatus = game?.status || gameEngine?.getState().status`).

#### 5c — RockPaperScissorsLobbyPage

- [ ] **Step 5c-1: Add import to rock-paper-scissors-page.tsx**

```typescript
import { ReactionOverlay } from '@/components/ReactionOverlay'
```

- [ ] **Step 5c-2: Add overlay in the main return**

The main game render starts at the final `return (` (after early returns for loading/error states). `lobby.game.status` holds the current status. `socket` is `useState<Socket | null>(null)`.

Find the closing `</div>` of the outermost element in the main return and add before it:

```tsx
  {lobby.game.status === 'playing' && socket && (
    <ReactionOverlay socket={socket} lobbyCode={code} />
  )}
```

Note: `code` is already available from `const { code } = props` or the component receives it as a prop. Check the component signature — if it's `RockPaperScissorsLobbyPageProps`, it includes `code: string`.

- [ ] **Step 5-final: Run CI and all tests**

```bash
cd /Users/denyskoval/Documents/Boardly && npm run ci:quick 2>&1 | tail -10
```

Expected: 0 errors

```bash
cd /Users/denyskoval/Documents/Boardly && npx jest __tests__/socket/handlers/send-reaction.test.ts --no-coverage 2>&1 | tail -5
```

Expected: PASS

- [ ] **Step 5-commit: Commit and push**

```bash
git add app/lobby/\[code\]/LobbyPageClient.tsx app/lobby/\[code\]/tic-tac-toe-page.tsx app/lobby/\[code\]/rock-paper-scissors-page.tsx
git commit -m "feat(#266): wire ReactionOverlay into all active game pages"
git push -u origin feature/266-emoji-reactions
```
