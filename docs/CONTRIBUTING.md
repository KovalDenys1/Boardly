# Contributing to Boardly

## 👋 Welcome!

Boardly is a modern multiplayer board games platform. This project contains multiple board games that share common infrastructure while being developed independently.

🌐 **Live at:** [boardly.online](https://boardly.online)

## 🎮 Current Games

### ✅ Yahtzee (Live in Production)
- **Status**: ✅ Fully functional and deployed
- **Location**: `/app/lobby/[code]/page.tsx`, `/lib/yahtzee.ts`, `/lib/games/yahtzee-game.ts`
- **Features**: 
  - Multiplayer dice game (2-4 players)
  - Real-time updates via Socket.IO
  - Smart AI opponents with probability-based decisions
  - Turn timer with auto-scoring
  - In-game chat and sound effects
  - Celebration animations for special rolls

### 🚧 Chess (In Development)
- **Status**: 🔨 In active development
- **Developer**: In progress
- **Location**: TBD
- **Goal**: Classic chess with real-time multiplayer

### 📋 Guess the Spy (Planned)
- **Status**: 📝 Planning phase
- **Location**: `/app/games/spy/` (to be created)
- **Goal**: Social deduction game where players find the spy

## 🏗️ Project Structure

```
Boardly/
├── app/
│   ├── games/              # Games selection page
│   │   ├── page.tsx        # Main games menu
│   │   └── yahtzee/        # Yahtzee-specific pages
│   ├── lobby/              # Universal lobby system
│   │   ├── [code]/         # Dynamic lobby room
│   │   │   ├── page.tsx    # Main lobby page
│   │   │   ├── hooks/      # Game logic hooks
│   │   │   └── components/ # UI components
│   │   ├── create/         # Create lobby page
│   │   └── join/           # Join lobby page
│   └── api/                # API routes
│       ├── game/           # Game management
│       ├── lobby/          # Lobby management
│       └── auth/           # Authentication
├── components/             # Shared UI components
│   ├── Chat.tsx           # ✅ Reusable chat component
│   ├── PlayerList.tsx     # ✅ Reusable player list
│   ├── Dice.tsx           # ✅ Animated dice component
│   ├── DiceGroup.tsx      # ✅ Group of dice
│   └── Scorecard.tsx      # Game-specific scorecard
├── lib/
│   ├── game-engine.ts     # ✅ Abstract game engine base class
│   ├── games/             # Game-specific implementations
│   │   └── yahtzee-game.ts # Yahtzee engine
│   ├── yahtzee.ts         # Yahtzee game logic
│   ├── yahtzee-bot.ts     # AI opponent logic
│   ├── bot-executor.ts    # Bot turn automation
│   ├── auth.ts            # ✅ Authentication
│   ├── db.ts              # ✅ Database connection
│   └── sounds.ts          # ✅ Sound manager
├── prisma/
│   └── schema.prisma      # Database schema
├── socket-server.ts       # WebSocket server
└── docs/                  # Documentation
    ├── CHANGELOG.md       # Version history
    ├── CONTRIBUTING.md    # This file
    ├── TODO.md            # Development roadmap
    └── YAHTZEE_QA_CHECKLIST.md

```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database (or Supabase account)
- Basic knowledge of Next.js and TypeScript

### Development Setup

```bash
# Clone the repository
git clone https://github.com/KovalDenys1/Boardly.git
cd Boardly

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# Set up database
npx prisma migrate dev
npx prisma generate

# Start development servers (both Next.js and Socket.IO)
npm run dev:all

# Or run separately:
npm run socket:dev  # Terminal 1 - Socket.IO server (port 3001)
npm run dev         # Terminal 2 - Next.js app (port 3000)
```

Visit: `http://localhost:3000`

### Project Architecture

**Dual-Server Architecture:**
- **Next.js Server (port 3000)**: HTTP/API routes, SSR, authentication
- **Socket.IO Server (port 3001)**: WebSocket connections, real-time game state

**Game State Flow:**
```
Client Action → API Route → Database Update → 
Socket Notification (/api/notify) → Socket Server Broadcast → 
All Clients in Room → UI Update
```

## 🎯 Adding a New Game

### Step 1: Create Game Engine

Create `lib/games/your-game.ts` extending the base `GameEngine` class:

```typescript
import { GameEngine } from '../game-engine'

export class YourGame extends GameEngine {
  // Implement required methods
  validateMove(move: any): boolean { /* ... */ }
  processMove(move: any): void { /* ... */ }
  getInitialGameData(): any { /* ... */ }
}
```

### Step 2: Add Database Support

Update `prisma/schema.prisma`:

```prisma
enum GameType {
  YAHTZEE
  YOUR_GAME  // Add your game type
}
```

Run migration: `npx prisma migrate dev --name add_your_game`

### Step 3: Create UI Components

Create game-specific components in `components/`:
- `YourGameBoard.tsx` - Main game interface
- `YourGameScorecard.tsx` - Scoring display
- Additional components as needed

### Step 4: Add Socket Events

In `socket-server.ts`, add event handlers:

```typescript
socket.on('your-game-action', async (data) => {
  // Handle game-specific actions
  io.to(`lobby:${lobbyCode}`).emit('game-update', newState)
})
```

### Step 5: Create Game Pages

Create pages in `app/games/your-game/`:
- `lobbies/page.tsx` - Lobby browser
- Implement game-specific rendering in `app/lobby/[code]/components/GameBoard.tsx`

## 📚 Key Patterns

### Guest vs Authenticated Users
- **Guests**: Identified via `X-Guest-Id` and `X-Guest-Name` headers
- **Authenticated**: Use NextAuth session + JWT tokens
- Both can play games; guest data is temporary

### Socket.IO Room Management
- Lobby rooms: `lobby:${lobbyCode}` - all players in specific game
- Lobby list: `lobby-list` - users browsing available lobbies
- Always `socket.join()` before emitting to rooms

### API Route Patterns
```typescript
// Always check guest headers for unauthenticated requests
const guestId = request.headers.get('X-Guest-Id')
const guestName = request.headers.get('X-Guest-Name')

// Use rate limiting
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
const limiter = rateLimit(rateLimitPresets.standard)

// Log with apiLogger
import { apiLogger } from '@/lib/logger'
const log = apiLogger('api-endpoint-name')
log.info('Action happened', { userId, lobbyCode })
```

### Custom Hooks Architecture
Split complex logic into modular hooks (see `app/lobby/[code]/hooks/`):
- `useLobbyActions.ts` - Join, start game, add bots
- `useSocketConnection.ts` - WebSocket setup
- `useGameActions.ts` - Game-specific actions
- `useGameTimer.ts` - Turn timer management

## 🎨 UI Guidelines

### Design System
- **Colors**: Blue primary (#3B82F6), Green success, Red error
- **Components**: Use existing components from `/components`
- **Styling**: Tailwind CSS with custom animations in `globals.css`
- **Theme**: Dark mode support via system preference

### Component Library
```typescript
// Available reusable components
import Chat from '@/components/Chat'
import PlayerList from '@/components/PlayerList'
import LoadingSpinner from '@/components/LoadingSpinner'
import LoadingButton from '@/components/LoadingButton'
import { toast } from 'react-hot-toast'
```

## 🧪 Testing & Quality

### Before Submitting PR
1. ✅ Test all game flows (start, play, end)
2. ✅ Test with bots and real players
3. ✅ Check mobile responsiveness
4. ✅ Verify Socket.IO events work correctly
5. ✅ Run linter: `npm run lint`
6. ✅ Check for console errors
7. ✅ Test guest and authenticated modes

### Code Standards
- **Language**: All code, comments, and documentation in English
- **TypeScript**: Strict mode enabled, no `any` types
- **Logging**: Use `clientLogger` in client, `apiLogger` in API routes
- **Error Handling**: Always handle errors gracefully with user feedback

## 📦 Database Changes

When adding new game types or features:

```bash
# 1. Update prisma/schema.prisma
# 2. Create migration
npx prisma migrate dev --name descriptive_name

# 3. Generate Prisma Client
npx prisma generate

# 4. View database in GUI
npx prisma studio
```

Example: Adding a new game type
```prisma
enum GameType {
  YAHTZEE
  CHESS
  YOUR_GAME  // Add here
}
```

## 🐛 Debugging & Development Tools

### Browser Console
- Open DevTools: `F12` or `Ctrl+Shift+I`
- Check `clientLogger` output (automatically disabled in production)
- Monitor Socket.IO connection status

### Server Logs
- Socket.IO server: Terminal running `npm run socket:dev`
- Next.js server: Terminal running `npm run dev`
- Look for `apiLogger` output with context

### Database Inspection
```bash
npx prisma studio  # Visual database browser at localhost:5555
```

### Testing Multiplayer
- Open multiple browser tabs/windows
- Use guest mode for quick testing
- Mix authenticated and guest users

## 🤝 Contribution Guidelines

### Code Standards
- **TypeScript**: Use strict types, avoid `any`
- **Naming**: camelCase for variables, PascalCase for components
- **Imports**: Use absolute imports with `@/` prefix
- **Comments**: Write clear, English comments for complex logic
- **Formatting**: Use Prettier (runs automatically)

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: add your feature description"

# Push to repository
git push origin feature/your-feature-name

# Create pull request on GitHub
```

### Commit Message Format
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting)
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

### Pull Request Checklist
- [ ] Code compiles without errors
- [ ] No console errors or warnings
- [ ] Tested on desktop and mobile
- [ ] All new code has English comments
- [ ] Updated relevant documentation
- [ ] Follows existing code patterns

## 📚 Useful Resources

### Official Documentation
- [Next.js 14 Docs](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Socket.IO v4](https://socket.io/docs/v4)
- [Prisma ORM](https://www.prisma.io/docs)
- [NextAuth.js](https://next-auth.js.org)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TypeScript](https://www.typescriptlang.org/docs)

### Learning Resources
- Yahtzee implementation: `/lib/yahtzee.ts`, `/lib/games/yahtzee-game.ts`
- Socket patterns: `/socket-server.ts`
- API patterns: `/app/api/game/[gameId]/state/route.ts`
- Custom hooks: `/app/lobby/[code]/hooks/`

## 💬 Getting Help

### Have Questions?
1. Check existing code for similar patterns
2. Read the [AI Agent Instructions](../.github/copilot-instructions.md)
3. Review documentation in `/docs`
4. Open an issue on GitHub
5. Contact project maintainers

### Found a Bug?
1. Check if already reported in GitHub Issues
2. Create detailed bug report with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Browser/OS information
   - Console errors (if any)

## 🎉 Thank You!

Thank you for contributing to Boardly! Your work helps make multiplayer board games accessible and fun for everyone.

**Live Production Site**: [boardly.online](https://boardly.online)

---

*Last Updated: November 28, 2025*
