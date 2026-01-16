# Scalability Plan for Adding New Games

## 🎯 Goal
Make adding a new board game as simple as possible - minimal changes to core code, maximum isolation of game logic.

## 📋 Current Problems

### 1. **Hardcoded switch-case in API**
- `app/api/game/create/route.ts` - need to add new case every time
- `app/api/game/[gameId]/state/route.ts` - also switch-case for different games

### 2. **No centralized game registration**
- Games are scattered across codebase
- No single place where all games are registered
- Hard to know which games are available

### 3. **Tight UI coupling to specific game**
- `GameBoard.tsx` is hardcoded for Yahtzee
- No universal router for different games
- Each game requires changes to main component

### 4. **Configuration duplication**
- Game information duplicated in `app/games/page.tsx` and `app/lobby/create/page.tsx`
- No single source of truth

## ✅ Recommended Improvements

### 1. Create Game Registry (Game Registration System)

**File**: `lib/game-registry.ts`

Already created! This centralizes all game registration.

### 2. Universal Game Router for UI

**File**: `app/lobby/[code]/components/GameRouter.tsx`

```typescript
import { GameRegistry } from '@/lib/game-registry'

export default function GameRouter({ gameType, ...props }) {
  const game = GameRegistry.get(gameType)
  
  if (!game || !game.component) {
    return <div>Game UI not implemented</div>
  }
  
  const GameComponent = game.component
  return <GameComponent {...props} />
}
```

### 3. Refactor API endpoints

**File**: `app/api/game/create/route.ts`

Replace switch-case with GameRegistry usage.

### 4. Centralized game configuration

**File**: `lib/games/config.ts`

```typescript
import { GameRegistry } from '../game-registry'

export function getGameInfo(gameType: string) {
  return GameRegistry.getMetadata(gameType)
}

export function getAllGames() {
  return GameRegistry.getAll().map(g => g.metadata)
}

export function getAvailableGames() {
  return GameRegistry.getAll()
    .filter(g => g.component) // Only games with UI
    .map(g => g.metadata)
}
```

### 5. Folder structure for new games

```
lib/games/
  ├── registry.ts          # Registration of all games
  ├── yahtzee/
  │   ├── engine.ts
  │   ├── config.ts
  │   └── bot.ts
  ├── spy/
  │   ├── engine.ts
  │   ├── config.ts
  │   └── locations.ts
  └── [new-game]/
      ├── engine.ts
      ├── config.ts
      └── types.ts

components/games/
  ├── yahtzee/
  │   ├── GameBoard.tsx
  │   └── Scorecard.tsx
  ├── spy/
  │   └── GameBoard.tsx
  └── [new-game]/
      └── GameBoard.tsx
```

### 6. Template for new game

**File**: `docs/GAME_TEMPLATE.md`

See template file for step-by-step instructions.

## 🚀 Implementation Priorities

### Phase 1: Basic Infrastructure (1-2 days)
1. ✅ Create `GameRegistry`
2. ✅ Refactor `app/api/game/create/route.ts`
3. ✅ Refactor `app/api/game/[gameId]/state/route.ts`
4. ✅ Update `app/api/lobby/route.ts` to use GameRegistry for initial state

### Phase 2: UI System (2-3 days)
5. ✅ Create `GameRouter` component
6. ✅ Extract Yahtzee UI into separate component
7. ✅ Extract Spy UI into separate component
8. ✅ Update `app/lobby/[code]/page.tsx` to use GameRouter

### Phase 3: Configuration (1 day)
9. ✅ Centralize game configuration
10. ✅ Update `app/games/page.tsx` to use registry
11. ✅ Update `app/lobby/create/page.tsx` to use registry

### Phase 4: Documentation and Templates (1 day)
12. ✅ Create template for new game
13. ✅ Update CONTRIBUTING.md
14. ⏸️ Create example game template (skipped per user request)

## 📝 Additional Improvements

### 1. Plugin System (optional)
- Allow dynamic game loading
- Support for community custom games

### 2. Extension System
- Bots for different games
- Additional game modes
- Tournaments and leagues

### 3. Game Analytics
- Track game popularity
- Game statistics
- Game recommendations

### 4. Testing
- Unit tests for GameRegistry
- Integration tests for new games
- E2E tests for gameplay

## 🎮 Example: Adding New Game "Uno"

After implementing improvements, adding Uno will take:

1. **Create engine** (2-3 hours)
   ```typescript
   // lib/games/uno/engine.ts
   export class UnoGame extends GameEngine { ... }
   ```

2. **Create UI** (4-6 hours)
   ```typescript
   // components/games/uno/GameBoard.tsx
   export default function UnoGameBoard() { ... }
   ```

3. **Register** (5 minutes)
   ```typescript
   GameRegistry.register('uno', metadata, factory, UnoGameBoard)
   ```

4. **Update DB** (5 minutes)
   ```prisma
   enum GameType {
     uno  // add
   }
   ```

**Total**: ~1 day of work instead of 3-4 days now!
