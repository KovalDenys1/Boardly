# Template for Adding a New Game

This document describes the step-by-step process of adding a new board game to the project.

## 📋 Checklist

- [ ] Create Game Engine
- [ ] Create game configuration
- [ ] Register game in GameRegistry
- [ ] Create UI components
- [ ] Update database (if needed)
- [ ] Create lobby pages
- [ ] Add localization
- [ ] Write tests
- [ ] Update documentation

## 🚀 Step-by-Step Instructions

### Step 1: Create Game Engine

Create file `lib/games/[game-name]/engine.ts`:

```typescript
import { GameEngine, GameState, Move, Player, GameConfig } from '@/lib/game-engine'

export interface [GameName]GameData {
  // Define your game's data structure
  // For example, for a card game:
  deck: Card[]
  discardPile: Card[]
  currentPlayer: number
  // etc.
}

export class [GameName]Game extends GameEngine {
  constructor(gameId: string, config: GameConfig) {
    super(gameId, '[game-name]', config)
  }

  getInitialGameData(): [GameName]GameData {
    return {
      // Initial game state
      deck: [],
      discardPile: [],
      currentPlayer: 0,
    }
  }

  validateMove(move: Move): boolean {
    // Validate move
    const gameData = this.state.data as [GameName]GameData
    
    // Example checks:
    // - Is it the current player's turn?
    // - Does the move follow the rules?
    // - Is the game still in progress?
    
    return true // or false
  }

  processMove(move: Move): void {
    // Process the move
    const gameData = this.state.data as [GameName]GameData
    
    switch (move.type) {
      case 'play-card':
        // Card play logic
        break
      case 'draw-card':
        // Card draw logic
        break
      // etc.
    }
    
    this.state.data = gameData
  }

  checkWinCondition(): Player | null {
    // Check win conditions
    // Return winning player or null
    return null
  }

  getGameRules(): string[] {
    return [
      'Rule 1',
      'Rule 2',
      // etc.
    ]
  }

  // Additional methods specific to your game
  getCurrentPlayerHand(playerId: string): Card[] {
    // ...
  }
}
```

### Step 2: Create Configuration

Create file `lib/games/[game-name]/config.ts` (optional, if complex configuration is needed):

```typescript
export const [GameName]Config = {
  defaultMaxPlayers: 4,
  minPlayers: 2,
  maxPlayers: 8,
  // etc.
}
```

### Step 3: Register Game

Open `lib/game-registry.ts` and add registration:

```typescript
import { [GameName]Game } from './games/[game-name]/engine'

GameRegistry.register(
  '[game-name]', // Game ID (must match GameType in DB)
  {
    id: '[game-name]',
    name: '[Game Name]',
    emoji: '🎮', // Choose appropriate emoji
    description: 'Game description',
    minPlayers: 2,
    maxPlayers: 8,
    defaultMaxPlayers: 4,
    allowedPlayers: [2, 3, 4, 5, 6, 7, 8], // Optional
    difficulty: 'medium', // 'easy' | 'medium' | 'hard'
    estimatedDuration: 20, // in minutes
    supportsBots: true, // Does the game support bots
    category: 'card', // 'dice' | 'card' | 'board' | 'social' | 'strategy'
  },
  {
    createEngine: (gameId: string, config: GameConfig) => {
      return new [GameName]Game(gameId, config)
    },
    createInitialState: () => {
      // Initial state for lobby creation
      return {
        // ...
      }
    },
  }
  // component will be added in step 4
)
```

### Step 4: Create UI Components

Create `components/games/[game-name]/GameBoard.tsx`:

```typescript
'use client'

import { Game } from '@/types/game'
import { [GameName]Game } from '@/lib/games/[game-name]/engine'

interface [GameName]GameBoardProps {
  gameEngine: [GameName]Game
  game: Game | null
  isMyTurn: boolean
  timeLeft: number
  getCurrentUserId: () => string | undefined
  // Add other necessary props
}

export default function [GameName]GameBoard({
  gameEngine,
  game,
  isMyTurn,
  timeLeft,
  getCurrentUserId,
}: [GameName]GameBoardProps) {
  // Implement your game UI
  
  return (
    <div className="game-board">
      {/* Your UI */}
    </div>
  )
}
```

Then update registration in `lib/game-registry.ts`:

```typescript
import [GameName]GameBoard from '@/components/games/[game-name]/GameBoard'

GameRegistry.register(
  '[game-name]',
  metadata,
  factory,
  [GameName]GameBoard // Add component
)
```

### Step 5: Update Database

Open `prisma/schema.prisma` and add to enum:

```prisma
enum GameType {
  yahtzee
  guess_the_spy
  [game-name]  // Add here
  // ...
}
```

Run migration:

```bash
npx prisma migrate dev --name add_[game-name]
```

### Step 6: Create Lobby Pages

Create `app/games/[game-name]/lobbies/page.tsx`:

```typescript
'use client'

import { GameRegistry } from '@/lib/game-registry'
// Use existing components as examples
// See app/games/yahtzee/lobbies/page.tsx
```

### Step 7: Add Localization

Add translations to `messages/en.json` and `messages/uk.json`:

```json
{
  "games": {
    "[game-name]": {
      "name": "[Game Name]",
      "description": "Game description",
      "difficulty": "medium",
      "lobbies": {
        "title": "[Game Name] Lobbies",
        "host": "Host"
      }
    }
  }
}
```

### Step 8: Update API Endpoints

API endpoints already use `GameRegistry`, so they should work automatically!

But if specific logic is needed, update:
- `app/api/game/[gameId]/state/route.ts` - if special move handling is needed
- `app/api/game/[gameId]/[game-name]-action/route.ts` - for specific actions

### Step 9: Write Tests

Create `__tests__/lib/games/[game-name].test.ts`:

```typescript
import { [GameName]Game } from '@/lib/games/[game-name]/engine'

describe('[GameName]Game', () => {
  // Tests
})
```

### Step 10: Update Documentation

- Update `README.md`
- Add game description to `docs/`
- Update `CONTRIBUTING.md` if needed

## 📝 Examples

See existing games as examples:
- **Yahtzee**: `lib/games/yahtzee-game.ts`
- **Guess the Spy**: `lib/games/spy-game.ts`

## ⚠️ Important Notes

1. **Game ID** must match `GameType` in database
2. **All GameEngine methods** must be implemented
3. **UI component** must be client-side (`'use client'`)
4. **Test** on different screen sizes (mobile devices)
5. **Localization** is required for all text

## 🎯 After Completion

1. Check that game appears in games list (`/games`)
2. Check lobby creation
3. Check gameplay
4. Check bot support (if supported)
5. Check guest support

## ❓ Questions?

If you have questions, see:
- `docs/SCALABILITY_PLAN.md` - scalability plan
- `docs/CONTRIBUTING.md` - general documentation
- Existing games as examples
