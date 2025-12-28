

# Boardly – Copilot Instructions (2025 Update)

## 2025: Scaling and Development

- Project is in production: boardly.online, Yahtzee (AI bots), Chess in development, Guess the Spy, Uno and more planned.
- Architecture: Next.js (API, SSR) + standalone Socket.IO server (real-time) + PostgreSQL (Supabase/Prisma).
- Modular hooks, bot system, test coverage (96% for GameEngine core).
- Supports both guest and authenticated users.

### Key Recommendations

1. **Adding New Games/Features**
  - Use the GameEngine pattern (`lib/game-engine.ts`).
  - For each game, create a separate class in `lib/games/`, implement `validateMove`, `processMove`, `getInitialGameData`.
  - UI: separate components and pages for lobby and game board.
  - All new texts must use i18n (react-i18next, showToast).
  - Cover business logic with unit tests (`__tests__/lib/`).
  - Update documentation and TODO.md.

2. **Scaling Code and Infrastructure**
  - Maintain modularity: business logic in classes and hooks, UI in components.
  - Avoid code duplication, use abstractions.
  - New real-time features should extend the socket server.
  - Monitor performance: use debounces, rate limiting, DB indexes.

3. **Scaling the Team**
  - Follow code style, write comments, cover code with tests.
  - Use pull request review, CI/CD.

### Checklist for New Game/Feature

1. Create a class in `lib/games/your-game.ts` extending GameEngine
2. Implement methods: `validateMove`, `processMove`, `getInitialGameData`, `checkWinCondition`
3. Add game type to enum in `prisma/schema.prisma`
4. Create UI for lobby and game board
5. Add keys to both messages/en.json and messages/uk.json
6. Write unit tests for business logic
7. Update documentation and TODO.md

# Boardly - AI Agent Instructions

## Project Status

**Stage**: ✅ Production Live at [boardly.online](https://boardly.online)  
**Available Games**: Yahtzee (fully implemented with AI bots)  
**In Development**: Chess  
**Planned**: Guess the Spy, Uno, and more casual multiplayer games

## Architecture Overview

**Dual-Server Real-Time Architecture**: Next.js frontend (port 3000) + standalone Socket.IO server (port 3001)

```
┌─────────────┐     HTTP/API      ┌──────────────┐     WebSocket    ┌──────────────┐
│   Client    │ ──────────────────>│  Next.js     │<─────────────────>│  Socket.IO   │
│  (Browser)  │<──────────────────│  (port 3000) │                   │  (port 3001) │
└─────────────┘                   └──────────────┘                   └──────────────┘
                                          │                                   │
                                          v                                   v
                                   ┌──────────────────────────────────────────┐
                                   │      PostgreSQL (Supabase/Prisma)       │
                                   └──────────────────────────────────────────┘
```

- **Next.js**: Handles HTTP/API routes, SSR, static pages via App Router
- **Socket.IO Server**: Manages WebSocket connections, room broadcasting, real-time state sync
- **Communication Pattern**: Client → API Route → DB Update → POST `/api/notify` → Socket Server → Broadcast to Room

**Game State Flow**:
```
Client Action → API Route → Database Update → Socket Notification (/api/notify) → 
Socket Server Broadcast → All Clients in Room → UI Update
```

## Critical Patterns

### 1. Guest vs Authenticated Users
- **Guests**: Identified via `X-Guest-Id` and `X-Guest-Name` headers (set client-side)
- **Authenticated**: Use NextAuth session + JWT tokens
- Both can play games; guest data stored temporarily in game state, not User table
- Check: `app/api/game/[gameId]/state/route.ts` for header handling

### 2. Socket.IO Room Management
- Lobby rooms: `lobby:${lobbyCode}` - all players in a specific game lobby
- Lobby list: `lobby-list` - users browsing available lobbies
- Always `socket.join()` before emitting to rooms
- Events flow: `socket.emit()` (client → server) → `io.to(room).emit()` (server → clients)

**Example** (`socket-server.ts:238`):
```typescript
socket.on('join-lobby', async (lobbyCode: string) => {
  socket.join(`lobby:${lobbyCode}`)
  // Now this socket receives broadcasts to this lobby
})
```

### 3. Game Engine Pattern
- **Abstract**: `lib/game-engine.ts` - base class for all games
- **Concrete**: `lib/games/yahtzee-game.ts` - extends GameEngine
- Each game implements: `validateMove()`, `processMove()`, `getInitialGameData()`
- State stored as JSON in `Game.state` (PostgreSQL JSONB)
- Load engine: `new YahtzeeGame(gameId).loadState(JSON.parse(game.state))`

### 4. Custom Hooks Architecture (Lobby Page)
Modular hooks split complex lobby logic (`app/lobby/[code]/hooks/`):
- `useLobbyActions.ts` - join, start game, add bots
- `useSocketConnection.ts` - WebSocket setup and event handlers
- `useGameActions.ts` - roll dice, hold, score
- `useGameTimer.ts` - turn timer management
- `useBotTurn.ts` - AI opponent automation

**Hook dependency**: Socket must be initialized before actions (use `emitWhenConnected`)

### 5. Bot Player System
- Bots are regular Users with `isBot: true` flag in database
- Created on-demand via `lib/bot-executor.ts`
- AI logic in `lib/yahtzee-bot.ts` - probability-based decision making
- Bot turns automated via `useBotTurn` hook when `currentPlayer.isBot === true`

## Development Workflows

### Running Locally
```bash
npm run dev:all          # Both servers (uses concurrently) - RECOMMENDED
# OR separate terminals:
npm run socket:dev       # Terminal 1: Socket.IO on :3001
npm run dev              # Terminal 2: Next.js on :3000
```

**Critical**: Both servers must run simultaneously for real-time features to work.

### Database Changes
```bash
npx prisma migrate dev --name description   # Create migration
npm run db:push          # Push schema (dev only, no migration)
npm run db:generate      # Regenerate Prisma Client (after schema changes)
npm run db:studio        # GUI for database inspection
```

### Testing
```bash
npm test                 # Run all tests (74 tests, ~1.2s)
npm run test:watch       # Watch mode for TDD
npm run test:coverage    # Generate coverage report (17.8% overall, 96% GameEngine)
```

**Test Coverage** (Dec 2024):
- Game logic: `lib/game-engine.ts` (96%), `lib/yahtzee.ts` (80%), `lib/games/yahtzee-game.ts` (80%)
- Focus: Unit tests for business logic (not API routes - too complex to mock Edge Runtime)
- See: `docs/TESTING_COMPLETE.md` for detailed breakdown

### Adding a New Game
1. Create game class in `lib/games/your-game.ts` extending `GameEngine`
2. Implement required methods: `validateMove`, `processMove`, `getInitialGameData`, `checkWinCondition`
3. Add game type to `gameType` enum in `prisma/schema.prisma`
4. Create lobby UI in `app/games/your-game/lobbies/`
5. Handle game-specific rendering in `app/lobby/[code]/components/GameBoard.tsx`
6. Write unit tests in `__tests__/lib/games/your-game.test.ts`

## Key Conventions

### API Route Patterns
- **Guest headers**: Always check `X-Guest-Id` and `X-Guest-Name` for unauthenticated requests
- **Rate limiting**: Use `rateLimit()` from `lib/rate-limit.ts` - preset configs in `rateLimitPresets`
- **Logging**: Import `apiLogger` from `lib/logger.ts`, use `log.info()`, `log.error()` with context objects
- **Socket notification**: After DB updates, POST to `/api/notify` endpoint to trigger Socket broadcasts

**Example** (`app/api/lobby/[code]/route.ts:194`):
```typescript
await fetch(`${socketUrl}/api/notify`, {
  method: 'POST',
  body: JSON.stringify({
    room: `lobby:${params.code}`,
    event: 'player-joined',
    data: { username, userId }
  })
})
```

### Client-Side Logging
Use `clientLogger` from `lib/client-logger.ts` (not `console.log`)
- Automatically disabled in production
- Consistent format across app
- `clientLogger.log()`, `clientLogger.warn()`, `clientLogger.error()`

### Internationalization (i18n)
**System**: `react-i18next` with client-side language detection (English, Ukrainian)
- **Components**: Use `useTranslation()` hook: `const { t } = useTranslation(); t('key.path')`
- **Toast notifications**: Use `showToast` from `lib/i18n-toast.ts` instead of `toast` directly
  - `showToast.success('toast.saved')`, `showToast.error('errors.network')`
- **Translation files**: `messages/en.json`, `messages/uk.json` - flat structure with dot notation
- **Adding keys**: Add to both files with same structure, use descriptive keys
- **Language switcher**: `components/LanguageSwitcher.tsx` handles UI
- **Storage**: Language preference saved in localStorage

**Example**:
```tsx
// ❌ Don't use toast directly
toast.success('Saved!')

// ✅ Use localized toast
showToast.success('toast.saved')

// ✅ With parameters
showToast.error('errors.invalidMove', undefined, { player: name })
```

See: `docs/I18N_GUIDE.md` for complete guide

### Socket Event Naming
- **Client → Server**: `join-lobby`, `send-chat-message`, `game-action`, `player-joined`
- **Server → Client**: `game-update`, `chat-message`, `lobby-update`, `player-typing`
- **Bidirectional**: Always validate input on server; rate-limit aggressive events

### State Synchronization
- **Source of truth**: PostgreSQL database
- **Optimistic updates**: Update local state immediately, sync with DB via API
- **Conflict resolution**: Socket broadcasts trigger full lobby reload (`loadLobby()`)
- **Refetch on events**: `player-joined`, `game-started` → call `loadLobby()` to get latest state

## Integration Points

### External Services
- **Supabase**: PostgreSQL database (connection pooler for serverless)
- **NextAuth**: Session management (JWT strategy, `lib/next-auth.ts`)
- **Resend**: Email service (verification, password reset via `lib/email.ts`)
- **Sentry**: Error tracking (configured in `instrumentation.ts`, `sentry.*.config.ts`)

### Environment Variables
- **Required**: `DATABASE_URL`, `JWT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- **Socket**: `CORS_ORIGIN` (comma-separated), `PORT` (default 3001), `HOSTNAME`
- **Optional**: `RESEND_API_KEY`, `GOOGLE_CLIENT_ID/SECRET`, `NEXT_PUBLIC_SENTRY_DSN`
- **Dev**: Sentry disabled by default (save quota) - enable with `NEXT_PUBLIC_SENTRY_ENABLED=true`

### Cross-Component Communication
- **Props drilling avoided**: Use custom hooks to encapsulate logic
- **Socket context**: Socket instance passed via props to hooks (see `useLobbyActions`)
- **Event emitters**: Use React state + callbacks, not EventEmitter pattern
- **Toast notifications**: `react-hot-toast` for user feedback (imported as `toast`)

## Common Tasks

### Debugging Socket Issues
1. Check both servers running (`npm run dev:all`)
2. Verify `CORS_ORIGIN` includes localhost
3. Browser console: Look for "Socket connected" logs
4. Server logs: Check `socket-server.ts` output for connection events
5. Use `clientLogger.log('Socket status:', socket?.connected)`

### Testing with Bots
- Add bot via UI "Add Bot" button in lobby
- Bots auto-play when their turn arrives (see `useBotTurn.ts`)
- Bot decisions logged with 🤖 emoji - check client logs
- Adjust bot difficulty (future): Set `botDifficulty` field in User table

### Working with Game State
```typescript
// Load current game state
const gameEngine = new YahtzeeGame(gameId)
gameEngine.loadState(JSON.parse(game.state))

// Validate and process move
if (gameEngine.validateMove(move)) {
  gameEngine.processMove(move)
  const newState = gameEngine.getState()
  // Save newState.data to database
}
```

## Performance Optimization

### Socket.IO Best Practices
- **Debouncing rapid events**: Use debounce for `player-typing` events (500ms)
- **Rate limiting**: All socket endpoints use rate limiting (see `socket-server.ts:line 193`)
- **Connection pooling**: Database uses Supabase connection pooler for serverless
- **Selective broadcasts**: Use `socket.to(room)` to exclude sender when appropriate

### Client-Side Optimization
```typescript
// Debounce typing indicator
const debouncedTyping = debounce((message: string) => {
  socket?.emit('player-typing', { lobbyCode, userId, username })
}, 500)

// Prevent unnecessary re-renders
const gameEngine = useMemo(() => 
  new YahtzeeGame(gameId), [gameId]
)

// Cleanup on unmount
useEffect(() => {
  return () => {
    socket?.disconnect()
    clearInterval(timerRef.current)
  }
}, [socket])
```

### Database Optimization
- **Indexed fields**: All foreign keys and frequently queried fields indexed
- **Select specific fields**: Avoid `select *`, use Prisma `select` clause
- **Batch operations**: Use `createMany`/`updateMany` when possible
- **JSONB for game state**: Flexible schema without migrations for game-specific data

### API Route Optimization
- **Early returns**: Validate and return errors before database queries
- **Parallel queries**: Use `Promise.all()` for independent database calls
- **Caching headers**: Set appropriate cache headers for static data (lobby lists)
- **Streaming responses**: Use `NextResponse.json()` for immediate response

**Example** (`app/api/lobby/route.ts`):
```typescript
// Parallel queries instead of sequential
const [lobbies, activeGamesCount] = await Promise.all([
  prisma.lobby.findMany({ /* ... */ }),
  prisma.game.count({ where: { status: 'playing' } })
])
```

### Bundle Size
- Dynamic imports for heavy components: `const Chart = dynamic(() => import('chart.js'))`
- Tree-shaking: Import specific functions from libraries
- Image optimization: Use Next.js `<Image>` component with proper sizing
- Code splitting: Automatic per-route in Next.js App Router

## Testing Patterns

### Unit Tests (Current Focus)
- **Location**: `__tests__/lib/` and `__tests__/lib/games/`
- **Framework**: Jest with ts-jest
- **Coverage**: 96% on `GameEngine`, 80%+ on game-specific logic
- **Run**: `npm test` (74 tests, ~1.2s execution)

**Pattern Example** (`__tests__/lib/games/yahtzee-game.test.ts`):
```typescript
describe('YahtzeeGame', () => {
  let game: YahtzeeGame
  beforeEach(() => {
    game = new YahtzeeGame('test-id')
    // Add players and setup state
  })

  it('should validate move correctly', () => {
    const move = { playerId: 'p1', type: 'roll', data: {} }
    expect(game.validateMove(move)).toBe(true)
  })
})
```

**Testing Strategy**:
- ✅ **Test**: Game logic, state management, move validation
- ❌ **Skip**: API routes (Edge Runtime mocking too complex), UI components (focus on logic)
- **Future**: Integration tests with supertest for API routes + test database

### Mocking Patterns
```typescript
// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    game: { findUnique: jest.fn(), update: jest.fn() },
    player: { create: jest.fn() }
  }
}))

// Mock game engine methods
const mockValidateMove = jest.spyOn(game, 'validateMove')
mockValidateMove.mockReturnValue(true)
```

## File References
- Architecture: `socket-server.ts`, `app/lobby/[code]/page.tsx`
- Game logic: `lib/game-engine.ts`, `lib/games/yahtzee-game.ts`, `lib/yahtzee.ts`
- Database: `prisma/schema.prisma`, `lib/db.ts`
- Socket patterns: `app/lobby/[code]/hooks/useSocketConnection.ts`
- API examples: `app/api/lobby/[code]/route.ts`, `app/api/game/[gameId]/state/route.ts`
- Bot AI: `lib/yahtzee-bot.ts`, `lib/bot-executor.ts`
- Rate limiting: `lib/rate-limit.ts`
