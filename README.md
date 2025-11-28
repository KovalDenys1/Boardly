# 🎮 Boardly - Real-Time Multiplayer Board Games Platform

> Play classic board games with friends online in real-time

**Boardly** is a modern web-based multiplayer gaming platform where you can enjoy classic board games with friends in real-time. Built with Next.js, TypeScript, and Socket.IO for seamless multiplayer experiences.

🌐 **[Play Now at boardly.online](https://boardly.online)** 🎮

![Boardly Homepage](https://i.imgur.com/qgTmUWd.png)
*Beautiful gradient UI with real-time multiplayer capabilities*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black.svg)](https://nextjs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-green.svg)](https://socket.io/)
[![Prisma](https://img.shields.io/badge/Prisma-5.0-2D3748.svg)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 🎯 Current Status

**Stage**: ✅ **Live in Production**  
**Website**: [boardly.online](https://boardly.online)  
**Available Games**: Yahtzee (fully implemented)  
**In Development**: Chess  
**Planned**: Guess the Spy, Uno, and more casual multiplayer games

---

## 🚀 Try It Now!

Visit **[boardly.online](https://boardly.online)** to:
- 🎮 Play Yahtzee online with friends
- 👻 Quick start as a guest (no signup required)
- 🔐 Sign in with Google, GitHub, or Email
- 🤖 Practice against AI opponents
- 💬 Chat with other players in real-time

**No installation needed** - just open the link and start playing!

### 🏆 What Makes Boardly Special?

- **True Real-Time Experience** - Powered by Socket.IO for instant synchronization
- **Smart AI Opponents** - Probability-based bot that makes intelligent decisions
- **No Account Required** - Guest mode lets you play immediately
- **Production-Grade Stack** - Next.js, TypeScript, PostgreSQL, deployed on Vercel + Render
- **Beautiful UI** - Modern gradient design with smooth animations and dark mode
- **Intelligent Auto-Play** - Timer fallbacks ensure games never stall

---

## ✨ Key Features

### 🎲 Games
- **Yahtzee** - Classic dice game with full rules implementation
  - Real-time multiplayer (2-4 players)
  - Smart AI opponents with probability-based decision making
  - Auto-scoring with intelligent category selection
  - Turn timer with visual countdown (60s)
  - Celebration animations for special rolls (Yahtzee, Full House, Straights)
  - Roll history tracking

### 🔐 Authentication & Users
- **Multiple Access Options**
  - Email/password registration with email verification (Resend)
  - Guest mode - play instantly without signup
  - OAuth login via Google & GitHub
  - Profile customization (username, avatar)
- **Session Management** - Secure JWT-based authentication with NextAuth.js

### 🎮 Gameplay Features
- **Lobby System**
  - Create private/public lobbies with unique codes
  - Password protection for private games
  - Easy invite links for friends
  - Real-time player list updates
- **In-Game Features**
  - Real-time chat with typing indicators
  - Turn timer with visual warnings (last 10 seconds)
  - Automatic turn progression
  - Live score updates
  - Sound effects and celebrations
  - Bot opponent automation

### 💻 Technical Features
- **Dual-Server Architecture** - Next.js (HTTP/API) + standalone Socket.IO server
- **Real-Time Sync** - Instant game state updates via WebSockets
- **Responsive Design** - Optimized for desktop, tablet, and mobile
- **Rate Limiting** - Built-in API protection
- **Error Tracking** - Sentry integration (optional)
- **Dark Mode** - System-aware theme switching

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
JWT_SECRET="your-jwt-secret-min-32-characters"

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
    └────────┬────────┘          └────────┬───────────┘
             │                            │
             └──────────┬─────────────────┘
                        │
                 ┌──────▼────────┐
                 │   PostgreSQL  │
                 │   Database    │
                 │               │
                 │ • Users       │
                 │ • Lobbies     │
                 │ • Games       │
                 │ • Players     │
                 └───────────────┘
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
- **Optimistic Updates** - Immediate UI feedback with server sync
- **Guest Session Handling** - Header-based authentication (`X-Guest-Id`, `X-Guest-Name`)

## 📁 Project Structure

```
Boardly/
├── app/                            # Next.js App Router
│   ├── api/                        # API Routes
│   │   ├── auth/                   # Authentication endpoints
│   │   ├── game/[gameId]/          # Game state management
│   │   ├── lobby/[code]/           # Lobby management
│   │   └── user/profile/           # User profile
│   ├── lobby/[code]/               # Active game lobby
│   │   ├── components/             # Lobby UI components
│   │   └── hooks/                  # Custom hooks (6 modular files)
│   └── games/yahtzee/lobbies/      # Yahtzee lobby browser
├── components/                     # Reusable React components
│   ├── Dice.tsx, DiceGroup.tsx     # Dice components
│   ├── Scorecard.tsx               # Yahtzee scorecard
│   ├── Chat.tsx                    # In-game chat
│   └── YahtzeeResults.tsx          # Game over screen
├── lib/                            # Core logic
│   ├── game-engine.ts              # Abstract game engine
│   ├── games/yahtzee-game.ts       # Yahtzee implementation
│   ├── yahtzee.ts                  # Game rules & scoring
│   ├── yahtzee-bot.ts              # AI opponent logic
│   ├── rate-limit.ts               # API rate limiting
│   └── socket-url.ts               # Socket URL helpers
├── prisma/schema.prisma            # Database schema
├── socket-server.ts                # Standalone Socket.IO server
└── package.json                    # Dependencies and scripts
```

## 🎮 How to Play

### Getting Started
1. **Sign Up** or **Play as Guest** at `/auth/register`
2. **Create a Lobby** - Set game name, password (optional), max players
3. **Invite Friends** - Share the unique lobby code or copy invite link
4. **Start Game** - Lobby creator can start when 2+ players joined

### Yahtzee Gameplay
1. **Roll Dice** - Up to 3 rolls per turn
2. **Hold Dice** - Click dice between rolls to keep them
3. **Score** - Choose a category after rolling (rollsLeft < 3)
4. **Turn Timer** - Complete your turn within 60 seconds
5. **Win** - Highest total score when all categories are filled!

### Special Features
- **Auto-Roll** - If timer expires before rolling, dice roll automatically
- **Auto-Score** - If timer expires, best available category selected automatically
- **Celebrations** - Yahtzee (50 points), Straights, Full House trigger animations
- **Bot Opponents** - AI automatically added if starting with <2 players

## 🚢 Deployment

**🎉 Live Production**: [boardly.online](https://boardly.online)

This project is currently deployed and running in production:
- **Frontend**: Vercel → [boardly.online](https://boardly.online)
- **Socket.IO Server**: Render (Node.js Web Service)
- **Database**: PostgreSQL on Supabase
- **Email**: Resend (transactional emails)
- **Error Tracking**: Sentry (configured and active)
- **OAuth Providers**: Google & GitHub (fully configured)

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
3. Build Command: `npm install`
4. Start Command: `node socket-server.ts`
5. Add environment variables
6. Deploy!

See `render.yaml` for configuration details.

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

Contributions are welcome! Whether you want to:
- 🎮 Add a new game
- 🐛 Fix bugs
- 🎨 Improve UI/UX
- 📝 Enhance documentation
- ✨ Suggest features

**How to contribute:**
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m 'Add feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Open a Pull Request

### Adding a New Game

Check out `lib/games/yahtzee-game.ts` for reference. Each game should:
1. Extend `GameEngine` base class
2. Implement `validateMove()`, `processMove()`, `getInitialGameData()`
3. Add game type to Prisma schema
4. Create lobby UI and game board components
5. Handle game-specific socket events

See `.github/copilot-instructions.md` for detailed development guidelines.

## 📖 Documentation

All project documentation is centralized in the `/docs` folder:

- **[README.md](README.md)** (You are here) - Project overview and getting started guide
- **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)** - Contribution guidelines and development setup
- **[docs/TODO.md](docs/TODO.md)** - Development roadmap and feature planning
- **[docs/CHANGELOG.md](docs/CHANGELOG.md)** - Version history and recent updates
- **[docs/YAHTZEE_QA_CHECKLIST.md](docs/YAHTZEE_QA_CHECKLIST.md)** - QA testing checklist for Yahtzee
- **[.github/copilot-instructions.md](.github/copilot-instructions.md)** - AI agent development instructions

## 🎯 Roadmap

### ✅ Completed (Live in Production)
- Yahtzee multiplayer game
- Real-time Socket.IO communication
- Authentication (Email, Google, GitHub OAuth)
- Guest mode
- AI opponents
- Turn timer with auto-scoring
- In-game chat
- Sound effects and celebrations

### 🔄 In Progress
- ♟️ Chess implementation
- 📧 Email notifications
- 📊 Analytics integration

### 📋 Next Up
- 🕵️ Guess the Spy social deduction game
- 🎴 Uno card game
- 🏆 Leaderboards and achievements
- 💰 Premium subscriptions (Stripe)
- 📱 Progressive Web App (PWA)

### 🎯 Future
- 🌐 Internationalization (i18n)
- 👥 Friend system
- 🎮 More games (Connect Four, Battleship, Codenames)
- 🏅 Tournament mode
- 📈 Advanced statistics dashboard
- 🎮 Custom game creator
- 🤝 Spectator mode
- 🔊 Voice chat integration
- 🎪 Tournament system

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Denys Koval**  
- GitHub: [@KovalDenys1](https://github.com/KovalDenys1)
- Email: kovaldenys@icloud.com

This project serves as both a learning journey and portfolio piece, demonstrating real-time web application development with modern technologies.

## 🙏 Acknowledgments

Special thanks to the amazing open-source projects:

- [Next.js](https://nextjs.org/) - The React framework
- [Socket.IO](https://socket.io/) - Real-time communication
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [NextAuth.js](https://next-auth.js.org/) - Authentication
- [Supabase](https://supabase.com/) - PostgreSQL hosting
- [Vercel](https://vercel.com/) - Deployment platform

Built with ❤️ and lots of cacao ☕

---

## 🌟 Production Features

This project is live at [boardly.online](https://boardly.online) with:
- ✅ Real-time multiplayer with WebSocket connections (Socket.IO on Render)
- ✅ Multiple authentication methods (Email, Google, GitHub, Guest)
- ✅ Email verification system (Resend)
- ✅ AI opponents with probability-based decision making
- ✅ Responsive design for desktop, tablet, and mobile
- ✅ Automatic turn timer with intelligent fallback actions
- ✅ Sound effects and celebration animations
- ✅ Real-time chat with typing indicators
- ✅ Error tracking and monitoring (Sentry)
- ✅ PostgreSQL database (Supabase) with Prisma ORM
- ✅ Rate limiting and API protection
- ✅ HTTPS and secure connections

---

⭐ **[Play Now at boardly.online](https://boardly.online)** ⭐

**Star this repository** if you find it interesting or useful!

💬 **Questions?** Open an issue or reach out!

🎮 **Want to contribute?** PRs are welcome!
