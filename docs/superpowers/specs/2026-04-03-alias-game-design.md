# Alias (#302) — Design Spec

**Goal:** Add Alias as a fully playable team word-guessing game on Boardly, covering the game engine, game board UI, and games hub pages.

**Architecture:** `AliasGame extends GameEngine` manages all game phases via `processMove`. All player actions (switch team, start rounds, word actions, end turn, next turn) go through the existing `GAME_ACTION` socket → `POST /api/game/[gameId]/state` flow. Teams are initialized in an `overrideStartGame()` hook and stored in `AliasGameData`. The turn timer is server-authoritative via `applyTimeoutFallback`, consistent with Liar's Party and Telephone Doodle. A dedicated `AliasPage` renders all game phases.

**Tech Stack:** Next.js, Socket.IO (existing `GAME_ACTION` flow), Prisma, TypeScript

---

## 1. Game Rules (as implemented)

- 2 teams, auto-distributed when game starts, players can switch before rounds begin
- Each turn: one player from the current team describes 10 words (one at a time) to teammates
- Guessed word: +1 point to team; Skipped word: −1 point to team
- Turn ends when timer runs out (default 60s, lobby-configurable) or all 10 words are exhausted
- 3 turns per team (hardcoded for v1); teams alternate turns
- Winner: team with most points after all turns; tie → both teams win
- Words dealt from a static server-side deck (~200 words); used words are tracked to avoid repeats

---

## 2. Data Model

### DB: Add `alias` to `GameType` enum

**`prisma/schema.prisma`** — add `alias` to the `GameType` enum.

**Migration** `prisma/migrations/YYYYMMDD_add_alias_game_type/migration.sql`:
```sql
ALTER TYPE "GameType" ADD VALUE 'alias';
```

### `AliasTeam`

```typescript
interface AliasTeam {
  id: string          // 'team-1' | 'team-2'
  name: string        // 'Team 1' | 'Team 2'
  playerIds: string[]
  score: number
  describerIndex: number  // rotating index into playerIds for turn assignment
}
```

### `AliasWordResult`

```typescript
interface AliasWordResult {
  word: string
  result: 'guessed' | 'skipped'
}
```

### `AliasTurnResult`

```typescript
interface AliasTurnResult {
  teamId: string
  describerId: string
  wordResults: AliasWordResult[]
  scoreDelta: number    // net score this turn (guessed - skipped, can be negative)
  turnIndex: number     // zero-based
}
```

### `AliasGameData`

```typescript
interface AliasGameData {
  phase: 'team_assignment' | 'turn_active' | 'turn_results' | 'game_over'
  teams: AliasTeam[]
  currentTeamIndex: number          // index into teams[]
  turnsPerTeam: number              // 3 (fixed for v1)
  skipPenalty: number               // -1

  // Active turn
  currentCard: string[] | null      // 10 words for current turn; only describer sees in UI
  currentCardIndex: number          // which word the describer is on (0-9)
  currentCardResults: AliasWordResult[]  // results of words processed so far this turn
  turnStartedAt: number | null      // Date.now() when turn began

  // History
  teamTurnCounts: Record<string, number>  // teamId → completed turns
  lastTurnResult: AliasTurnResult | null
  usedWordIndices: number[]         // indices into ALIAS_WORDS[] to avoid repeats

  // End state
  winnerId: string | null           // team id or 'tie'
}
```

---

## 3. Word Deck

**`lib/games/alias-words.ts`**

Exports `ALIAS_WORDS: readonly string[]` — 200+ common English nouns/verbs (castle, pillow, volcano, doctor, ladder, ocean, guitar, shadow, candle, elephant…).

Words are randomly sampled from this array. `usedWordIndices` tracks which have been used. When fewer than 10 unused words remain, the used list is reset (shuffle again).

---

## 4. Game Engine

**`lib/games/alias.ts`** — `AliasGame extends GameEngine`

### Constructor

```typescript
constructor(gameId: string) {
  super(gameId, 'alias', {
    maxPlayers: 16,
    minPlayers: 4,
  })
}
```

### `getInitialGameData(): AliasGameData`

Returns empty state with `phase: 'team_assignment'`, empty teams, no active card.

### `overrideStartGame()` (or call from `startGame()` override)

Called after `super.startGame()`. Distributes `this.state.players` into 2 teams in round-robin order:

```typescript
startGame(): boolean {
  const ok = super.startGame()
  if (!ok) return false
  const data = this.state.data as AliasGameData
  data.teams = [
    { id: 'team-1', name: 'Team 1', playerIds: [], score: 0, describerIndex: 0 },
    { id: 'team-2', name: 'Team 2', playerIds: [], score: 0, describerIndex: 0 },
  ]
  data.teamTurnCounts = { 'team-1': 0, 'team-2': 0 }
  this.state.players.forEach((p, i) => {
    data.teams[i % 2].playerIds.push(p.id)
  })
  return true
}
```

### `validateMove(move: Move): boolean`

Checks:
- `switch_team`: phase is `team_assignment`; payload has `targetTeamId`; player exists; target team exists
- `start_rounds`: phase is `team_assignment`; each team has ≥ 2 players (any player can trigger — host enforcement is in the UI only)
- `word_action`: phase is `turn_active`; caller is current describer; `action` is `'guess'` or `'skip'`; `currentCardIndex < 10`
- `end_turn`: phase is `turn_active`; caller is current describer
- `next_turn`: phase is `turn_results` (any player can trigger — host enforcement is in the UI only)

### `processMove(move: Move): void`

**`switch_team`**: Remove player from current team, add to `targetTeamId`.

**`start_rounds`**: Deal first card (10 random words from `ALIAS_WORDS`), set `phase = 'turn_active'`, `turnStartedAt = Date.now()`, `currentCardIndex = 0`, `currentCardResults = []`.

**`word_action`**:
- Record result for `currentCardResults`
- Increment `currentCardIndex`
- If `currentCardIndex >= 10` OR all words exhausted → call `_endTurn()`
- Update `state.lastMoveAt = Date.now()`

**`end_turn`**: Call `_endTurn()`.

**`next_turn`** (host advances from results screen):
- Increment `currentTeamIndex` (mod 2)
- Check if game is over: `Object.values(teamTurnCounts).every(n => n >= turnsPerTeam)`
  - If over: determine winner, set `phase = 'game_over'`, `state.status = 'finished'`
  - Else: deal new card, set `phase = 'turn_active'`, `turnStartedAt = Date.now()`

**`_endTurn()` (internal)**:
- Calculate `scoreDelta = guessedCount - (skippedCount * |skipPenalty|)`
- Update `teams[currentTeamIndex].score += scoreDelta`
- Advance `describerIndex` in current team
- Increment `teamTurnCounts[currentTeamId]`
- Set `lastTurnResult`, `phase = 'turn_results'`
- Clear `currentCard`, `currentCardResults`

### `applyTimeoutFallback(turnTimerSeconds: number): { changed: boolean }`

```typescript
applyTimeoutFallback(turnTimerSeconds: number): { changed: boolean } {
  const data = this.state.data as AliasGameData
  if (data.phase !== 'turn_active' || data.turnStartedAt === null) {
    return { changed: false }
  }
  const elapsed = Date.now() - data.turnStartedAt
  if (elapsed < turnTimerSeconds * 1000) {
    return { changed: false }
  }
  // Auto-end turn: skip remaining words
  while (data.currentCardIndex < (data.currentCard?.length ?? 0)) {
    data.currentCardResults.push({
      word: data.currentCard![data.currentCardIndex],
      result: 'skipped',
    })
    data.currentCardIndex++
  }
  this._endTurn()
  this.state.updatedAt = new Date()
  return { changed: true }
}
```

---

## 5. Game Registry & Catalog

**`lib/game-registry.ts`**:
- Add `'alias'` to `RegisteredGameType`
- Add `ALIAS_METADATA: GameMetadata` with `minPlayers: 4, maxPlayers: 16`
- Add `createGameEngine('alias', ...)` case
- Add `alias` to `getRegisteredGameTypes()`

**`lib/game-catalog.ts`**:
- Add `'alias'` to `RegisteredGameType`
- Add `ALIAS_METADATA` entry
- Add `'alias'` to `isSupportedGameType()` and `isRegisteredGameType()`

**`lib/restore-game-engine-client.ts`**:
- Add `case 'alias'`: dynamic import `AliasGame`, return new instance

---

## 6. Timeout Integration

**`app/api/lobby/[code]/route.ts`** — in the GET handler (lobby snapshot), add an alias timeout fallback block alongside the existing liars_party and telephone_doodle ones:

```typescript
if (activeGame.status === 'playing' && gameType === 'alias') {
  const turnTimerSeconds = resolveTurnTimerSeconds(safeLobby.turnTimer)
  if (turnTimerSeconds > 0) {
    const aliasGame = gameEngine as AliasGame
    const timeoutResult = aliasGame.applyTimeoutFallback(turnTimerSeconds)
    if (timeoutResult.changed) {
      // persist and broadcast (same pattern as liars_party)
    }
  }
}
```

---

## 7. AliasPage Component

**`app/lobby/[code]/alias-page.tsx`**

Follows the `tic-tac-toe-page.tsx` pattern exactly: own Socket.IO connection, `loadLobby()` fetches `/api/lobby/[code]`, listens for `GAME_UPDATE`, submits moves via `POST /api/game/[gameId]/state`.

### Props

```typescript
interface AliasPageProps { code: string }
```

### Key state

```typescript
const [lobby, setLobby] = useState<Lobby | null>(null)
const [game, setGame] = useState<Game | null>(null)
const [gameEngine, setGameEngine] = useState<AliasGame | null>(null)
const [socket, setSocket] = useState<Socket | null>(null)
```

### Screens (switched by `data.phase`)

**`TeamAssignmentScreen`** — `phase === 'team_assignment'`
- Two columns showing team names and player names
- Each player has a "Switch to Team X" button (emits `switch_team` move)
- All players see "Begin Rounds" button; only the host's button is enabled (active when each team ≥ 2 players); emits `start_rounds` move
- Leave lobby button

**`DescriberScreen`** — `phase === 'turn_active'` and current user is current describer
- Current word displayed prominently (from `currentCard[currentCardIndex]`)
- "✓ Guessed" and "⏭ Skip" buttons (emit `word_action` move)
- Progress: `${currentCardIndex}/10`
- Countdown timer (client-computed from `turnStartedAt + lobby.turnTimer * 1000 - Date.now()`)
- Current turn score (running: guessed - skipped so far)

**`GuesserScreen`** — `phase === 'turn_active'` and current user is NOT the describer
- Describer's name + "is describing..."
- Team name and countdown timer
- Running score counter (total guessed/skipped this turn, updated on each `GAME_UPDATE`)
- Word count progress: `X/10 words done`

**`TurnResultsScreen`** — `phase === 'turn_results'`
- List of word results: `word ✓` / `word ✗`
- Score delta: `+5 guessed, -2 skipped = +3`
- Total scores for both teams
- Host sees active "Next Turn" button; other players see it disabled; host emits `next_turn` move

**`GameOverScreen`** — `phase === 'game_over'`
- Winner team name + confetti/celebration
- Final scores for both teams
- "Play Again" button (creates new lobby)

### Word card visibility

`currentCard` is in the game state sent to all clients. The UI only renders the word content in `DescriberScreen`. Other screens receive the state but never display the card words.

### ReactionOverlay

Add `<ReactionOverlay socket={socket} lobbyCode={code} />` when `game.status === 'playing'` (already implemented in #266).

---

## 8. LobbyPageClient Integration

**`app/lobby/[code]/LobbyPageClient.tsx`**

Add after the existing RPS route:

```typescript
if (gameType === 'alias' && (gameStatus === 'playing' || gameStatus === 'finished')) {
  return <AliasPage code={code} />
}
```

Import: `import AliasPage from '@/app/lobby/[code]/alias-page'`

---

## 9. Games Hub Pages

**`app/games/alias/page.tsx`** — info page following `app/games/spy/page.tsx` pattern: SEO metadata, game description, rules, "Play Now" button (`/lobby/create?gameType=alias`).

**`app/games/alias/lobbies/page.tsx`** — open lobbies list following `app/games/spy/lobbies/page.tsx` pattern.

**`app/games/page.tsx`** — change alias entry: `status: 'available'`, `route: '/lobby/create?gameType=alias'`.

---

## 10. Translations

Add keys to `lib/i18n/en.json` and `ru.json`:

```json
"games.alias.name": "Alias",
"games.alias.description": "Describe words to your team against the clock",
"games.alias.difficulty": "Medium",
"alias.team1": "Team 1",
"alias.team2": "Team 2",
"alias.switchTeam": "Switch to {{team}}",
"alias.beginRounds": "Begin Rounds",
"alias.yourTurn": "Your turn to describe!",
"alias.guessed": "Guessed!",
"alias.skip": "Skip",
"alias.nextTurn": "Next Turn",
"alias.playAgain": "Play Again",
"alias.wins": "{{team}} wins!",
"alias.tie": "It's a tie!",
"alias.isDescribing": "{{name}} is describing...",
"alias.wordsProgress": "{{current}}/{{total}} words"
```

---

## 11. Files

| Action | Path |
|--------|------|
| Modify | `prisma/schema.prisma` |
| Create | `prisma/migrations/.../migration.sql` |
| Create | `lib/games/alias-words.ts` |
| Create | `lib/games/alias.ts` |
| Modify | `lib/game-registry.ts` |
| Modify | `lib/game-catalog.ts` |
| Modify | `lib/restore-game-engine-client.ts` |
| Modify | `app/api/lobby/[code]/route.ts` |
| Create | `app/lobby/[code]/alias-page.tsx` |
| Modify | `app/lobby/[code]/LobbyPageClient.tsx` |
| Create | `app/games/alias/page.tsx` |
| Create | `app/games/alias/lobbies/page.tsx` |
| Modify | `app/games/page.tsx` |
| Modify | `lib/i18n/en.json`, `ru.json` |

---

## 12. Out of Scope (v1)

- Configurable rounds count in lobby creation UI (hardcoded to 3)
- Custom word packs
- More than 2 teams
- Spectator word visibility controls
- Bot support
