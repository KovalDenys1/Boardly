# Emoji Reactions (#266) — Design Spec

**Goal:** Add a floating reaction bar during active gameplay that lets players send animated emoji reactions visible to all players in the room.

**Architecture:** New `ReactionOverlay` component renders as a fixed overlay in `LobbyPageClient` when `gameStatus === 'playing'`. A new `send-reaction` socket handler validates, throttles, and broadcasts reactions to the room. No persistence — reactions are ephemeral.

**Tech Stack:** Next.js, Socket.IO, React state, CSS keyframe animations

---

## 1. Socket Events

Add to `types/socket-events.ts`:

```typescript
SEND_REACTION: 'send-reaction',  // Client → Server
REACTION: 'reaction',            // Server → All in room
```

### Client → Server payload (`SEND_REACTION`)
```typescript
{ lobbyCode: string; emoji: string }
```

### Server → Client broadcast (`REACTION`)
```typescript
{ id: string; userId: string; username: string; emoji: string; timestamp: number }
```

---

## 2. Server Handler

**File:** `lib/socket/handlers/send-reaction.ts`

Pattern: follows `send-chat-message.ts` (dependency injection, same interface).

**Validation:**
- `emoji` must be one of: `['👍', '😂', '😮', '🎉', '🔥']` — any other value is silently ignored
- Socket must be authorized for the lobby (`isSocketAuthorizedForLobby`)
- User must be an active player in the lobby (`isUserActivePlayerInLobby`)

**Throttle:**
- In-memory `Map<userId, number>` (`lastReactionAt`) stored in `socket-server.ts`
- Max 1 reaction per user per 3 seconds
- If throttled: silently ignore (no error emitted to client — button just doesn't fire visually)

**On success:** `emitWithMetadata` to `SocketRooms.lobby(lobbyCode)` with `REACTION` event.

**Registration in `socket-server.ts`:** same pattern as chat handler.

---

## 3. ReactionOverlay Component

**File:** `components/ReactionOverlay.tsx`

### Props
```typescript
interface ReactionOverlayProps {
  socket: Socket | null
  lobbyCode: string
}
```

### Reaction bar
- `fixed bottom-6 left-1/2 -translate-x-1/2 z-30`
- Pill container with `backdrop-blur-sm bg-black/40`
- 5 buttons: 👍 😂 😮 🎉 🔥
- On click: emit `SEND_REACTION` with `{ lobbyCode, emoji }`
- Client-side throttle: button disabled for 3s after click (visual feedback — button opacity 50%)

### Incoming reactions
- `useEffect` listens for `SocketEvents.REACTION` on socket
- State: `FloatingReaction[]` where `FloatingReaction = { id: string; emoji: string; username: string; x: number }`
- On receive: append to array with random `x` offset (30–70% of screen width), remove after 1600ms
- Cleanup: remove listener on unmount

### Floating animation
Each `FloatingReaction` renders as an absolutely positioned element:
```
username tag (small pill, rgba black bg)
emoji (28px)
```
CSS keyframe: `floatUp` — starts at `bottom: 80px`, translates up 120px, fades out over 1.6s.

---

## 4. Integration in LobbyPageClient

**File:** `app/lobby/[code]/LobbyPageClient.tsx`

- Import `ReactionOverlay`
- Render only when `gameStatus === 'playing'`:
```tsx
{gameStatus === 'playing' && (
  <ReactionOverlay socket={socket} lobbyCode={lobbyCode} />
)}
```
- `socket` is already available from `useSocketConnection` in the component

---

## 5. Files

| Action | Path |
|--------|------|
| Modify | `types/socket-events.ts` |
| Create | `lib/socket/handlers/send-reaction.ts` |
| Modify | `lib/socket/handlers/types.ts` — add `SendReactionSocket` type |
| Modify | `socket-server.ts` — register handler, add throttle map |
| Create | `components/ReactionOverlay.tsx` |
| Modify | `app/lobby/[code]/LobbyPageClient.tsx` |

---

## 6. Out of scope

- Reaction counts / aggregation display
- Persistence to DB
- Per-game positioning (overlay sits above all games uniformly)
- Spectator reactions (spectators do not see the bar)
