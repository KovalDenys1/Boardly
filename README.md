# 🎮 Boardly

**Boardly** is an open-source real-time multiplayer board games platform built with Next.js, TypeScript, and Socket.IO. This repository contains the complete source code for both the Next.js frontend and standalone Socket.IO server.

![Boardly Homepage](https://i.imgur.com/qgTmUWd.png)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black.svg)](https://nextjs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-green.svg)](https://socket.io/)
[![Prisma](https://img.shields.io/badge/Prisma-5.0-2D3748.svg)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 📋 Overview

This project implements a dual-server architecture with real-time WebSocket communication for multiplayer gaming experiences. Currently features Yahtzee with AI opponents, turn-based gameplay, and comprehensive game state management.

**Current Status:**
- **Available Games**: Yahtzee (fully implemented with AI bots)
- **In Development**: Guess the Spy (social deduction game)
- **Planned**: Chess, Uno, and additional board games

⚠️ **Important Note on Free Tier WebSocket**: The Socket.IO server runs on Render's free tier, which automatically spins down after 15 minutes of inactivity. Upon first connection after inactivity, the server may take 30-60 seconds to wake up. For production use with no spin-down, consider upgrading to Render's Starter plan ($7/month).

---

## ✨ Features

### 🎲 Game Implementation
- **Yahtzee** ✅ - Complete implementation with standard rules
  - Real-time multiplayer support (2-4 players)
  - AI opponents with probability-based decision logic
  - Automatic scoring and category selection
  - Turn timer system (60 seconds per turn)
  - Celebration effects for special combinations
  - Roll history tracking
- **Guess the Spy** 🔄 - Social deduction game in development
  - Hidden role mechanics (spy vs citizens)
  - Word guessing rounds
  - Voting and discussion phases
  - Real-time game progression

### 🔐 Authentication
- Email/password registration with verification flow (Resend)
- Guest mode for unauthenticated access
- OAuth integration (Google, GitHub)
- JWT-based session management (NextAuth.js)
- Profile management (username, avatar)

### 🎮 Multiplayer System
- **Lobby Management**
  - Public and private lobbies with unique codes
  - Password protection support
  - Shareable invite links
  - Real-time player synchronization
  - Friend system with invite links
- **Game Features**
  - Real-time chat with typing indicators
  - Turn timer with visual countdown
  - Automatic turn advancement
  - Live score updates
  - Bot automation for AI players
  - Game history and replay tracking

### 💻 Technical Implementation
- Dual-server architecture (Next.js + Socket.IO)
- WebSocket-based real-time synchronization
- Internationalization support (English, Ukrainian)
- Responsive design for multiple screen sizes
- API rate limiting
- Error tracking integration (Sentry)
- Dark/light theme support

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18 or higher
- **PostgreSQL** database (or [Supabase](https://supabase.com/) account)
- **npm** or **yarn** package manager

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/KovalDenys1/Boardly.git
cd Boardly

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# 4. Initialize database
npx prisma db push

# 5. Start development servers (both at once)
npm run dev:all
```

Visit **http://localhost:3000** to see the app!

### Separate Terminal Setup (Alternative)
```bash
# Terminal 1 - Socket.IO server (port 3001)
npm run socket:dev

# Terminal 2 - Next.js app (port 3000)
npm run dev
```

### Environment Variables

Create `.env.local` with the following required variables:

```env
# Database (PostgreSQL)
DATABASE_URL="postgresql://username:password@host:port/database"

# NextAuth
NEXTAUTH_SECRET="your-secret-key-min-32-characters"
NEXTAUTH_URL="http://localhost:3000"

# Socket.IO Server
NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"
CORS_ORIGIN="http://localhost:3000"

# Optional: Email (Resend)
RESEND_API_KEY="re_your_api_key"
EMAIL_FROM="noreply@yourdomain.com"

# OAuth Providers (Production Ready)
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
GITHUB_CLIENT_ID="your_github_client_id"
GITHUB_CLIENT_SECRET="your_github_client_secret"

# Optional: Error Tracking
NEXT_PUBLIC_SENTRY_DSN="your_sentry_dsn"
SENTRY_AUTH_TOKEN="your_sentry_auth_token"
```

**Generate secure secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 🛠 Tech Stack

### Core Technologies
- **[Next.js 14.2](https://nextjs.org/)** - React framework with App Router
- **[TypeScript 5.0](https://www.typescriptlang.org/)** - Type-safe development
- **[Socket.IO 4.7](https://socket.io/)** - Real-time bidirectional communication
- **[PostgreSQL](https://www.postgresql.org/)** - Primary database
- **[Prisma 5.0](https://www.prisma.io/)** - Type-safe ORM

### Frontend
- **[Tailwind CSS 3.4](https://tailwindcss.com/)** - Utility-first styling
- **[React Hot Toast](https://react-hot-toast.com/)** - Toast notifications
- **[Canvas Confetti](https://www.npmjs.com/package/canvas-confetti)** - Celebration animations
- **[react-i18next](https://react.i18next.com/)** - Internationalization (English, Ukrainian)

### Backend & Services
- **[NextAuth.js 4.24](https://next-auth.js.org/)** - Authentication (Email + OAuth)
- **[Resend](https://resend.com/)** - Transactional emails (email verification)
- **[Sentry](https://sentry.io/)** - Error tracking and monitoring
- **[Bcrypt](https://www.npmjs.com/package/bcrypt)** - Password hashing

### Deployment (Production Setup)
- **Frontend**: [Vercel](https://vercel.com/) → boardly.online
- **Socket.IO Server**: [Render](https://render.com/) Web Service
- **Database**: [Supabase](https://supabase.com/) PostgreSQL
- **Email Service**: [Resend](https://resend.com/)
- **Error Tracking**: [Sentry](https://sentry.io/)

## 🏗 Architecture

### Dual-Server Design
```
┌─────────────────────────────────────────────────────────────┐
│                         Client                               │
│  Next.js Frontend (React + TypeScript + Tailwind)           │
└────────────┬─────────────────────────────┬──────────────────┘
             │ HTTP/API                    │ WebSocket
             │                             │
    ┌────────▼────────┐          ┌────────▼──────────┐
    │   Next.js App   │          │  Socket.IO Server  │
    │   (port 3000)   │          │   (port 3001)      │
    │                 │          │                    │
    │ • API Routes    │          │ • Real-time events │
    │ • SSR/SSG       │◄────────►│ • Room management  │
    │ • Auth          │  Notify  │ • Broadcasting     │
    │ • NextAuth      │ API Call │ • Presence sync    │
    └────────┬────────┘          └────────┬───────────┘
             │                            │
             └──────────┬─────────────────┘
                        │
                 ┌──────▼────────┐
                 │   PostgreSQL  │
                 │   (Supabase)  │
                 │                │
                 │ • Users (auth) │
                 │ • Lobbies      │
                 │ • Games        │
                 │ • Players      │
                 │ • Friends      │
                 └────────────────┘
```

### Game State Flow
```
Client Action → API Route → Database Update → Socket Notification → 
Socket Server Broadcast → All Clients in Room → UI Update
```

### Key Design Patterns
- **Game Engine Pattern** - Abstract base class (`GameEngine`) for all games
- **Custom Hooks Architecture** - Modular logic separation:
  - `useLobbyActions` - Lobby management (create, join, start)
  - `useGameActions` - Game moves (roll, hold, score)
  - `useSocketConnection` - WebSocket event handling
  - `useGameTimer` - Turn timer management
  - `useBotTurn` - AI opponent automation
- **Optimistic UX + Authoritative Reconcile** - Immediate feedback, then server-broadcast snapshot reconciliation with rollback on failed moves
- **Guest Session Handling** - Header-based authentication (`X-Guest-Id`, `X-Guest-Name`)

## 📁 Project Structure

```
Boardly/
├── app/                            # Next.js App Router
│   ├── api/                        # API Routes
│   │   ├── auth/                   # Authentication endpoints
│   │   ├── game/[gameId]/          # Game state management
│   │   ├── lobby/[code]/           # Lobby management
│   │   ├── user/                   # User operations
│   │   └── notify/                 # Socket notification webhook
│   ├── lobby/[code]/               # Active game lobby
│   │   ├── components/             # Lobby UI components
│   │   └── hooks/                  # Custom hooks (modular logic)
│   ├── games/                      # Game-specific routes
│   │   ├── yahtzee/                # Yahtzee game pages
│   │   └── spy/                    # Guess the Spy game pages
│   ├── profile/                    # User profile pages
│   └── auth/                       # Authentication pages
├── components/                     # Reusable React components
│   ├── Dice.tsx, DiceGroup.tsx     # Dice components
│   ├── Scorecard.tsx               # Yahtzee scorecard
│   ├── SpyVoting.tsx, SpyResults.tsx # Spy game components
│   ├── Chat.tsx                    # In-game chat
│   ├── GameResultsModal.tsx        # Game over screen
│   └── [others]/                   # Utility components
├── lib/                            # Core logic
│   ├── game-engine.ts              # Abstract game engine base
│   ├── games/                      # Game implementations
│   │   ├── yahtzee-game.ts         # Yahtzee class
│   │   └── spy-game.ts             # Guess the Spy class
│   ├── yahtzee.ts                  # Yahtzee rules & scoring
│   ├── spy-utils.ts                # Spy game utilities
│   ├── bot-executor.ts             # AI bot system
│   ├── rate-limit.ts               # API rate limiting
│   └── [other utilities]/          # Socket, auth, logging, etc.
├── prisma/                         # Database management
│   ├── schema.prisma               # Database schema
│   └── migrations/                 # Migration history
├── __tests__/                      # Test suite
│   ├── lib/                        # Business logic tests
│   └── lib/games/                  # Game logic tests (96%+ coverage)
├── messages/                       # i18n translations
│   ├── en.json                     # English messages
│   └── uk.json                     # Ukrainian messages
├── socket-server.ts                # Standalone Socket.IO server
├── render.yaml                     # Render deployment config
└── package.json                    # Dependencies and scripts
```

## 🎮 Gameplay

### Getting Started
1. Register an account or continue as guest
2. Create a lobby with custom settings (name, password, player limit)
3. Share lobby code or invite link with other players (or add bots)
4. Start game when minimum 2 players have joined

### Yahtzee Rules
1. Each turn allows up to 3 dice rolls
2. Click dice between rolls to hold/release them
3. Select a scoring category after rolling
4. Turn timer enforces 60-second limit per turn
5. Game ends when all players complete their scorecards

### Guess the Spy Rules
1. One player is the spy, others are citizens
2. Citizens try to identify the spy through discussion
3. Multiple rounds of voting and word guessing
4. Citizens win if they find the spy; spy wins if they remain hidden
5. Game ends when spy is found or time expires

### Automated Features
- Auto-roll: Dice automatically rolled if timer expires before first roll
- Auto-score: Best available category selected if timer expires
- AI players: Bots added via "Add Bot" button for single/multi-player games
- Bot AI: Probability-based decision making for intelligent gameplay

## 🚢 Deployment

### Live Demo
A production instance is available at [boardly.online](https://boardly.online) for demonstration purposes.

**Note on WebSocket Performance**: The live demo runs Socket.IO on Render's free tier. The server may take 30-60 seconds to wake up after inactivity. This is expected behavior and does not indicate an error.

### Production Stack
- **Frontend**: Vercel (Next.js)
- **Socket.IO Server**: Render (Node.js Web Service - Free Tier)
- **Database**: PostgreSQL (Supabase with connection pooler)
- **Email Service**: Resend (email verification)
- **Error Tracking**: Sentry (error monitoring)
- **OAuth Providers**: Google, GitHub
- **CDN/Static Assets**: Vercel global edge network

### Deploy Your Own Instance

#### Frontend (Vercel)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/KovalDenys1/Boardly)

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com/) and connect repository
3. Add environment variables (see `.env.example`)
4. Deploy!

#### Socket.IO Server (Render)

1. Create a new **Web Service** on [Render](https://render.com/)
2. Connect your repository
3. Build Command: `npm install && npm run db:generate`
4. Start Command: `npm run socket:start`
5. Add environment variables (at minimum: `DATABASE_URL`, `CORS_ORIGIN`, `NEXTAUTH_SECRET`)
6. Deploy!

**Free Tier Limitations**:
- Server spins down after 15 minutes of inactivity
- First connection may take 30-60 seconds to wake up
- 512MB RAM limit
- **Recommendation**: Upgrade to Starter plan ($7/month) for production use to eliminate spin-down

See `render.yaml` for full configuration details.

### Database Setup (Supabase)

1. Create project at [supabase.com](https://supabase.com/)
2. Get PostgreSQL connection string from **Settings** → **Database**
3. Set as `DATABASE_URL` environment variable
4. Run migrations: `npx prisma db push`

## 📚 Available Scripts

```bash
npm run dev            # Start Next.js dev server (port 3000)
npm run socket:dev     # Start Socket.IO server (port 3001)
npm run dev:all        # Start both servers concurrently

npm run build          # Build production Next.js app
npm start              # Start production Next.js server

npm run lint           # Run ESLint
npm run db:push        # Push Prisma schema to database
npm run db:studio      # Open Prisma Studio GUI
npm run db:generate    # Regenerate Prisma Client
```

## 🤝 Contributing

Contributions are welcome. Common areas for improvement include:
- Adding new games
- Bug fixes and optimizations
- UI/UX enhancements
- Documentation improvements
- Feature suggestions

### Contribution Process
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m 'Add feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Open a Pull Request

### Adding a New Game

Reference implementation: `lib/games/yahtzee-game.ts`

Requirements for new games:
1. Extend `GameEngine` base class
2. Implement required methods: `validateMove()`, `processMove()`, `getInitialGameData()`
3. Add game type to Prisma schema
4. Create lobby and game board UI components
5. Handle game-specific socket events

See `.github/copilot-instructions.md` for detailed development guidelines.

## 📖 Documentation

All project documentation is centralized in the `/docs` folder:

### Core Documentation
- **[README.md](README.md)** (You are here) - Project overview and getting started guide
- **[docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md)** - Complete project structure and organization guide
- **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)** - Contribution guidelines and development setup
- **[docs/TODO.md](docs/TODO.md)** - Development roadmap and feature planning
- **[docs/CHANGELOG.md](docs/CHANGELOG.md)** - Version history and recent updates
- **[docs/YAHTZEE_QA_CHECKLIST.md](docs/YAHTZEE_QA_CHECKLIST.md)** - QA testing checklist for Yahtzee
- **[.github/copilot-instructions.md](.github/copilot-instructions.md)** - AI agent development instructions

### Community Standards
- **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** - Community guidelines and behavior expectations
- **[SECURITY.md](SECURITY.md)** - Security policy and vulnerability reporting
- **[LICENSE](LICENSE)** - MIT License

### Issue & PR Templates
- **Bug Reports** - Structured bug reporting with environment details
- **Feature Requests** - Guided feature proposal submissions
- **Game Requests** - Specific template for suggesting new games
- **Pull Request Template** - Comprehensive PR checklist

## 🎯 Roadmap

### ✅ Completed (Live in Production - Jan 2026)
- ✅ Yahtzee multiplayer game with AI bots
- ✅ Real-time Socket.IO communication
- ✅ Authentication (Email, Google, GitHub OAuth)
- ✅ Guest mode for unauthenticated access
- ✅ AI opponents with probability-based decision logic
- ✅ Turn timer system (60 seconds) with auto-actions
- ✅ In-game chat with typing indicators
- ✅ Sound effects and celebration animations
- ✅ Internationalization (English, Ukrainian)
- ✅ Friend system with invite links
- ✅ Game history and statistics
- ✅ Rate limiting and security

### 🔄 In Progress (Q1 2026)
- 🕵️ **Guess the Spy** - Social deduction game (active development)
  - Hidden role mechanics
  - Discussion and voting rounds
  - Real-time word guessing

### 📋 Next Priority
- ♟️ Chess (classical chess with AI opponent) - Q1 2026
- 🎴 Uno (card game) - Q2 2026
- 🏆 Leaderboards and achievements
- 💰 Premium subscriptions (Stripe)
- 📱 Progressive Web App (PWA)

### 🎯 Future Enhancements
- 🎮 Additional games (Connect Four, Battleship, Codenames)
- 🏅 Tournament mode
- 📊 Advanced statistics dashboard
- 🤝 Spectator mode
- 🔊 Voice chat integration
- 💾 Game replay system
- 🎪 Achievements and badges

## � Documentation

Comprehensive documentation is available in the `/docs` directory:

### Getting Started
- **[Multi-Machine Setup Guide](./docs/MULTI_MACHINE_SETUP.md)** - Work seamlessly across multiple computers
- **[Contributing Guide](./docs/CONTRIBUTING.md)** - How to contribute to the project
- **[Production Deployment](./docs/PRODUCTION_DEPLOY_GUIDE.md)** - Deploy to production environments

### Development
- **[VSCode Configuration](./.vscode/README.md)** - IDE setup and MCP integration
- **[WebSocket Documentation](./docs/WEBSOCKET.md)** - Real-time communication patterns
- **[Game Engine Architecture](./docs/GAME_SETTINGS_ARCHITECTURE.md)** - How games are structured
- **[Testing Strategy](./docs/CONTRIBUTING.md#testing)** - Unit and integration tests

### Features
- **[Friend System API](./docs/FRIEND_SYSTEM_API.md)** - Social features implementation
- **[Guest Mode](./docs/GUEST_MODE.md)** - Anonymous player support
- **[Turn Timer](./docs/TURN_TIMER_SUMMARY.md)** - Timer system implementation
- **[Bot System](./lib/bots/README.md)** - AI opponent architecture

### Reference
- **[Changelog](./docs/CHANGELOG.md)** - Version history and changes
- **[TODO Roadmap](./docs/TODO.md)** - Current priorities and future plans
- **[Issue Workflow](./docs/ISSUE_WORKFLOW.md)** - Development process

For complete documentation index, see [docs/README.md](./docs/README.md).

## �📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Denys Koval**  
- GitHub: [@KovalDenys1](https://github.com/KovalDenys1)
- Website: [boardly.online](https://boardly.online)
- Email: kovaldenys@icloud.com

## 🙏 Acknowledgments

This project uses the following open-source technologies:

- [Next.js](https://nextjs.org/) - React framework
- [Socket.IO](https://socket.io/) - Real-time communication
- [Tailwind CSS](https://tailwindcss.com/) - CSS framework
- [Prisma](https://www.prisma.io/) - Database ORM
- [NextAuth.js](https://next-auth.js.org/) - Authentication
- [Supabase](https://supabase.com/) - PostgreSQL hosting
- [Vercel](https://vercel.com/) - Deployment platform
