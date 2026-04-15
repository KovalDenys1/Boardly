# Liar's Party UI (#259) — Design Spec

**Goal:** Build the UI layer for Liar's Party — a custom lobby page covering all game phases, games hub pages, and translations. The game engine is already fully implemented and feature-flagged.

**Architecture:** `LiarsPartyPage` follows the `alias-page.tsx` pattern exactly: own Socket.IO connection, `loadLobby()`, `applyAuthoritativeState()`, `handleMove()`. It handles all statuses (`waiting`, `playing`, `finished`). Phase-specific UI is implemented as named function components inside the same file (`WaitingScreen`, `ClaimScreen`, `ChallengeScreen`, `RevealScreen`, `GameOverScreen`). `isBluff` is present in state for all clients; only the claimant's UI renders it — no server-side sanitization needed (party game, option C).

**Tech Stack:** Next.js, Socket.IO, React, TypeScript, Tailwind CSS

---

## 1. Game Engine Summary (what the UI consumes)

The engine (`lib/games/liars-party-game.ts`) exposes:

- **Phases:** `claim` → `challenge` → `reveal` → (next round or game over)
- **Moves:**
  - `submit-claim` (claimant only, phase `claim`): `{ data: { claim: string, isBluff: boolean } }`
  - `submit-challenge` (non-claimant active players, phase `challenge`): `{ data: { decision: 'challenge' | 'believe' } }`
  - `advance-round` (any player, phase `reveal`): no payload — host-only enforced in UI
- **Key state fields:**
  - `phase`, `currentRound`, `maxRounds`, `eliminationThreshold`
  - `currentClaimantId`, `claimantOrder`
  - `activePlayerIds`, `eliminatedPlayerIds`, `eliminatedAtRound`
  - `claim` (null during `claim` phase, populated after submission)
  - `challengeVotes`, `submittedPlayerIds`
  - `scores`, `strikes`
  - `lastTurnResult` → `roundResults` array (last element = most recent resolved round)
  - `winnerId`, `ranking`

---

## 2. Files

| Action | Path |
|--------|------|
| Create | `app/lobby/[code]/liars-party-page.tsx` |
| Create | `__tests__/app/liars-party-page.test.tsx` |
| Modify | `app/lobby/[code]/LobbyPageClient.tsx` |
| Create | `app/games/liars-party/page.tsx` |
| Create | `app/games/liars-party/lobbies/page.tsx` |
| Modify | `app/games/page.tsx` |
| Modify | `locales/en.ts`, `locales/ru.ts`, `locales/uk.ts`, `locales/no.ts` |

---

## 3. LiarsPartyPage Component

**`app/lobby/[code]/liars-party-page.tsx`**

### Props
```typescript
interface LiarsPartyPageProps { code: string }
```

### Key state (same pattern as alias-page.tsx)
```typescript
const [loading, setLoading] = useState(true)
const [lobby, setLobby] = useState<Lobby | null>(null)
const [game, setGame] = useState<Game | null>(null)
const [gameEngine, setGameEngine] = useState<LiarsPartyGame | null>(null)
const [socket, setSocket] = useState<Socket | null>(null)
const [isStarting, setIsStarting] = useState(false)
const [isMoveSubmitting, setIsMoveSubmitting] = useState(false)
```

### Interfaces
```typescript
interface Lobby {
  id: string; code: string; gameType: string; creatorId: string
  name: string; isActive?: boolean; turnTimer?: number
}
interface GamePlayer {
  id: string; userId: string; name: string; user?: { username?: string }
}
interface Game {
  id: string; status: string; state: unknown; players: GamePlayer[]
}
```

### Socket events handled
- `game-update` → `applyAuthoritativeState` or `loadLobby`
- `game-abandoned` → toast `lobby.gameAbandoned` + redirect `/games` (toastId: `liars-party-lifecycle-redirect`)
- `player-left` → toast `toast.playerLeft` + redirect if `remainingPlayers < 4`
- `lobby-update`, `player-joined` → `loadLobby`

### handleMove
Posts `{ gameId, move: { type, playerId, data, timestamp }, userId }` to `POST /api/game/[gameId]/state`. No optimistic updates for Liar's Party (phase transitions are driven by server state).

### handleStartGame
Posts to `POST /api/game/create` with `{ gameType: 'liars_party', lobbyId, config: { maxPlayers: 12, minPlayers: 4 } }`.

### Screen routing
```
loading                    → <LoadingSpinner>
waiting status             → <WaitingScreen>
playing + claim phase      → isEliminated ? <EliminatedClaimScreen> : <ClaimScreen>
playing + challenge phase  → isEliminated ? <EliminatedChallengeScreen> : <ChallengeScreen>
playing + reveal phase     → <RevealScreen>  (eliminated players see this too — read-only)
finished                   → <GameOverScreen>
```

`isEliminated` = `data.eliminatedPlayerIds.includes(currentUserId)`

---

## 4. Screen Designs

### `WaitingScreen`
- `data-testid="liars-party-waiting-room"`
- Player list with count (`X/12`)
- Settings display: `{maxRounds} rounds · eliminated after {eliminationThreshold} strikes`
- Rules summary (from `getGameRules()`)
- Host: "Start Game" button (disabled when `players.length < 4`), disabled state shows reason
- Non-host: "Waiting for host to start..."
- "Leave" button for all

### `ClaimScreen`
- `data-testid="liars-party-claim-screen"`
- **Claimant view:**
  - Header: "Your turn to make a claim!" + round indicator (`Round X / Y`)
  - Textarea: placeholder "Write your claim..." (5–180 chars, char counter shown)
  - Two large toggle buttons: "✓ Truth" / "🎭 Bluff" — one must be selected before submit
  - "Submit Claim" button (disabled until text ≥ 5 chars and truth/bluff selected)
  - Turn timer countdown (client-computed from `state.lastMoveAt + turnTimer`)
- **Non-claimant view:**
  - "[Name] is making a claim..." + round indicator
  - Turn timer

### `ChallengeScreen`
- `data-testid="liars-party-challenge-screen"`
- Claim text displayed prominently for all
- Vote progress: `X / Y voted` (where Y = active players minus claimant)
- **Non-claimant active players:**
  - "Challenge 🔥" button (red) — believes it's a bluff
  - "Believe ✓" button (green) — believes it's true
  - After voting: shows own choice + "Waiting for others..."
- **Claimant:**
  - Shows own claim text
  - Shows vote progress `X / Y voted` — no action buttons
- **Eliminated players:** see claim text and vote progress, no buttons (eliminated banner)

### `RevealScreen`
- `data-testid="liars-party-reveal-screen"`
- Claim text + big reveal: "TRUTH ✓" or "BLUFF 🎭" (revealed)
- Vote breakdown: list of players with their decision (challenge/believe) + ✓/✗ indicator
- Score deltas for this round (per player)
- Current strikes for each player (with `eliminationThreshold` shown)
- Eliminated this round: callout if any player was eliminated
- Total scores for all active players
- Host: active "Next Round →" button (or "See Final Results" on last round)
- Others: disabled "Next Round" button with "Waiting for host..."

### `GameOverScreen`
- `data-testid="liars-party-game-over-screen"`
- Winner name + celebration
- Full ranking table: position, name, score, strikes
- `completionReason` displayed (`last-player-standing` vs `max-rounds-reached`)
- Host: "Play Again" button → `handleStartGame`
- All: "Back to Games" button → `/games`

### `EliminatedClaimScreen` / `EliminatedChallengeScreen`
- Same layout as `ClaimScreen` / `ChallengeScreen` respectively
- All action buttons hidden
- Top banner: `data-testid="eliminated-banner"` — "You were eliminated in Round N"

---

## 5. Games Hub Pages

### `app/games/liars-party/page.tsx`
SEO info page following `app/games/spy/page.tsx` pattern:
- Metadata: title, description, OG, canonical URL
- JSON-LD: `VideoGame` schema
- Breadcrumb: Home / Games / Liar's Party
- Hero: emoji 🎭, h1 "Play Liar's Party Online", description, CTA → `/lobby/create?gameType=liars_party`
- Key facts grid: Players 4–12, Price Free, Download None, Game type Social
- "What is Liar's Party?" section
- "How to Play" ordered steps
- Secondary CTA: "Browse Lobbies" → `/games/liars-party/lobbies`

### `app/games/liars-party/lobbies/page.tsx`
Following `app/games/spy/lobbies/page.tsx` pattern exactly:
- Socket connection for `lobby-list-update` events
- `fetchWithGuest('/api/lobby?gameType=liars_party')`
- Auto-refresh every 5 seconds
- Create lobby card → `/lobby/create?gameType=liars_party`
- Quick join by code input
- Active lobbies list with player count, status badges

### `app/games/page.tsx`
Change alias entry for `liars-party`:
```typescript
status: 'available',
route: '/games/liars-party/lobbies',
```

---

## 6. Translations

New top-level `liarsParty:` section in all 4 locale files (`en.ts`, `ru.ts`, `uk.ts`, `no.ts`):

```typescript
liarsParty: {
  // Waiting room
  waitingForPlayers: 'Waiting for players...',
  roundsCount: '{{count}} rounds',
  eliminatedAfter: 'eliminated after {{count}} strikes',
  startGame: 'Start Game',

  // Claim phase
  yourTurnToClaim: 'Your turn to make a claim!',
  isClaimingFor: '{{name}} is making a claim...',
  claimPlaceholder: 'Write your claim...',
  truth: 'Truth',
  bluff: 'Bluff',
  submitClaim: 'Submit Claim',
  charsRemaining: '{{count}} chars remaining',

  // Challenge phase
  challengeOrBelieve: 'Challenge or Believe?',
  challenge: 'Challenge 🔥',
  believe: 'Believe ✓',
  voted: '{{done}}/{{total}} voted',
  waitingForVotes: 'Waiting for others to vote...',
  youVoted: 'You voted: {{decision}}',

  // Reveal phase
  wasBluff: 'BLUFF 🎭',
  wasTruth: 'TRUTH ✓',
  nextRound: 'Next Round →',
  seeResults: 'See Final Results',
  waitingForHost: 'Waiting for host...',
  round: 'Round {{current}} / {{total}}',

  // Elimination
  eliminated: 'You were eliminated',
  eliminatedAt: 'Eliminated in Round {{round}}',
  strikes: '{{count}} / {{max}} strikes',

  // Game over
  wins: '{{name}} wins!',
  playAgain: 'Play Again',
  lastPlayerStanding: 'Last player standing!',
  maxRoundsReached: 'All rounds complete',
  rank: '#{{position}}',
},
```

Also add `games.liars_party.lobbies.*` keys (title, subtitle, etc.) following `games.spy.lobbies.*` pattern for the lobbies hub page.

---

## 7. Tests

`__tests__/app/liars-party-page.test.tsx` — follows `alias-page.test.tsx` exactly:

**Mock setup:** same mocks (`next/navigation`, `next-auth/react`, `GuestContext`, `react-i18next`, `fetch-with-guest`, `socket-client-auth`, `socket-url`, `client-logger`, `lobby-create-metrics`, `analytics`, `LoadingSpinner`, `ReactionOverlay`, `socket.io-client`)

**buildLobbyResponse():** returns lobby with `gameType: 'liars_party'`, activeGame with `status: 'waiting'`, 4 players, and `state.data` matching `LiarsPartyGameData` initial shape.

**Test cases:**
1. `'renders the waiting room'` — waits for `alias-waiting-room`... wait, testid is `liars-party-waiting-room`
2. `'redirects away when game-abandoned socket event fires'` → toast `lobby.gameAbandoned` + `router.replace('/games')`
3. `'redirects when player-left drops below minimum'` → `remainingPlayers: 3` → toast + redirect

---

## 8. Out of Scope (v1)

- Per-round timer display on `RevealScreen` (timer only shown during active phases)
- Sound effects on reveal
- Spectator mode for non-players
- Bot support
- Configurable round count / elimination threshold in lobby creation UI (engine supports it, lobby creation UI does not expose it — hardcoded defaults used)
