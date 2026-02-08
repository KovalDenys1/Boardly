# Bot System - Developer Guide

## Architecture Overview

The bot system is designed to be **modular and game-agnostic**. Each game can have its own bot implementation by extending the `BaseBot` abstract class.

```text
lib/bots/
├── core/                         # Universal bot infrastructure
│   ├── base-bot.ts              # Abstract base class
│   ├── bot-types.ts             # Shared types and interfaces
│   ├── bot-executor.ts          # Universal bot turn executor
│   ├── bot-factory.ts           # Factory for creating bot instances
│   └── bot-helpers.ts           # Utility functions (isBot, getBotDifficulty)
├── yahtzee/                     # Yahtzee-specific bots
│   ├── yahtzee-bot.ts          # YahtzeeBot (extends BaseBot)
│   ├── yahtzee-bot-ai.ts       # Pure AI decision logic
│   └── yahtzee-bot-executor.ts # Turn execution with visual feedback
├── spy/                         # Future: Guess the Spy bots
├── uno/                         # Future: Uno bots
└── index.ts                     # Barrel exports
```

## Key Concepts

### 1. BaseBot Abstract Class

All game bots extend `BaseBot<TGameEngine, TDecision>`:

```typescript
export abstract class BaseBot<
    TGameEngine extends GameEngine = GameEngine,
    TDecision = unknown
> {
    // Must implement:
    abstract makeDecision(): Promise<TDecision>
    abstract decisionToMove(decision: TDecision): Move
    abstract evaluateState(): string

    // Provided utilities:
    protected delay(ms: number): Promise<void>
    protected log(message: string, data?: any): void
    protected isBotTurn(): boolean
    protected getBotPlayer(botUserId: string): Player | undefined
}
```

### 2. Bot Factory

Use `createBot()` to instantiate game-specific bots:

```typescript
import { createBot } from '@/lib/bots'

const bot = createBot('yahtzee', gameEngine, 'medium')
await bot.makeDecision()
```

### 3. Bot Difficulty Levels

Three difficulty levels with configurable thinking delays:

- **Easy**: 800ms - 1200ms delay, simpler decision algorithms
- **Medium**: 500ms - 800ms delay, balanced strategy
- **Hard**: 200ms - 500ms delay, optimal play

## Adding a New Game Bot

### Step 1: Define AI Decision Logic

Create `lib/bots/<game>/your-game-bot-ai.ts` with pure decision algorithms:

```typescript
// lib/bots/spy/spy-bot-ai.ts
export interface SpyBotDecision {
  type: 'vote' | 'challenge' | 'pass'
  targetPlayerId?: string
}

export class SpyBotAI {
  /**
   * Analyze game state and return optimal decision
   */
  static makeDecision(
    gameState: SpyGameState,
    difficulty: BotDifficulty
  ): SpyBotDecision {
    // Your AI logic here
    // - Pattern matching
    // - Probability calculations
    // - Strategy based on difficulty
  }

  /**
   * Helper methods for decision making
   */
  private static calculateSuspicion(player: Player): number {
    // Suspicion score calculation
  }
}
```

**Best Practices:**

- Keep AI logic separate from game engine integration
- Make static methods for reusability
- Document decision algorithms with comments
- Adjust strategy based on difficulty parameter

### Step 2: Create Bot Class

Create `lib/bots/<game>/your-game-bot.ts` extending `BaseBot`:

```typescript
// lib/bots/spy/spy-bot.ts
import { BaseBot } from '../core/base-bot'
import { SpyGame } from '@/lib/games/spy-game'
import { Move } from '@/lib/game-engine'
import { BotDifficulty } from '../core/bot-types'
import { SpyBotAI, SpyBotDecision } from './spy-bot-ai'

export class SpyBot extends BaseBot<SpyGame, SpyBotDecision> {
  /**
   * Make a decision for the current game state
   */
  async makeDecision(): Promise<SpyBotDecision> {
    await this.delay() // Humanize bot behavior

    const gameState = this.gameEngine.getState()
    const decision = SpyBotAI.makeDecision(
      gameState.data,
      this.config.difficulty
    )

    this.log('Decision made', { decision })
    return decision
  }

  /**
   * Convert bot decision to game engine Move
   */
  decisionToMove(decision: SpyBotDecision): Move {
    const botPlayer = this.getCurrentPlayer()

    return {
      playerId: botPlayer.id,
      type: decision.type,
      data: {
        targetPlayerId: decision.targetPlayerId,
      },
      timestamp: new Date(),
    }
  }

  /**
   * Get current game state summary (for logging)
   */
  evaluateState(): string {
    const gameState = this.gameEngine.getState()
    return `Spy Game - Round: ${gameState.data.round}, Players: ${gameState.players.length}`
  }

  // Optional: Add game-specific helper methods
  private calculateRisk(move: SpyBotDecision): number {
    // Risk calculation for decision confidence
  }
}
```

### Step 3: Create Bot Executor (Optional)

For games with multi-step turns and visual feedback, create an executor:

```typescript
// lib/bots/spy/spy-bot-executor.ts
import { SpyGame } from '@/lib/games/spy-game'
import { SpyBot, SpyBotDecision } from './spy-bot'
import { BotDifficulty, MoveCallback } from '../core/bot-types'

export interface SpyBotActionEvent {
  type: 'thinking' | 'voting' | 'challenging'
  botName?: string
  data?: Record<string, any>
  message: string
}

export class SpyBotExecutor {
  static async executeBotTurn(
    gameEngine: SpyGame,
    botUserId: string,
    difficulty: BotDifficulty,
    onMove: MoveCallback,
    onBotAction?: (event: SpyBotActionEvent) => void
  ): Promise<void> {
    const bot = new SpyBot(gameEngine, difficulty)

    // Emit thinking event
    onBotAction?.({
      type: 'thinking',
      botName: bot['getBotPlayer'](botUserId)?.name,
      message: 'Bot is analyzing...',
    })

    // Make decision
    const decision = await bot.makeDecision()

    // Visual feedback before move
    await this.delay(300)

    // Execute move
    const move = bot.decisionToMove(decision)
    await onMove(move)

    // Emit action event
    onBotAction?.({
      type: decision.type,
      message: `Bot chose ${decision.type}`,
      data: { decision },
    })
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

### Step 4: Register in Bot Factory

Add your bot to `lib/bots/core/bot-factory.ts`:

```typescript
import { SpyBot } from '../spy/spy-bot'

export type GameType = 'yahtzee' | 'guess_the_spy' | 'uno' | 'chess' | 'other'

export function createBot<T extends GameEngine>(
    gameType: GameType,
    gameEngine: T,
    difficulty: BotDifficulty = 'medium'
): BaseBot<T, any> {
    switch (gameType) {
        case 'yahtzee':
            return new YahtzeeBot(gameEngine as any, difficulty) as any

        case 'guess_the_spy':
            return new SpyBot(gameEngine as any, difficulty) as any

        // Add your bot here

        default:
            throw new Error(`No bot implementation for game type: ${gameType}`)
    }
}
```

### Step 5: Update Barrel Exports

Add exports to `lib/bots/index.ts`:

```typescript
// Spy exports
export { SpyBot, type SpyBotDecision } from './spy/spy-bot'
export { SpyBotExecutor, type SpyBotActionEvent } from './spy/spy-bot-executor'
export { SpyBotAI } from './spy/spy-bot-ai'
```

### Step 6: Update API Routes

Use your bot in game-specific API routes:

```typescript
// app/api/game/[gameId]/bot-turn/route.ts
import { createBot, getBotDifficulty } from '@/lib/bots'

export async function POST(request: NextRequest) {
  // ... load game, verify bot player ...

  const gameEngine = new SpyGame(game.id)
  gameEngine.loadState(JSON.parse(game.state))

  const botDifficulty = getBotDifficulty(botPlayer)
  const bot = createBot('guess_the_spy', gameEngine, botDifficulty)

  // Execute bot turn
  const decision = await bot.makeDecision()
  const move = bot.decisionToMove(decision)

  // Apply move to game
  gameEngine.makeMove(move)

  // Save state
  await prisma.games.update({
    where: { id: game.id },
    data: { state: JSON.stringify(gameEngine.getState()) }
  })
}
```

## Testing Your Bot

### Unit Tests

Test bot decision logic in isolation:

```typescript
// __tests__/lib/bots/spy-bot.test.ts
import { SpyBot } from '@/lib/bots'
import { SpyGame } from '@/lib/games/spy-game'

describe('SpyBot', () => {
  let game: SpyGame
  let bot: SpyBot

  beforeEach(() => {
    game = new SpyGame('test-game')
    // Setup game state
    bot = new SpyBot(game, 'medium')
  })

  it('should make valid decision', async () => {
    const decision = await bot.makeDecision()
    expect(decision.type).toMatch(/vote|challenge|pass/)
  })

  it('should convert decision to move', () => {
    const decision = { type: 'vote', targetPlayerId: 'p1' }
    const move = bot.decisionToMove(decision)

    expect(move.type).toBe('vote')
    expect(move.data.targetPlayerId).toBe('p1')
  })
})
```

### Integration Tests

Test bot execution flow:

```typescript
it('should execute full bot turn', async () => {
  const onMove = jest.fn()
  const onBotAction = jest.fn()

  await SpyBotExecutor.executeBotTurn(
    game,
    botUserId,
    'medium',
    onMove,
    onBotAction
  )

  expect(onMove).toHaveBeenCalled()
  expect(onBotAction).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'thinking' })
  )
})
```

## Database Schema

Bots are stored in the `Bots` table with one-to-one relation to `Users`:

```prisma
model Users {
  id       String  @id @default(cuid())
  username String  @unique
  email    String  @unique
  bot      Bots?   // One-to-one relation
  // ...
}

model Bots {
  id         String   @id @default(cuid())
  userId     String   @unique
  user       Users    @relation(fields: [userId], references: [id], onDelete: Cascade)
  botType    String   // 'yahtzee', 'spy', 'uno', 'chess'
  difficulty String   @default("medium") // 'easy', 'medium', 'hard'
  createdAt  DateTime @default(now())
}
```

### Checking if Player is Bot

```typescript
import { isBot, getBotDifficulty, getBotType } from '@/lib/bots'

const player = await prisma.players.findUnique({
  where: { id: playerId },
  include: { user: { include: { bot: true } } }
})

if (isBot(player)) {
  const difficulty = getBotDifficulty(player)
  const botType = getBotType(player)
  console.log(`Bot player: ${botType} (${difficulty})`)
}
```

## Bot Behavior Guidelines

### 1. Humanize Bot Actions

- **Add delays**: Use `this.delay()` before decisions (200ms - 1200ms based on difficulty)
- **Visual feedback**: Emit action events for UI updates
- **Progressive disclosure**: Show thinking → action → result sequence

### 2. Difficulty Tuning

**Easy:**

- Longer delays (800-1200ms)
- Suboptimal but legal moves
- Occasional "mistakes" (15-20% of the time)
- Simpler pattern matching

**Medium:**

- Moderate delays (500-800ms)
- Balanced strategy
- Occasional risks for variety
- Good pattern recognition

**Hard:**

- Minimal delays (200-500ms)
- Optimal play using probability
- No mistakes, perfect execution
- Advanced strategy (game theory, opponent modeling)

### 3. Logging Best Practices

```typescript
// Log decisions with context
this.log('🤖 Bot decision', {
  decision: decision.type,
  confidence: 0.85,
  rollsLeft: 3,
  gameState: this.evaluateState()
})

// Use prefixes for filtering
clientLogger.log('🤖 [YAHTZEE-BOT] Starting turn...')
```

## Common Patterns

### Pattern 1: Multi-Step Turn (Yahtzee)

```typescript
async makeDecision(): Promise<YahtzeeBotDecision> {
  const rollsLeft = this.gameEngine.getRollsLeft()

  if (rollsLeft === 0) {
    // Must score
    return this.decideScoring()
  } else {
    // Can roll or score
    return this.decideRollOrScore()
  }
}
```

### Pattern 2: Reactive Decision (Social Deduction)

```typescript
async makeDecision(): Promise<SpyBotDecision> {
  const gameState = this.gameEngine.getState()
  const round = gameState.data.currentRound

  if (round.phase === 'voting') {
    return this.decideVote()
  } else if (round.phase === 'challenging') {
    return this.decideChallenge()
  }
}
```

### Pattern 3: Strategy Adaptation

```typescript
private selectStrategy(): 'aggressive' | 'defensive' | 'balanced' {
  const playerCount = this.gameEngine.getPlayers().length
  const myPosition = this.getMyPosition()

  // Adjust strategy based on game context
  if (myPosition === 'winning') return 'defensive'
  if (myPosition === 'losing') return 'aggressive'
  return 'balanced'
}
```

## Troubleshooting

### Bot Not Taking Turn

**Check:**

1. Bot has `bot` relation in database: `!!user.bot`
2. Bot detection logic uses `isBot(player)` not `player.isBot`
3. API route includes bot in player query:

   ```typescript
   include: { user: { include: { bot: true } } }
   ```

4. `useBotTurn` hook monitors `rollsLeft === 3` for turn start

### Type Errors

**Common fixes:**

- `GameEngine` is NOT generic - use `GameEngine` not `GameEngine<any>`
- Import `calculateScore` from `@/lib/yahtzee` for Yahtzee bots
- Use `YahtzeeScorecard` type for scorecard parameters

### Bot Executor Not Found

**Check imports:**

```typescript
// ✅ Correct
import { YahtzeeBotExecutor } from '@/lib/bots'

// ❌ Old pattern (deprecated)
import { BotMoveExecutor } from '@/lib/bot-executor'
```

## Migration from Legacy Bot System

The old bot system (`lib/bot-executor.ts`, `lib/yahtzee-bot.ts`) has been deprecated in favor of the modular architecture.

### Changes

**Before (deprecated):**

```typescript
import { BotMoveExecutor } from '@/lib/bot-executor'
import { YahtzeeBot } from '@/lib/yahtzee-bot'

await BotMoveExecutor.executeBotTurn(gameEngine, botUserId, onMove, onBotAction)
const decision = YahtzeeBot.decideDiceToHold(dice, held, rollsLeft, scorecard)
```

**After (new system):**

```typescript
import { createBot, YahtzeeBotExecutor, YahtzeeBotAI } from '@/lib/bots'

const bot = createBot('yahtzee', gameEngine, 'medium')
await YahtzeeBotExecutor.executeBotTurn(gameEngine, botUserId, 'medium', onMove, onBotAction)
const diceToHold = YahtzeeBotAI.decideDiceToHold(dice, held, rollsLeft, scorecard)
```

**Database schema:**

- ✅ Use: `user.bot` (one-to-one relation to Bots table)
- ❌ Removed: `user.isBot` (deprecated field)

**Type guards:**

- ✅ Use: `isBot(player)` from `@/lib/bots`
- ❌ Removed: `BotMoveExecutor.isBot(player)`

## Resources

- **Core files**: `lib/bots/core/base-bot.ts`, `lib/bots/core/bot-types.ts`
- **Example implementation**: `lib/bots/yahtzee/` (complete reference)
- **Database schema**: `prisma/schema.prisma` (Users → Bots relation)
- **API integration**: `app/api/game/[gameId]/bot-turn/route.ts`
- **Frontend hook**: `app/lobby/[code]/hooks/useBotTurn.ts`

## Questions?

File issues or discuss in team chat. This system is designed to make adding game bots easy and maintainable!

---

**Last Updated**: February 2026  
**Version**: 2.0 (Modular Architecture)
