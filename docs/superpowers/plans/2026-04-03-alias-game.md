# Alias Game (#302) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Alias as a fully playable team word-guessing game on Boardly.

**Architecture:** `AliasGame extends GameEngine` manages game phases via `processMove`. Feature-flagged as experimental (`ENABLE_ALIAS`). During `waiting` status, `AliasPage` shows a **client-side computed** team preview (round-robin split of joined players) — no server `switch_team` moves. Actual team assignment happens in `addPlayer()` override when `POST /api/game/create` starts the game. `startGame()` validates team balance then immediately deals the first card and sets `phase = 'turn_active'`. The turn timer is server-authoritative via `applyTimeoutFallback` in the lobby GET handler, consistent with Liar's Party and Fake Artist. `AliasPage` handles all statuses (`waiting`, `playing`, `finished`) and replaces the standard waiting room.

**Tech Stack:** Next.js, Socket.IO, Prisma, TypeScript

---

## File Map

| Action | Path |
|--------|------|
| Modify | `prisma/schema.prisma` |
| Create | `prisma/migrations/20260403000000_add_alias_game_type/migration.sql` |
| Create | `lib/games/alias-words.ts` |
| Create | `lib/games/alias.ts` |
| Create | `__tests__/lib/games/alias-game.test.ts` |
| Modify | `lib/feature-flags.ts` |
| Modify | `lib/game-registry.ts` |
| Modify | `lib/game-catalog.ts` |
| Modify | `lib/restore-game-engine-client.ts` |
| Modify | `app/api/lobby/[code]/route.ts` |
| Modify | `locales/en.ts` |
| Modify | `locales/ru.ts` |
| Create | `app/lobby/[code]/alias-page.tsx` |
| Create | `__tests__/app/alias-page.test.tsx` |
| Modify | `app/lobby/[code]/LobbyPageClient.tsx` |
| Create | `app/games/alias/page.tsx` |
| Create | `app/games/alias/lobbies/page.tsx` |
| Modify | `app/games/page.tsx` |

---

### Task 1: Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260403000000_add_alias_game_type/migration.sql`

- [ ] **Step 1: Add `alias` to GameType enum**

In `prisma/schema.prisma`, find the `GameType` enum (currently ends with `other`). Add `alias` before `other`:

```
enum GameType {
  yahtzee
  guess_the_spy
  tic_tac_toe
  rock_paper_scissors
  memory
  telephone_doodle
  sketch_and_guess
  liars_party
  fake_artist
  alias
  other
}
```

- [ ] **Step 2: Create migration SQL**

Create file `prisma/migrations/20260403000000_add_alias_game_type/migration.sql`:

```sql
-- AddValue
ALTER TYPE "GameType" ADD VALUE 'alias';
```

- [ ] **Step 3: Validate and regenerate Prisma client**

Run: `npm run db:validate && npm run db:generate`

Expected: exits 0, Prisma client regenerated.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260403000000_add_alias_game_type/
git commit -m "feat(#302): add alias to GameType enum"
```

---

### Task 2: Word Deck

**Files:**
- Create: `lib/games/alias-words.ts`

- [ ] **Step 1: Create the word deck**

Create `lib/games/alias-words.ts`:

```typescript
export const ALIAS_WORDS: readonly string[] = [
  'castle', 'pillow', 'volcano', 'doctor', 'ladder', 'ocean', 'guitar', 'shadow', 'candle', 'elephant',
  'mirror', 'thunder', 'kitchen', 'umbrella', 'dragon', 'bicycle', 'forest', 'lantern', 'crown', 'submarine',
  'library', 'compass', 'tornado', 'bakery', 'telescope', 'pyramid', 'whistle', 'cactus', 'hammock', 'glacier',
  'chimney', 'magnet', 'sandbox', 'lighthouse', 'pretzel', 'trapeze', 'carousel', 'anchor', 'balloon', 'treasure',
  'penguin', 'suitcase', 'shovel', 'rainbow', 'campfire', 'parachute', 'hourglass', 'blanket', 'bridge', 'statue',
  'canyon', 'riddle', 'sunrise', 'snowflake', 'meadow', 'corkscrew', 'waterfall', 'diamond', 'feather', 'cabinet',
  'clocktower', 'stallion', 'coconut', 'jungle', 'podium', 'sponge', 'mustache', 'trophy', 'caterpillar', 'puzzle',
  'noodle', 'doorbell', 'bracelet', 'lemon', 'knitting', 'seagull', 'blizzard', 'moonlight', 'cinnamon', 'staircase',
  'snowman', 'whisper', 'curtain', 'dolphin', 'keyboard', 'giraffe', 'teapot', 'scarecrow', 'unicorn', 'thunderstorm',
  'carnival', 'bulldozer', 'passport', 'skeleton', 'hurricane', 'labyrinth', 'octopus', 'footprint', 'spaghetti', 'windmill',
  'calendar', 'jellyfish', 'cathedral', 'fireworks', 'porcupine', 'avalanche', 'breakfast', 'honeybee', 'starfish', 'marathon',
  'armadillo', 'trapdoor', 'quicksand', 'pendulum', 'envelope', 'shipwreck', 'astronaut', 'cannonball', 'crocodile', 'popcorn',
  'fireplace', 'mushroom', 'stalactite', 'thunderbolt', 'xylophone', 'satellite', 'magician', 'doorstep', 'igloo', 'tapestry',
  'sandstorm', 'helicopter', 'periscope', 'driftwood', 'mongoose', 'accordion', 'cobblestone', 'firefly', 'chandelier', 'pebble',
  'sparrow', 'tangerine', 'centipede', 'stethoscope', 'birdsong', 'cobweb', 'snowdrift', 'binoculars', 'toothbrush', 'doorknob',
  'pineapple', 'stargazer', 'quill', 'raindrop', 'lifeboat', 'catapult', 'windchime', 'lollipop', 'backpack', 'sandals',
  'typewriter', 'harmonica', 'jellybean', 'pinecone', 'watermelon', 'strawberry', 'paintbrush', 'signpost', 'earthquake', 'chalkboard',
  'tambourine', 'macaroon', 'daffodil', 'whirlpool', 'flamingo', 'scorpion', 'trombone', 'footstool', 'keystone', 'marshmallow',
  'pomegranate', 'boomerang', 'catfish', 'goblin', 'sandpaper', 'clockwork', 'starship', 'moonbeam', 'toadstool', 'butterscotch',
  'archipelago', 'kaleidoscope', 'bubblegum', 'dragonfly', 'glowworm', 'thundercloud', 'tadpole', 'mudslide', 'candlestick', 'patchwork',
] as const
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run ci:quick`

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add lib/games/alias-words.ts
git commit -m "feat(#302): add alias word deck (200 words)"
```

---

### Task 3: Game Engine + Tests

**Files:**
- Create: `lib/games/alias.ts`
- Create: `__tests__/lib/games/alias-game.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/games/alias-game.test.ts`:

```typescript
import { AliasGame, type AliasGameData } from '@/lib/games/alias'

function createMove(type: string, playerId: string, payload: Record<string, unknown> = {}) {
  return { type, playerId, payload, timestamp: Date.now() }
}

function getData(game: AliasGame): AliasGameData {
  return game.getState().data as AliasGameData
}

function addFourPlayers(game: AliasGame) {
  game.addPlayer({ id: 'p1', name: 'Alice', score: 0, isActive: true })
  game.addPlayer({ id: 'p2', name: 'Bob', score: 0, isActive: true })
  game.addPlayer({ id: 'p3', name: 'Carol', score: 0, isActive: true })
  game.addPlayer({ id: 'p4', name: 'Dave', score: 0, isActive: true })
}

describe('AliasGame', () => {
  describe('initialization', () => {
    it('starts with two empty teams and team_assignment phase', () => {
      const game = new AliasGame('g1')
      const data = getData(game)
      expect(data.phase).toBe('team_assignment')
      expect(data.teams).toHaveLength(2)
      expect(data.teams[0].id).toBe('team-1')
      expect(data.teams[1].id).toBe('team-2')
      expect(data.teams[0].playerIds).toHaveLength(0)
      expect(data.teams[1].playerIds).toHaveLength(0)
    })
  })

  describe('addPlayer', () => {
    it('distributes players round-robin across teams', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      const data = getData(game)
      expect(data.teams[0].playerIds).toEqual(['p1', 'p3'])
      expect(data.teams[1].playerIds).toEqual(['p2', 'p4'])
    })

    it('puts 5th player on smaller team', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.addPlayer({ id: 'p5', name: 'Eve', score: 0, isActive: true })
      const data = getData(game)
      // team-1 has p1,p3; team-2 has p2,p4; p5 goes to team-1 (tied, picks first)
      expect(data.teams[0].playerIds).toContain('p5')
    })
  })

  describe('startGame', () => {
    it('rejects start when a team has fewer than 2 players', () => {
      const game = new AliasGame('g1')
      game.addPlayer({ id: 'p1', name: 'Alice', score: 0, isActive: true })
      game.addPlayer({ id: 'p2', name: 'Bob', score: 0, isActive: true })
      game.addPlayer({ id: 'p3', name: 'Carol', score: 0, isActive: true })
      const result = game.startGame()
      expect(result).toBe(false)
    })

    it('starts the game and enters turn_active with a 10-word card', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      const result = game.startGame()
      expect(result).toBe(true)
      const data = getData(game)
      expect(data.phase).toBe('turn_active')
      expect(data.currentCard).toHaveLength(10)
      expect(data.currentCardIndex).toBe(0)
      expect(data.turnStartedAt).not.toBeNull()
    })
  })

  describe('validateMove', () => {
    it('rejects word_action when not in turn_active phase', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      // game is still in waiting status / team_assignment phase
      expect(game.validateMove(createMove('word_action', 'p1', { action: 'guess' }))).toBe(false)
    })

    it('rejects word_action when caller is not the describer', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const data = getData(game)
      const describerId = data.teams[0].playerIds[0] // 'p1'
      const notDescriber = data.teams[0].playerIds[1]  // 'p3'
      expect(game.validateMove(createMove('word_action', notDescriber, { action: 'guess' }))).toBe(false)
      expect(game.validateMove(createMove('word_action', describerId, { action: 'guess' }))).toBe(true)
    })

    it('rejects word_action with invalid action value', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const data = getData(game)
      const describerId = data.teams[0].playerIds[0]
      expect(game.validateMove(createMove('word_action', describerId, { action: 'wrong' }))).toBe(false)
    })

    it('accepts end_turn from current describer', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const data = getData(game)
      const describerId = data.teams[0].playerIds[0]
      expect(game.validateMove(createMove('end_turn', describerId))).toBe(true)
    })

    it('rejects next_turn when not in turn_results phase', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      expect(game.validateMove(createMove('next_turn', 'p1'))).toBe(false)
    })
  })

  describe('processMove: word_action', () => {
    it('records guess and increments card index', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const describerId = getData(game).teams[0].playerIds[0]
      game.makeMove(createMove('word_action', describerId, { action: 'guess' }))
      const data = getData(game)
      expect(data.currentCardIndex).toBe(1)
      expect(data.currentCardResults[0].result).toBe('guessed')
    })

    it('records skip and increments card index', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const describerId = getData(game).teams[0].playerIds[0]
      game.makeMove(createMove('word_action', describerId, { action: 'skip' }))
      const data = getData(game)
      expect(data.currentCardResults[0].result).toBe('skipped')
    })

    it('ends turn automatically after 10 word actions', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const describerId = getData(game).teams[0].playerIds[0]
      for (let i = 0; i < 10; i++) {
        game.makeMove(createMove('word_action', describerId, { action: 'guess' }))
      }
      expect(getData(game).phase).toBe('turn_results')
    })
  })

  describe('processMove: end_turn', () => {
    it('transitions to turn_results and records lastTurnResult', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const describerId = getData(game).teams[0].playerIds[0]
      game.makeMove(createMove('word_action', describerId, { action: 'guess' }))
      game.makeMove(createMove('word_action', describerId, { action: 'skip' }))
      game.makeMove(createMove('end_turn', describerId))
      const data = getData(game)
      expect(data.phase).toBe('turn_results')
      expect(data.lastTurnResult).not.toBeNull()
      expect(data.lastTurnResult!.scoreDelta).toBe(0) // 1 guess - 1 skip = 0
      expect(data.teams[0].score).toBe(0)
    })

    it('calculates score correctly: 3 guessed - 1 skipped = +2', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const describerId = getData(game).teams[0].playerIds[0]
      game.makeMove(createMove('word_action', describerId, { action: 'guess' }))
      game.makeMove(createMove('word_action', describerId, { action: 'guess' }))
      game.makeMove(createMove('word_action', describerId, { action: 'guess' }))
      game.makeMove(createMove('word_action', describerId, { action: 'skip' }))
      game.makeMove(createMove('end_turn', describerId))
      expect(getData(game).teams[0].score).toBe(2)
    })
  })

  describe('processMove: next_turn', () => {
    function endTurn(game: AliasGame) {
      game.makeMove(createMove('end_turn', getData(game).teams[getData(game).currentTeamIndex].playerIds[getData(game).teams[getData(game).currentTeamIndex].describerIndex]))
    }

    it('switches to the other team and deals a new card', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      endTurn(game)
      expect(getData(game).currentTeamIndex).toBe(0)
      game.makeMove(createMove('next_turn', 'p1'))
      const data = getData(game)
      expect(data.currentTeamIndex).toBe(1)
      expect(data.phase).toBe('turn_active')
      expect(data.currentCard).toHaveLength(10)
    })

    it('finishes game after all 6 turns (3 per team)', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      // 6 turns total: team0, team1, team0, team1, team0, team1
      for (let i = 0; i < 6; i++) {
        endTurn(game)
        if (i < 5) {
          game.makeMove(createMove('next_turn', 'p1'))
        }
      }
      expect(getData(game).phase).toBe('game_over')
      expect(game.getState().status).toBe('finished')
      expect(getData(game).winnerId).not.toBeNull()
    })

    it('picks winning team based on higher score', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      // Give team-1 a point on first turn
      const describerId = getData(game).teams[0].playerIds[0]
      game.makeMove(createMove('word_action', describerId, { action: 'guess' }))
      endTurn(game)
      // Advance through all remaining turns with 0 score
      for (let i = 0; i < 5; i++) {
        game.makeMove(createMove('next_turn', 'p1'))
        endTurn(game)
      }
      expect(getData(game).winnerId).toBe('team-1')
    })

    it('sets winnerId to "tie" when scores are equal', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      for (let i = 0; i < 6; i++) {
        endTurn(game)
        if (i < 5) game.makeMove(createMove('next_turn', 'p1'))
      }
      expect(getData(game).winnerId).toBe('tie')
    })
  })

  describe('applyTimeoutFallback', () => {
    it('returns changed: false when phase is not turn_active', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      // Still in team_assignment / waiting
      expect(game.applyTimeoutFallback(60).changed).toBe(false)
    })

    it('returns changed: false when timer has not expired', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const now = Date.now()
      expect(game.applyTimeoutFallback(60, now).changed).toBe(false)
    })

    it('skips remaining words and ends turn when timer expires', () => {
      const game = new AliasGame('g1')
      addFourPlayers(game)
      game.startGame()
      const pastTime = Date.now() + 61_000 // 61s in the future = timer expired
      const result = game.applyTimeoutFallback(60, pastTime)
      expect(result.changed).toBe(true)
      expect(getData(game).phase).toBe('turn_results')
      expect(getData(game).lastTurnResult!.wordResults).toHaveLength(10)
      expect(getData(game).lastTurnResult!.wordResults.every(r => r.result === 'skipped')).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx jest __tests__/lib/games/alias-game.test.ts --no-coverage`

Expected: FAIL — `Cannot find module '@/lib/games/alias'`

- [ ] **Step 3: Create the game engine**

Create `lib/games/alias.ts`:

```typescript
import { GameEngine, type Move, type Player } from '@/lib/game-engine'
import { ALIAS_WORDS } from './alias-words'

export interface AliasTeam {
  id: string
  name: string
  playerIds: string[]
  score: number
  describerIndex: number
}

export interface AliasWordResult {
  word: string
  result: 'guessed' | 'skipped'
}

export interface AliasTurnResult {
  teamId: string
  describerId: string
  wordResults: AliasWordResult[]
  scoreDelta: number
  turnIndex: number
}

export interface AliasGameData {
  phase: 'team_assignment' | 'turn_active' | 'turn_results' | 'game_over'
  teams: AliasTeam[]
  currentTeamIndex: number
  turnsPerTeam: number
  skipPenalty: number
  currentCard: string[] | null
  currentCardIndex: number
  currentCardResults: AliasWordResult[]
  turnStartedAt: number | null
  teamTurnCounts: Record<string, number>
  lastTurnResult: AliasTurnResult | null
  usedWordIndices: number[]
  winnerId: string | null
}

export class AliasGame extends GameEngine {
  constructor(gameId: string) {
    super(gameId, 'alias', { maxPlayers: 16, minPlayers: 4 })
  }

  getInitialGameData(): AliasGameData {
    return {
      phase: 'team_assignment',
      teams: [
        { id: 'team-1', name: 'Team 1', playerIds: [], score: 0, describerIndex: 0 },
        { id: 'team-2', name: 'Team 2', playerIds: [], score: 0, describerIndex: 0 },
      ],
      currentTeamIndex: 0,
      turnsPerTeam: 3,
      skipPenalty: -1,
      currentCard: null,
      currentCardIndex: 0,
      currentCardResults: [],
      turnStartedAt: null,
      teamTurnCounts: { 'team-1': 0, 'team-2': 0 },
      lastTurnResult: null,
      usedWordIndices: [],
      winnerId: null,
    }
  }

  getGameRules(): string[] {
    return [
      'Two teams compete to describe words.',
      'Guessed word: +1 point. Skipped word: -1 point.',
      'Each turn: one describer, 10 words, 60 seconds.',
      '3 turns per team. Most points wins.',
    ]
  }

  addPlayer(player: Player): void {
    super.addPlayer(player)
    const data = this.state.data as AliasGameData
    const smaller = data.teams.reduce((a, b) =>
      a.playerIds.length <= b.playerIds.length ? a : b
    )
    smaller.playerIds.push(player.id)
  }

  startGame(): boolean {
    const data = this.state.data as AliasGameData
    const allTeamsValid = data.teams.every(t => t.playerIds.length >= 2)
    if (!allTeamsValid) return false
    if (!super.startGame()) return false
    const card = this._dealCard()
    data.currentCard = card
    data.currentCardIndex = 0
    data.currentCardResults = []
    data.turnStartedAt = Date.now()
    data.phase = 'turn_active'
    return true
  }

  canProcessMoveWhenNotPlaying(_move: Move): boolean {
    return false
  }

  checkWinCondition(): Player | null {
    // Win condition handled inline in processMove → _finishGame()
    return null
  }

  validateMove(move: Move): boolean {
    const data = this.state.data as AliasGameData
    switch (move.type) {
      case 'word_action': {
        if (data.phase !== 'turn_active') return false
        const currentTeam = data.teams[data.currentTeamIndex]
        const describerId = currentTeam.playerIds[currentTeam.describerIndex]
        if (move.playerId !== describerId) return false
        const { action } = move.payload as { action: string }
        if (action !== 'guess' && action !== 'skip') return false
        if (data.currentCardIndex >= (data.currentCard?.length ?? 0)) return false
        return true
      }
      case 'end_turn': {
        if (data.phase !== 'turn_active') return false
        const currentTeam = data.teams[data.currentTeamIndex]
        const describerId = currentTeam.playerIds[currentTeam.describerIndex]
        return move.playerId === describerId
      }
      case 'next_turn': {
        return data.phase === 'turn_results'
      }
      default:
        return false
    }
  }

  processMove(move: Move): void {
    const data = this.state.data as AliasGameData
    switch (move.type) {
      case 'word_action': {
        const { action } = move.payload as { action: 'guess' | 'skip' }
        const word = data.currentCard![data.currentCardIndex]
        data.currentCardResults.push({ word, result: action === 'guess' ? 'guessed' : 'skipped' })
        data.currentCardIndex++
        this.state.lastMoveAt = Date.now()
        if (data.currentCardIndex >= (data.currentCard?.length ?? 0)) {
          this._endTurn()
        }
        break
      }
      case 'end_turn': {
        this._endTurn()
        break
      }
      case 'next_turn': {
        data.currentTeamIndex = (data.currentTeamIndex + 1) % data.teams.length
        const allDone = data.teams.every(
          t => (data.teamTurnCounts[t.id] ?? 0) >= data.turnsPerTeam
        )
        if (allDone) {
          this._finishGame(data)
        } else {
          const card = this._dealCard()
          data.currentCard = card
          data.currentCardIndex = 0
          data.currentCardResults = []
          data.turnStartedAt = Date.now()
          data.phase = 'turn_active'
        }
        break
      }
    }
  }

  applyTimeoutFallback(turnTimerSeconds: number, nowMs: number = Date.now()): { changed: boolean } {
    const data = this.state.data as AliasGameData
    if (data.phase !== 'turn_active' || data.turnStartedAt === null) {
      return { changed: false }
    }
    const elapsed = nowMs - data.turnStartedAt
    if (elapsed < turnTimerSeconds * 1000) {
      return { changed: false }
    }
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

  private _dealCard(): string[] {
    const data = this.state.data as AliasGameData
    let available = ALIAS_WORDS.map((_, i) => i).filter(
      i => !data.usedWordIndices.includes(i)
    )
    if (available.length < 10) {
      data.usedWordIndices = []
      available = ALIAS_WORDS.map((_, i) => i)
    }
    const shuffled = [...available].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, 10)
    data.usedWordIndices.push(...selected)
    return selected.map(i => ALIAS_WORDS[i])
  }

  private _endTurn(): void {
    const data = this.state.data as AliasGameData
    const guessedCount = data.currentCardResults.filter(r => r.result === 'guessed').length
    const skippedCount = data.currentCardResults.filter(r => r.result === 'skipped').length
    const scoreDelta = guessedCount - skippedCount * Math.abs(data.skipPenalty)
    const currentTeam = data.teams[data.currentTeamIndex]
    currentTeam.score += scoreDelta
    const turnIndex = data.teamTurnCounts[currentTeam.id] ?? 0
    const describerId = currentTeam.playerIds[currentTeam.describerIndex]
    data.lastTurnResult = {
      teamId: currentTeam.id,
      describerId,
      wordResults: [...data.currentCardResults],
      scoreDelta,
      turnIndex,
    }
    currentTeam.describerIndex = (currentTeam.describerIndex + 1) % currentTeam.playerIds.length
    data.teamTurnCounts[currentTeam.id] = turnIndex + 1
    data.currentCard = null
    data.currentCardResults = []
    data.phase = 'turn_results'
  }

  private _finishGame(data: AliasGameData): void {
    const [team1, team2] = data.teams
    if (team1.score > team2.score) {
      data.winnerId = team1.id
    } else if (team2.score > team1.score) {
      data.winnerId = team2.id
    } else {
      data.winnerId = 'tie'
    }
    data.phase = 'game_over'
    this.state.status = 'finished'
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx jest __tests__/lib/games/alias-game.test.ts --no-coverage`

Expected: All tests PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run ci:quick`

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add lib/games/alias.ts __tests__/lib/games/alias-game.test.ts
git commit -m "feat(#302): implement AliasGame engine with tests"
```

---

### Task 4: Feature Flag, Registry, Catalog, Client Restore

**Files:**
- Modify: `lib/feature-flags.ts`
- Modify: `lib/game-registry.ts`
- Modify: `lib/game-catalog.ts`
- Modify: `lib/restore-game-engine-client.ts`

- [ ] **Step 1: Add feature flag**

In `lib/feature-flags.ts`, append after `isFakeArtistEnabled`:

```typescript
export function isAliasEnabled(): boolean {
  return (
    parseBooleanFlag(process.env.ENABLE_ALIAS) ||
    parseBooleanFlag(process.env.NEXT_PUBLIC_ENABLE_ALIAS)
  )
}
```

- [ ] **Step 2: Register alias in game-registry.ts**

In `lib/game-registry.ts`:

**2a.** Add import at top alongside other feature-flag imports:
```typescript
import { isAliasEnabled, ... } from './feature-flags'
```
(add `isAliasEnabled` to the existing destructured import)

**2b.** Add import for AliasGame alongside other game imports:
```typescript
import { AliasGame } from './games/alias'
```

**2c.** Add `'alias'` to `ExperimentalGameType`:
```typescript
export type ExperimentalGameType =
  | 'telephone_doodle'
  | 'sketch_and_guess'
  | 'liars_party'
  | 'fake_artist'
  | 'alias'
```

**2d.** Add entry constant after `FAKE_ARTIST_ENTRY`:
```typescript
const ALIAS_ENTRY: GameRegistryEntry = {
  metadata: {
    type: 'alias',
    name: 'Alias',
    icon: '🗣️',
    minPlayers: 4,
    maxPlayers: 16,
    supportsBots: false,
    translationKey: 'alias',
  },
  create: (id, cfg) =>
    new AliasGame(id),
}
```

**2e.** Add check in `getRegistryEntry` after the fake_artist block:
```typescript
if (gameType === 'alias' && isAliasEnabled()) {
  return ALIAS_ENTRY
}
```

**2f.** Add alias check to `getSupportedGameTypes()` in `game-registry.ts` (after the fake_artist block):
```typescript
if (isAliasEnabled()) {
  experimentalTypes.push('alias')
}
```

**2g.** Add alias to `isSupportedGameType()` in `game-registry.ts`:
```typescript
|| (value === 'alias' && isAliasEnabled())
```
Add this line inside the `return (...)` before the closing `)` of `isSupportedGameType`.

- [ ] **Step 3: Register alias in game-catalog.ts**

In `lib/game-catalog.ts`:

**3a.** Add import:
```typescript
import { isAliasEnabled, ... } from './feature-flags'
```
(add `isAliasEnabled` to the existing destructured import)

**3b.** Add `'alias'` to `ExperimentalGameType`:
```typescript
export type ExperimentalGameType =
  | 'telephone_doodle'
  | 'sketch_and_guess'
  | 'liars_party'
  | 'fake_artist'
  | 'alias'
```

**3c.** Add metadata constant after `FAKE_ARTIST_METADATA`:
```typescript
const ALIAS_METADATA: GameMetadata = {
  type: 'alias',
  name: 'Alias',
  icon: '🗣️',
  minPlayers: 4,
  maxPlayers: 16,
  supportsBots: false,
  translationKey: 'alias',
}
```

**3d.** Add to `isSupportedGameType`:
```typescript
(value === 'alias' && isAliasEnabled())
```

**3e.** Add to `getGameMetadata`:
```typescript
if (gameType === 'alias' && isAliasEnabled()) {
  return ALIAS_METADATA
}
```

- [ ] **Step 4: Add alias to client restore**

In `lib/restore-game-engine-client.ts`, add case before `default`:

```typescript
case 'alias': {
  const { AliasGame } = await import('./games/alias')
  return new AliasGame(gameId)
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run ci:quick`

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add lib/feature-flags.ts lib/game-registry.ts lib/game-catalog.ts lib/restore-game-engine-client.ts
git commit -m "feat(#302): register alias in game registry, catalog, and client restore"
```

---

### Task 5: Timeout Integration

**Files:**
- Modify: `app/api/lobby/[code]/route.ts`

- [ ] **Step 1: Add AliasGame import**

In `app/api/lobby/[code]/route.ts`, add import alongside the other game imports (lines 14–16):

```typescript
import { AliasGame } from '@/lib/games/alias'
```

- [ ] **Step 2: Add alias timeout block**

In `app/api/lobby/[code]/route.ts`, insert the following block **after** the fake_artist block (after the closing `}` of the fake_artist `if` block, before `const sanitizedActiveGame = ...`):

```typescript
    if (
      activeGame &&
      activeGame.status === 'playing' &&
      (safeLobby.gameType || activeGame.gameType) === 'alias'
    ) {
      const turnTimerSeconds = resolveTurnTimerSeconds(safeLobby.turnTimer)
      if (turnTimerSeconds > 0) {
        try {
          const parsedState = parsePersistedGameState<RestorableGameState>(activeGame.state)
          const aliasGame = new AliasGame(activeGame.id)
          aliasGame.restoreState(parsedState)

          const timeoutResult = aliasGame.applyTimeoutFallback(turnTimerSeconds)
          if (timeoutResult.changed) {
            const nextState = aliasGame.getState()
            const lastMoveAtDate = resolveLastMoveAtDate(nextState.lastMoveAt)

            const updateResult = await prisma.games.updateMany({
              where: {
                id: activeGame.id,
                updatedAt: activeGame.updatedAt,
              },
              data: {
                state: toPersistedGameStateInput(nextState),
                status: nextState.status,
                ...(lastMoveAtDate ? { lastMoveAt: lastMoveAtDate } : {}),
                updatedAt: new Date(),
              },
            })

            if (updateResult.count > 0) {
              const scoreUpdates: Array<Promise<unknown>> = []
              const statePlayers = Array.isArray(nextState.players) ? nextState.players : []
              type ActiveScorePlayer = { id: string; userId: string; score: number }

              const activePlayers: ActiveScorePlayer[] = (Array.isArray(activeGame.players) ? activeGame.players : [])
                .map((entry: Record<string, unknown>) => ({
                  id: typeof entry?.id === 'string' ? entry.id : '',
                  userId: typeof entry?.userId === 'string' ? entry.userId : '',
                  score: typeof entry?.score === 'number' && Number.isFinite(entry.score) ? entry.score : 0,
                }))
                .filter((entry: ActiveScorePlayer) => entry.id.length > 0 && entry.userId.length > 0)
              const activePlayersByUserId = new Map<string, ActiveScorePlayer>(
                activePlayers.map((entry: ActiveScorePlayer): [string, ActiveScorePlayer] => [entry.userId, entry])
              )

              for (const statePlayer of statePlayers) {
                if (!statePlayer || typeof statePlayer !== 'object') continue
                const statePlayerId = (statePlayer as { id?: unknown }).id
                if (typeof statePlayerId !== 'string') continue
                const dbPlayer = activePlayersByUserId.get(statePlayerId)
                if (!dbPlayer) continue
                const rawScore = (statePlayer as { score?: unknown }).score
                const nextScore =
                  typeof rawScore === 'number' && Number.isFinite(rawScore) ? Math.floor(rawScore) : 0
                if (dbPlayer.score === nextScore) continue
                scoreUpdates.push(
                  prisma.players.update({ where: { id: dbPlayer.id }, data: { score: nextScore } })
                )
                dbPlayer.score = nextScore
              }

              if (scoreUpdates.length > 0) {
                await Promise.all(scoreUpdates)
              }

              activeGame.state = JSON.stringify(nextState)
              activeGame.status = nextState.status
              if (lastMoveAtDate) {
                activeGame.lastMoveAt = lastMoveAtDate
              }

              await appendGameReplaySnapshot({
                gameId: activeGame.id,
                playerId: null,
                actionType: 'alias:timeout-fallback',
                actionPayload: { source: 'lobby-get' },
                state: nextState,
              })

              await notifySocket(`lobby:${safeLobby.code}`, 'game-update', {
                action: 'state-change',
                payload: { state: nextState },
              })
            }
          }
        } catch (error) {
          const log = apiLogger('GET /api/lobby/[code]')
          log.warn('Alias timeout fallback on lobby GET failed', {
            code,
            gameId: activeGame.id,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }
```

- [ ] **Step 3: Typecheck**

Run: `npm run ci:quick`

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add app/api/lobby/[code]/route.ts
git commit -m "feat(#302): add alias turn timeout fallback in lobby GET handler"
```

---

### Task 6: Translations

**Files:**
- Modify: `locales/en.ts`
- Modify: `locales/ru.ts`

- [ ] **Step 1: Add alias section to en.ts**

In `locales/en.ts`, add an `alias:` section after the `spy:` section (which starts around line 1406). Insert:

```typescript
  alias: {
    team1: 'Team 1',
    team2: 'Team 2',
    teamPreviewNote: 'Teams are assigned when the game starts',
    yourTurn: 'Your turn to describe!',
    guessed: 'Guessed!',
    skip: 'Skip',
    endTurn: 'End Turn',
    nextTurn: 'Next Turn',
    playAgain: 'Play Again',
    wins: '{{team}} wins!',
    tie: "It's a tie!",
    isDescribing: '{{name}} is describing...',
    wordsProgress: '{{current}}/{{total}} words',
    turnResults: 'Turn Results',
    scores: 'Scores',
    timeLeft: '{{seconds}}s',
  },
```

- [ ] **Step 2: Add alias section to ru.ts**

In `locales/ru.ts`, add the same `alias:` section in the corresponding location (after `spy:` section):

```typescript
  alias: {
    team1: 'Команда 1',
    team2: 'Команда 2',
    teamPreviewNote: 'Команды распределяются при старте игры',
    yourTurn: 'Ваша очередь объяснять!',
    guessed: 'Угадали!',
    skip: 'Пропустить',
    endTurn: 'Завершить ход',
    nextTurn: 'Следующий ход',
    playAgain: 'Играть ещё',
    wins: '{{team}} побеждает!',
    tie: 'Ничья!',
    isDescribing: '{{name}} объясняет...',
    wordsProgress: '{{current}}/{{total}} слов',
    turnResults: 'Итоги хода',
    scores: 'Счёт',
    timeLeft: '{{seconds}}с',
  },
```

- [ ] **Step 3: Typecheck**

Run: `npm run ci:quick`

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add locales/en.ts locales/ru.ts
git commit -m "feat(#302): add alias translations (EN + RU)"
```

---

### Task 7: AliasPage Component + Test

**Files:**
- Create: `app/lobby/[code]/alias-page.tsx`
- Create: `__tests__/app/alias-page.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/app/alias-page.test.tsx`:

```typescript
import { act, render, screen, waitFor } from '@testing-library/react'
import AliasLobbyPage from '@/app/lobby/[code]/alias-page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { io } from 'socket.io-client'
import { showToast } from '@/lib/i18n-toast'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockPrefetch = jest.fn()
const socketHandlers: Record<string, (payload?: any) => void> = {}
const mockSocket: any = {
  on: jest.fn((event: string, handler: (payload?: any) => void) => {
    socketHandlers[event] = handler
    return mockSocket
  }),
  off: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
  close: jest.fn(),
  connected: true,
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    prefetch: mockPrefetch,
  }),
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1' } },
    status: 'authenticated',
  }),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    guestToken: null,
    guestId: null,
    guestName: null,
  }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`
      return key
    },
  }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    error: jest.fn(),
    errorFrom: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
  },
}))

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

jest.mock('@/lib/socket-client-auth', () => ({
  resolveSocketClientAuth: jest.fn(),
}))

jest.mock('@/lib/socket-url', () => ({
  getBrowserSocketUrl: jest.fn(() => 'http://socket.test'),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('@/lib/lobby-create-metrics', () => ({
  finalizePendingLobbyCreateMetric: jest.fn(),
}))

jest.mock('@/lib/analytics', () => ({
  trackMoveSubmitApplied: jest.fn(),
}))

jest.mock('@/components/LoadingSpinner', () => ({
  __esModule: true,
  default: () => <div data-testid="loading-spinner" />,
}))

jest.mock('@/components/ReactionOverlay', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}))

function buildLobbyResponse() {
  return {
    lobby: {
      id: 'lobby-1',
      code: 'ABCD',
      gameType: 'alias',
      creatorId: 'user-1',
      name: 'Test Lobby',
      isActive: true,
      turnTimer: 60,
    },
    activeGame: {
      id: 'game-1',
      status: 'waiting',
      state: {
        status: 'waiting',
        currentPlayerIndex: 0,
        players: [],
        data: {
          phase: 'team_assignment',
          teams: [
            { id: 'team-1', name: 'Team 1', playerIds: [], score: 0, describerIndex: 0 },
            { id: 'team-2', name: 'Team 2', playerIds: [], score: 0, describerIndex: 0 },
          ],
          currentTeamIndex: 0,
          turnsPerTeam: 3,
          skipPenalty: -1,
          currentCard: null,
          currentCardIndex: 0,
          currentCardResults: [],
          turnStartedAt: null,
          teamTurnCounts: { 'team-1': 0, 'team-2': 0 },
          lastTurnResult: null,
          usedWordIndices: [],
          winnerId: null,
        },
      },
      players: [
        { id: 'player-1', userId: 'user-1', name: 'Alice', user: { username: 'Alice' } },
        { id: 'player-2', userId: 'user-2', name: 'Bob', user: { username: 'Bob' } },
        { id: 'player-3', userId: 'user-3', name: 'Carol', user: { username: 'Carol' } },
        { id: 'player-4', userId: 'user-4', name: 'Dave', user: { username: 'Dave' } },
      ],
    },
  }
}

describe('AliasLobbyPage', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  const mockResolveSocketClientAuth = resolveSocketClientAuth as jest.MockedFunction<typeof resolveSocketClientAuth>
  const mockIo = io as jest.MockedFunction<typeof io>
  const toast = showToast as jest.Mocked<typeof showToast>

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(socketHandlers).forEach((key) => delete socketHandlers[key])
    mockResolveSocketClientAuth.mockResolvedValue({
      authPayload: { userId: 'user-1' },
      queryPayload: {},
    })
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => buildLobbyResponse(),
    } as Response)
  })

  it('renders the waiting room team assignment screen', async () => {
    render(<AliasLobbyPage code="ABCD" />)
    await waitFor(() => expect(mockIo).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('alias-waiting-room')).toBeTruthy())
  })

  it('redirects away when the socket reports an abandoned game', async () => {
    render(<AliasLobbyPage code="ABCD" />)
    await waitFor(() => expect(mockIo).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('alias-waiting-room')).toBeTruthy())

    act(() => {
      socketHandlers['game-abandoned']?.({ gameId: 'game-1', reason: 'insufficient_players' })
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'lobby.gameAbandoned',
        undefined,
        undefined,
        { id: 'alias-lifecycle-redirect' }
      )
      expect(mockReplace).toHaveBeenCalledWith('/games')
    })
  })

  it('redirects when a player leaves and remaining players drop below minimum', async () => {
    render(<AliasLobbyPage code="ABCD" />)
    await waitFor(() => expect(mockIo).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('alias-waiting-room')).toBeTruthy())

    act(() => {
      socketHandlers['player-left']?.({ userId: 'user-4', username: 'Dave', remainingPlayers: 3 })
    })

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('toast.playerLeft', undefined, { player: 'Dave' })
      expect(mockReplace).toHaveBeenCalledWith('/games')
    })
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest __tests__/app/alias-page.test.tsx --no-coverage`

Expected: FAIL — `Cannot find module '@/app/lobby/[code]/alias-page'`

- [ ] **Step 3: Create AliasPage**

Create `app/lobby/[code]/alias-page.tsx`:

```tsx
'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io, type Socket } from 'socket.io-client'
import { useTranslation } from 'react-i18next'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { trackMoveSubmitApplied } from '@/lib/analytics'
import LoadingSpinner from '@/components/LoadingSpinner'
import ReactionOverlay from '@/components/ReactionOverlay'
import { AliasGame, type AliasGameData, type AliasTeam, type AliasWordResult, type AliasTurnResult } from '@/lib/games/alias'
import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'

interface AliasPageProps {
  code: string
}

interface Lobby {
  id: string
  code: string
  gameType: string
  creatorId: string
  name: string
  isActive?: boolean
  turnTimer?: number
}

interface GamePlayer {
  id: string
  userId: string
  name: string
  user?: { username?: string }
}

interface Game {
  id: string
  status: string
  state: unknown
  players: GamePlayer[]
}

function computePreviewTeams(players: GamePlayer[]): { team1: GamePlayer[]; team2: GamePlayer[] } {
  const team1: GamePlayer[] = []
  const team2: GamePlayer[] = []
  players.forEach((p, i) => {
    if (i % 2 === 0) team1.push(p)
    else team2.push(p)
  })
  return { team1, team2 }
}

export default function AliasPage({ code }: AliasPageProps) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { isGuest, guestToken, guestId } = useGuest()
  const { t } = useTranslation()

  const [loading, setLoading] = useState(true)
  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [gameEngine, setGameEngine] = useState<AliasGame | null>(null)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isMoveSubmitting, setIsMoveSubmitting] = useState(false)

  const lifecycleRedirectInFlightRef = React.useRef(false)
  const activeGameIdRef = React.useRef<string | null>(null)
  const minPlayersRequired = getLobbyPlayerRequirements('alias').minPlayersRequired

  const getCurrentUserId = useCallback(() => {
    return isGuest ? guestId : session?.user?.id
  }, [isGuest, guestId, session?.user?.id])

  const triggerLifecycleRedirect = useCallback((toastId: string) => {
    if (lifecycleRedirectInFlightRef.current) return
    lifecycleRedirectInFlightRef.current = true
    showToast.error('lobby.gameAbandoned', undefined, undefined, { id: toastId })
    router.replace('/games')
  }, [router])

  const applyAuthoritativeState = useCallback((gameId: string, authoritativeState: unknown) => {
    if (!authoritativeState || typeof authoritativeState !== 'object') return
    const fresh = new AliasGame(gameId)
    fresh.restoreState(authoritativeState as any)
    setGameEngine(fresh)
    setGame(prev => {
      if (!prev || prev.id !== gameId) return prev
      return { ...prev, status: fresh.getState().status, state: authoritativeState }
    })
  }, [])

  const loadLobby = useCallback(async () => {
    try {
      const res = await fetchWithGuest(`/api/lobby/${code}?includeFinished=true`)
      const data = await res.json()

      if (!res.ok) {
        clientLogger.error('AliasPage: failed to load lobby', data.error)
        showToast.error('errors.failedToLoad')
        router.push('/games')
        return
      }

      const { lobby: lobbyData, activeGame } = data as { lobby: Lobby; activeGame: Game | null }

      if (!lobbyData) {
        router.push('/games')
        return
      }

      setLobby(lobbyData)
      setGame(activeGame ?? null)
      if (typeof lobbyData.code === 'string') {
        finalizePendingLobbyCreateMetric({ lobbyCode: lobbyData.code, fallbackGameType: lobbyData.gameType })
      }

      if (activeGame?.state) {
        const parsedState = typeof activeGame.state === 'string'
          ? JSON.parse(activeGame.state || '{}')
          : activeGame.state
        if (parsedState && typeof parsedState === 'object') {
          const fresh = new AliasGame(activeGame.id)
          fresh.restoreState(parsedState)
          setGameEngine(fresh)
        }
      }

      setLoading(false)
    } catch (err) {
      clientLogger.error('AliasPage: loadLobby error', err)
      showToast.errorFrom(err, 'errors.failedToLoad')
      setLoading(false)
    }
  }, [code, router])

  useEffect(() => {
    activeGameIdRef.current = game?.id ?? null
  }, [game?.id])

  useEffect(() => {
    if (status === 'loading' || (status === 'unauthenticated' && !isGuest)) return
    if (isGuest && !guestToken) return

    let isMounted = true
    let activeSocket: Socket | null = null

    void loadLobby()

    const initSocket = async () => {
      const url = getBrowserSocketUrl()
      const useGuestAuth = isGuest && status !== 'authenticated'
      const socketAuth = await resolveSocketClientAuth({
        isGuest: useGuestAuth,
        guestToken: useGuestAuth ? guestToken : null,
      })

      if (!socketAuth || !isMounted) return

      const newSocket = io(url, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        auth: socketAuth.authPayload,
        query: socketAuth.queryPayload,
      })
      activeSocket = newSocket

      newSocket.on('connect', () => {
        clientLogger.log('✅ Alias socket connected')
        newSocket.emit('join-lobby', code)
      })

      newSocket.on('game-update', (payload: Record<string, unknown>) => {
        const activeGameId = activeGameIdRef.current
        if (payload?.action === 'state-change' && activeGameId) {
          const state = (payload?.payload as Record<string, unknown>)?.state
          if (state) {
            applyAuthoritativeState(activeGameId, state)
            return
          }
        }
        void loadLobby()
      })

      newSocket.on('game-abandoned', (payload: { gameId: string; reason?: string }) => {
        clientLogger.log('📡 Alias game abandoned', payload)
        void loadLobby()
        triggerLifecycleRedirect('alias-lifecycle-redirect')
      })

      newSocket.on('player-left', (payload: { userId: string; username?: string; remainingPlayers?: number }) => {
        clientLogger.log('📡 Alias player left', payload)
        const name = payload.username
        if (name) showToast.info('toast.playerLeft', undefined, { player: name })
        if (typeof payload.remainingPlayers === 'number' && payload.remainingPlayers < minPlayersRequired) {
          triggerLifecycleRedirect('alias-lifecycle-redirect')
          return
        }
        void loadLobby()
      })

      newSocket.on('lobby-update', () => void loadLobby())
      newSocket.on('player-joined', () => void loadLobby())

      newSocket.on('disconnect', () => {
        clientLogger.log('❌ Alias socket disconnected')
      })

      setSocket(newSocket)
    }

    void initSocket()

    return () => {
      isMounted = false
      if (activeSocket?.connected) {
        activeSocket.emit('leave-lobby', code)
        activeSocket.disconnect()
      } else {
        activeSocket?.close()
      }
    }
  }, [status, isGuest, guestToken, code, loadLobby, applyAuthoritativeState, triggerLifecycleRedirect, minPlayersRequired])

  const handleMove = useCallback(async (type: string, payload: Record<string, unknown>) => {
    if (!game || isMoveSubmitting) return
    const userId = getCurrentUserId()
    if (!userId) return

    const move = { type, playerId: userId, payload, timestamp: Date.now() }

    // Optimistic update
    if (gameEngine) {
      const optimistic = new AliasGame(game.id)
      optimistic.restoreState(gameEngine.getState())
      if (optimistic.validateMove(move)) {
        optimistic.processMove(move)
        setGameEngine(optimistic)
      }
    }

    setIsMoveSubmitting(true)
    try {
      const res = await fetchWithGuest(`/api/game/${game.id}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, move, userId }),
      })

      trackMoveSubmitApplied({ gameType: 'alias', moveType: type, durationMs: 0, isGuest, success: res.ok, applied: res.ok, statusCode: res.status, source: 'alias_page' })

      if (res.ok) {
        const result = await res.json()
        const authoritativeState = result?.game?.state
        if (authoritativeState) {
          applyAuthoritativeState(game.id, authoritativeState)
        }
      } else {
        clientLogger.error('Alias move failed', { type })
        await loadLobby()
      }
    } catch (err) {
      clientLogger.error('Alias handleMove error', err)
      await loadLobby()
    } finally {
      setIsMoveSubmitting(false)
    }
  }, [game, gameEngine, getCurrentUserId, isGuest, isMoveSubmitting, applyAuthoritativeState, loadLobby])

  const handleStartGame = useCallback(async () => {
    if (!lobby?.id || isStarting) return
    setIsStarting(true)
    try {
      const res = await fetchWithGuest('/api/game/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameType: 'alias',
          lobbyId: lobby.id,
          config: { maxPlayers: 16, minPlayers: 4 },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast.error('toast.gameStartFailed', (err as Record<string, unknown>)?.error as string | undefined)
      }
    } catch (err) {
      showToast.errorFrom(err, 'toast.gameStartFailed')
    } finally {
      setIsStarting(false)
    }
  }, [lobby?.id, isStarting])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  const resolvedStatus = game?.status ?? 'waiting'
  const data = gameEngine?.getState()?.data as AliasGameData | undefined
  const isHost = lobby?.creatorId === getCurrentUserId()
  const players = game?.players ?? []

  // Waiting room — client-side team preview
  if (resolvedStatus === 'waiting' || !data || data.phase === 'team_assignment') {
    const { team1, team2 } = computePreviewTeams(players)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4" data-testid="alias-waiting-room">
        <h1 className="text-3xl font-bold">{t('games.alias.name')}</h1>
        <div className="flex gap-8">
          <div className="flex min-w-[120px] flex-col gap-2 rounded-xl border p-4">
            <h2 className="text-center font-semibold">{t('alias.team1')}</h2>
            {team1.map(p => <div key={p.id} className="text-center text-sm">{p.name}</div>)}
          </div>
          <div className="flex min-w-[120px] flex-col gap-2 rounded-xl border p-4">
            <h2 className="text-center font-semibold">{t('alias.team2')}</h2>
            {team2.map(p => <div key={p.id} className="text-center text-sm">{p.name}</div>)}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{t('alias.teamPreviewNote')}</p>
        {isHost && (
          <button
            onClick={handleStartGame}
            disabled={isStarting || players.length < 4}
            className="rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {isStarting ? t('common.loading') : t('lobby.startGame')}
          </button>
        )}
        {!isHost && <p className="text-sm text-muted-foreground">{t('lobby.waitingForHost')}</p>}
        <button onClick={() => router.push('/games')} className="text-sm text-muted-foreground underline">
          {t('lobby.leave')}
        </button>
      </div>
    )
  }

  if (data.phase === 'turn_active') {
    const currentTeam = data.teams[data.currentTeamIndex]
    const describerId = currentTeam.playerIds[currentTeam.describerIndex]
    const isDescriber = describerId === getCurrentUserId()
    const turnTimerSeconds = typeof lobby?.turnTimer === 'number' ? lobby.turnTimer : 60
    const elapsed = data.turnStartedAt ? Math.floor((Date.now() - data.turnStartedAt) / 1000) : 0
    const remaining = Math.max(0, turnTimerSeconds - elapsed)
    const guessed = data.currentCardResults.filter(r => r.result === 'guessed').length
    const skipped = data.currentCardResults.filter(r => r.result === 'skipped').length

    if (isDescriber) {
      return (
        <>
          {socket && <ReactionOverlay socket={socket} lobbyCode={code} />}
          <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4" data-testid="alias-describer-screen">
            <div className="text-sm text-muted-foreground">{t('alias.wordsProgress', { current: data.currentCardIndex, total: 10 })}</div>
            <div className="text-5xl font-bold">{data.currentCard?.[data.currentCardIndex] ?? ''}</div>
            <div className="text-sm">+{guessed} / -{skipped}</div>
            <div className="text-2xl font-mono font-bold">{t('alias.timeLeft', { seconds: remaining })}</div>
            <div className="flex gap-4">
              <button
                onClick={() => handleMove('word_action', { action: 'guess' })}
                disabled={isMoveSubmitting}
                className="rounded-lg bg-green-600 px-6 py-3 font-semibold text-white disabled:opacity-50"
              >
                {t('alias.guessed')}
              </button>
              <button
                onClick={() => handleMove('word_action', { action: 'skip' })}
                disabled={isMoveSubmitting}
                className="rounded-lg bg-yellow-500 px-6 py-3 font-semibold text-white disabled:opacity-50"
              >
                {t('alias.skip')}
              </button>
            </div>
            <button onClick={() => handleMove('end_turn', {})} className="text-sm text-muted-foreground underline">
              {t('alias.endTurn')}
            </button>
          </div>
        </>
      )
    }

    const describerPlayer = players.find(p => p.userId === describerId)
    return (
      <>
        {socket && <ReactionOverlay socket={socket} lobbyCode={code} />}
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4" data-testid="alias-guesser-screen">
          <div className="text-xl font-semibold">{currentTeam.name}</div>
          <div className="text-muted-foreground">{t('alias.isDescribing', { name: describerPlayer?.name ?? describerId })}</div>
          <div className="text-2xl font-mono font-bold">{t('alias.timeLeft', { seconds: remaining })}</div>
          <div className="text-sm">+{guessed} / -{skipped}</div>
          <div className="text-sm text-muted-foreground">{t('alias.wordsProgress', { current: guessed + skipped, total: 10 })}</div>
        </div>
      </>
    )
  }

  if (data.phase === 'turn_results' && data.lastTurnResult) {
    const result = data.lastTurnResult
    return (
      <>
        {socket && <ReactionOverlay socket={socket} lobbyCode={code} />}
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4" data-testid="alias-turn-results-screen">
          <h2 className="text-2xl font-bold">{t('alias.turnResults')}</h2>
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {result.wordResults.map((r, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span>{r.result === 'guessed' ? '✓' : '✗'}</span>
                <span>{r.word}</span>
              </div>
            ))}
          </div>
          <div className="text-lg font-semibold">
            {result.scoreDelta >= 0 ? `+${result.scoreDelta}` : result.scoreDelta}
          </div>
          <div className="flex gap-8">
            {data.teams.map(team => (
              <div key={team.id} className="text-center">
                <div className="font-semibold">{team.name}</div>
                <div className="text-3xl font-bold">{team.score}</div>
              </div>
            ))}
          </div>
          {isHost ? (
            <button
              onClick={() => handleMove('next_turn', {})}
              disabled={isMoveSubmitting}
              className="rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground disabled:opacity-50"
            >
              {t('alias.nextTurn')}
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">{t('lobby.waitingForHost')}</p>
          )}
        </div>
      </>
    )
  }

  if (data.phase === 'game_over') {
    const winner = data.teams.find(t => t.id === data.winnerId)
    const winMessage = data.winnerId === 'tie'
      ? t('alias.tie')
      : t('alias.wins', { team: winner?.name ?? '' })
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4" data-testid="alias-game-over-screen">
        <h2 className="text-4xl font-bold">{winMessage}</h2>
        <div className="flex gap-8">
          {data.teams.map(team => (
            <div key={team.id} className="text-center">
              <div className="font-semibold">{team.name}</div>
              <div className="text-3xl font-bold">{team.score}</div>
            </div>
          ))}
        </div>
        <button
          onClick={handleStartGame}
          disabled={isStarting}
          className="rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {isStarting ? t('common.loading') : t('alias.playAgain')}
        </button>
        <button onClick={() => router.push('/games')} className="text-sm text-muted-foreground underline">
          {t('lobby.leave')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingSpinner />
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx jest __tests__/app/alias-page.test.tsx --no-coverage`

Expected: All 3 tests PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run ci:quick`

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add app/lobby/[code]/alias-page.tsx __tests__/app/alias-page.test.tsx
git commit -m "feat(#302): add AliasPage component with waiting room, game screens, and tests"
```

---

### Task 8: LobbyPageClient Routing

**Files:**
- Modify: `app/lobby/[code]/LobbyPageClient.tsx`

- [ ] **Step 1: Add dynamic import**

In `app/lobby/[code]/LobbyPageClient.tsx`, find the section where `RockPaperScissorsLobbyPage` (or similar) is dynamically imported. It looks like:

```typescript
const RockPaperScissorsLobbyPage = dynamic(
  () => import('./rock-paper-scissors-page'),
  { loading: () => <CenteredLoadingFallback /> }
)
```

Add the alias dynamic import immediately after:

```typescript
const AliasLobbyPage = dynamic(
  () => import('./alias-page'),
  { loading: () => <CenteredLoadingFallback /> }
)
```

- [ ] **Step 2: Add routing condition**

In `LobbyPageClient.tsx`, find the routing conditions block (near the existing `if (gameType === 'rock_paper_scissors')` block). Add after the RPS route:

```typescript
if (gameType === 'alias') {
  return <AliasLobbyPage code={code} />
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run ci:quick`

Expected: exits 0.

- [ ] **Step 4: Run all tests**

Run: `npm test -- --no-coverage`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/lobby/[code]/LobbyPageClient.tsx
git commit -m "feat(#302): route alias game type to AliasPage in LobbyPageClient"
```

---

### Task 9: Games Hub Pages

**Files:**
- Create: `app/games/alias/page.tsx`
- Create: `app/games/alias/lobbies/page.tsx`
- Modify: `app/games/page.tsx`

- [ ] **Step 1: Create alias info page**

Create `app/games/alias/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Play Alias Online Free - Word Description Team Game',
  description:
    'Play Alias online with friends for free! 4–16 players, real-time word guessing. Describe words to your team against the clock — no download needed. Start on Boardly now!',
  keywords: [
    'alias game online',
    'alias word game',
    'word description game online',
    'team word game online free',
    'describe words game',
    'alias party game online',
    'online word guessing game',
    'alias browser game',
  ],
  openGraph: {
    title: 'Play Alias Online Free - Team Word Game | Boardly',
    description:
      'Describe words to your team without saying the word itself. Race against the clock, earn points, and outlast the other team. Free, 4–16 players.',
    url: 'https://www.boardly.online/games/alias',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Alias Online Free | Boardly',
    description: 'Real-time team word game in your browser. Describe, guess, and score. Free, no download.',
  },
  alternates: {
    canonical: 'https://www.boardly.online/games/alias',
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Games', item: 'https://www.boardly.online/games' },
    { '@type': 'ListItem', position: 3, name: 'Alias', item: 'https://www.boardly.online/games/alias' },
  ],
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'Alias',
  description:
    'Team word description game where players describe words to their teammates without saying the word itself, racing against a timer to score points.',
  url: 'https://www.boardly.online/games/alias',
  image: 'https://www.boardly.online/opengraph-image',
  genre: ['Party Game', 'Word Game', 'Multiplayer', 'Team Game'],
  numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 4, maxValue: 16 },
  playMode: 'MultiPlayer',
  applicationCategory: 'Game',
  operatingSystem: 'Any (Browser)',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://www.boardly.online' },
}

export default function AliasGamePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <div className="min-h-screen bg-gradient-to-br from-orange-400 via-red-500 to-pink-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

          <nav className="mb-8 text-white/60 text-sm flex items-center gap-2" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/games" className="hover:text-white transition-colors">Games</Link>
            <span>/</span>
            <span className="text-white">Alias</span>
          </nav>

          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm mb-6">
              <span className="text-6xl" role="img" aria-label="Alias">🗣️</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4 drop-shadow-lg">
              Play Alias Online
            </h1>
            <p className="text-xl text-white/90 max-w-2xl mx-auto mb-8">
              Two teams, one goal: describe as many words as possible before the timer runs out.
              Guessing earns points — skipping costs them. Best team wins. Free for 4–16 players.
            </p>
            <Link
              href="/lobby/create?gameType=alias"
              className="inline-block px-10 py-4 bg-white text-orange-600 rounded-2xl font-bold text-lg hover:bg-orange-50 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105"
            >
              Play Alias Now →
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
            {[
              { label: 'Players', value: '4–16' },
              { label: 'Price', value: 'Free' },
              { label: 'Download', value: 'None' },
              { label: 'Game type', value: 'Team' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/10 backdrop-blur-md rounded-2xl p-5 text-center text-white">
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-white/70 text-sm mt-1">{label}</div>
              </div>
            ))}
          </div>

          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-3xl font-bold mb-4">What is Alias?</h2>
            <p className="text-white/85 leading-relaxed mb-4">
              Alias is a classic team word-description game. Players split into two teams. Each turn,
              one player — the describer — gets 10 secret words and must explain them to their teammates
              without using the word itself. Every correct guess earns a point; every skip loses one.
            </p>
            <p className="text-white/85 leading-relaxed">
              Teams alternate turns for 3 rounds each. The team with the most points at the end wins.
              Fast, fun, and works great with any group.
            </p>
          </section>

          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-3xl font-bold mb-6">How to Play Alias Online</h2>
            <ol className="space-y-4">
              {[
                { step: '1', title: 'Create a lobby', desc: 'Start a game and invite 4–16 friends with a room code or link. Teams are assigned automatically.' },
                { step: '2', title: 'Describe words', desc: 'The describer sees 10 words one at a time. Explain each word without saying it — use synonyms, actions, or examples.' },
                { step: '3', title: 'Guess or skip', desc: 'Teammates shout the answer. Correct guess: +1 point. Skip: −1 point. You have 60 seconds.' },
                { step: '4', title: 'Switch teams', desc: 'Teams alternate turns. After 3 turns each, the team with more points wins!' },
              ].map(({ step, title, desc }) => (
                <li key={step} className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">{step}</span>
                  <div>
                    <strong className="block">{title}</strong>
                    <span className="text-white/75 text-sm">{desc}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-12 text-white">
            <h2 className="text-3xl font-bold mb-6">Why Play Alias on Boardly?</h2>
            <ul className="space-y-3">
              {[
                '⚡ Real-time gameplay — live updates as words are guessed',
                '👥 Supports 4–16 players — scales for any group size',
                '⏱️ Server-authoritative timer — fair for everyone',
                '📱 Play from any device — no app install needed',
                '🆓 Completely free — no account required for guests',
              ].map((item) => (
                <li key={item} className="text-white/85 text-sm leading-relaxed">{item}</li>
              ))}
            </ul>
          </section>

          <div className="text-center">
            <Link
              href="/lobby/create?gameType=alias"
              className="inline-block px-10 py-4 bg-white text-orange-600 rounded-2xl font-bold text-lg hover:bg-orange-50 transition-all duration-300 shadow-xl hover:scale-105"
            >
              Start an Alias Game →
            </Link>
            <p className="text-white/60 text-sm mt-4">No account required to play as a guest</p>
          </div>

        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Create alias lobbies page**

Create `app/games/alias/lobbies/page.tsx`:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io, type Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { clientLogger } from '@/lib/client-logger'
import { useTranslation } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

let socket: Socket | null = null

interface Lobby {
  id: string
  code: string
  name: string
  maxPlayers: number
  gameType: string
  creator: { username: string | null; email: string | null }
  games: { id: string; status: string; _count: { players: number } }[]
}

export default function AliasLobbiesPage() {
  const router = useRouter()
  const { status } = useSession()
  const { isGuest, guestToken } = useGuest()
  const { t } = useTranslation()
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const isAuthenticated = status === 'authenticated' || isGuest

  const loadLobbies = useCallback(async () => {
    try {
      const res = await fetchWithGuest('/api/lobby?gameType=alias')
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      const data = await res.json()
      if (data.error) clientLogger.warn('Alias lobbies loaded with error:', data.error)
      setLobbies(data.lobbies || [])
    } catch (error) {
      clientLogger.error('Failed to load Alias lobbies:', error)
      showToast.error('errors.failedToLoad')
      setLobbies([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated' && !isGuest) { setLoading(false); return }
    if (isGuest && !guestToken) return
    if (status === 'authenticated' || isGuest) {
      loadLobbies()
      let isMounted = true
      const refreshInterval = setInterval(() => loadLobbies(), 5000)
      const initSocket = async () => {
        if (socket) return
        const url = getBrowserSocketUrl()
        const useGuestAuth = isGuest && status !== 'authenticated'
        const socketAuth = await resolveSocketClientAuth({
          isGuest: useGuestAuth,
          guestToken: useGuestAuth ? guestToken : null,
        })
        if (!socketAuth || !isMounted) return
        socket = io(url, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          auth: socketAuth.authPayload,
          query: socketAuth.queryPayload,
        })
        socket.on('connect', () => { socket?.emit('join-lobby-list') })
        socket.on('lobby-list-update', () => loadLobbies())
        socket.on('disconnect', () => { clientLogger.log('❌ Alias lobby list socket disconnected') })
      }
      void initSocket()
      return () => {
        isMounted = false
        clearInterval(refreshInterval)
        if (socket?.connected) { socket.emit('leave-lobby-list'); socket.disconnect() }
        socket = null
      }
    }
  }, [status, isGuest, guestToken, loadLobbies])

  const handleJoinByCode = () => {
    if (!isAuthenticated) { router.push('/'); return }
    if (joinCode) router.push(`/lobby/${joinCode.toUpperCase()}`)
  }

  if (status === 'loading' || loading) {
    return (
      <div className="page-shell flex items-center justify-center">
        <p className="text-xl">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="page-shell bg-gradient-to-br from-orange-400 via-red-500 to-pink-600">
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <div className="mb-4 sm:mb-6 flex items-center gap-1.5 sm:gap-2 text-white/80 text-xs sm:text-sm overflow-x-auto">
            <button onClick={() => router.push('/')} className="hover:text-white transition-colors whitespace-nowrap">
              🏠 <span className="hidden xs:inline">{t('breadcrumbs.home')}</span>
            </button>
            <span>›</span>
            <button onClick={() => router.push('/games')} className="hover:text-white transition-colors whitespace-nowrap">
              🎮 <span className="hidden xs:inline">{t('breadcrumbs.games')}</span>
            </button>
            <span>›</span>
            <span className="text-white font-semibold whitespace-nowrap">🗣️ <span className="hidden xs:inline">{t('games.alias.name')}</span></span>
          </div>

          <div className="mb-4 sm:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg">
                🗣️ {t('games.alias.name')} {t('lobby.openLobbies')}
              </h1>
              <p className="text-white/80 mt-1 text-sm">{t('games.alias.description')}</p>
            </div>
            {isAuthenticated && (
              <button
                onClick={() => router.push('/lobby/create?gameType=alias')}
                className="shrink-0 rounded-xl bg-white px-5 py-2.5 font-semibold text-orange-600 shadow-lg hover:bg-orange-50 transition-colors"
              >
                + {t('lobby.createNew')}
              </button>
            )}
          </div>

          <div className="mb-6 flex gap-2">
            <input
              type="text"
              placeholder={t('lobby.enterCode')}
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoinByCode()}
              maxLength={8}
              className="flex-1 rounded-xl border border-white/30 bg-white/20 px-4 py-2.5 text-white placeholder-white/60 backdrop-blur-sm focus:border-white/60 focus:outline-none"
            />
            <button
              onClick={handleJoinByCode}
              disabled={!joinCode}
              className="rounded-xl bg-white px-5 py-2.5 font-semibold text-orange-600 shadow hover:bg-orange-50 disabled:opacity-50 transition-colors"
            >
              {t('lobby.join')}
            </button>
          </div>

          {lobbies.length === 0 ? (
            <div className="rounded-2xl bg-white/10 p-12 text-center text-white backdrop-blur-md">
              <div className="text-5xl mb-4">🗣️</div>
              <p className="text-xl font-semibold mb-2">{t('lobby.noOpenLobbies')}</p>
              <p className="text-white/70 text-sm mb-6">{t('lobby.beTheFirst')}</p>
              {isAuthenticated && (
                <button
                  onClick={() => router.push('/lobby/create?gameType=alias')}
                  className="rounded-xl bg-white px-6 py-3 font-semibold text-orange-600 hover:bg-orange-50 transition-colors"
                >
                  {t('lobby.createNew')}
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lobbies.map(lobby => {
                const activeGame = lobby.games?.[0]
                const playerCount = activeGame?._count?.players ?? 0
                return (
                  <button
                    key={lobby.id}
                    onClick={() => router.push(`/lobby/${lobby.code}`)}
                    className="rounded-2xl bg-white/10 p-5 text-left backdrop-blur-md hover:bg-white/20 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span className="font-bold text-white text-lg truncate">{lobby.name}</span>
                      <span className="ml-2 shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-xs text-white/80">
                        {playerCount}/{lobby.maxPlayers}
                      </span>
                    </div>
                    <div className="text-white/60 text-sm">
                      {t('lobby.hostedBy', { host: lobby.creator?.username || 'Anonymous' })}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="rounded-full bg-green-400/30 px-2 py-0.5 text-xs text-green-200">
                        {t('lobby.open')}
                      </span>
                      <span className="font-mono text-white/50 text-xs">{lobby.code}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update games/page.tsx**

In `app/games/page.tsx`, find the alias entry:

```typescript
{
  id: 'alias',
  nameKey: 'games.alias.name',
  emoji: '🗣️',
  descriptionKey: 'games.alias.description',
  players: '4-16',
  difficultyKey: 'games.alias.difficulty',
  status: 'coming-soon',
  color: 'from-orange-400 to-red-500'
},
```

Change `status` to `'available'` and add `route`:

```typescript
{
  id: 'alias',
  nameKey: 'games.alias.name',
  emoji: '🗣️',
  descriptionKey: 'games.alias.description',
  players: '4-16',
  difficultyKey: 'games.alias.difficulty',
  status: 'available',
  route: '/games/alias/lobbies',
  color: 'from-orange-400 to-red-500'
},
```

- [ ] **Step 4: Typecheck**

Run: `npm run ci:quick`

Expected: exits 0.

- [ ] **Step 5: Run all tests**

Run: `npm test -- --no-coverage`

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/games/alias/ app/games/page.tsx
git commit -m "feat(#302): add alias games hub pages (info page, lobbies list, enable on games page)"
```

---

## Final verification

- [ ] Run `npm run ready:build-test` (full pre-PR gate)
- [ ] Set `ENABLE_ALIAS=true` in `.env.local`, start dev servers, create an alias lobby, play through a full game manually
- [ ] Verify: team preview shows in waiting room → start game → describer screen renders with word → guess/skip works → turn results show → next turn works → game over shows winner
