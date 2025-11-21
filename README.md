# 🎮 Boardly - Multiplayer Board Games Platform

> A real-time multiplayer platform for playing classic board games with friends online

**Boardly** is a web-based multiplayer gaming platform where you can enjoy various board games with friends in real-time. Play Yahtzee, Chess, and more games with real-time synchronization and AI opponents.

🌐 **Live Demo**: [boardly.online](https://boardly.online)

## 🚀 Project Status

**Current Stage**: Production Ready  
**Available Games**: Yahtzee, Chess  
**Planned Games**: Guess the Spy, and more casual multiplayer games

## ✨ Features

### Games
- 🎲 **Yahtzee** - Classic dice game with real-time multiplayer
- ♟️ **Chess** - Strategic board game with full rule implementation
- 🤖 **AI Opponents** - Practice against intelligent bots

### Platform Features
- 🔐 **Authentication System** - Email/password registration and login with email verification
- 👤 **User Profiles** - Customizable usernames and profile management
- 👻 **Guest Access** - Play without creating an account
- 💬 **In-game Chat** - Communicate with other players during games
- 👥 **Lobby System** - Create or join game rooms with unique codes
- 🔗 **Invite Links** - Share lobby codes to invite friends
- ⏱️ **Turn Timer** - Time limits with visual indicators
- 🏆 **Automatic Scoring** - Real-time score calculation
- 📱 **Responsive Design** - Optimized for desktop and mobile
- 🔊 **Sound Effects** - Interactive audio feedback

## 🛠 Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) with App Router
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Real-time**: [Socket.IO](https://socket.io/)
- **Database**: [PostgreSQL](https://www.postgresql.org/) with [Prisma ORM](https://www.prisma.io/)
- **Auth**: [NextAuth.js](https://next-auth.js.org/)
- **Email**: [Resend](https://resend.com/)
- **Hosting**: 
  - Frontend: [Vercel](https://vercel.com/)
  - WebSocket: [Render](https://render.com/)
  - Database: Any PostgreSQL provider (e.g., Render, Railway, Supabase)

## 🚀 Deployment

### Quick Deploy

1. **Database Setup (PostgreSQL)**:
   ```bash
   # Set DATABASE_URL in .env
   npm install
   npx prisma migrate deploy
   ```

2. **WebSocket Server (Render)**:
   - Deploy `socket-server.ts` as a Node.js service
   - Set environment variables (DATABASE_URL, JWT_SECRET, etc.)
   - Use provided `render.yaml` for configuration

3. **Frontend (Vercel)**:
   - Connect your GitHub repository to Vercel
   - Set environment variables
   - Deploy automatically on push

## 🏃 Local Development

**Start the Next.js development server:**
```bash
npm run dev
```

**Start the Socket.IO server (in a separate terminal):**
```bash
npm run socket:dev
```


## 🎯 Roadmap

### Immediate Focus
- 🎨 **UI/UX Improvements** - Enhanced visual design and user experience
- 🕵️ **Guess the Spy Game** - Social deduction party game
- 🎲 **Additional Casual Games** - More lightweight games suitable for online play

### Future Plans
- 📊 **Player Statistics** - Track wins, games played, and achievements
- 🏆 **Leaderboards** - Global and friend rankings
- 🌐 **Internationalization** - Multi-language support
- 🎮 **More Game Modes** - Variations and tournament modes
- 📱 **Progressive Web App** - Installable mobile experience
- 🤝 **Community Contributions** - Open platform for developers to add their own games

## 📋 Prerequisites

Before running this project, ensure you have:

- **Node.js** 18 or higher
- **PostgreSQL** database (or Supabase account)
- **npm** or **yarn** package manager

## 🚀 Getting Started

### 1. Clone and Install

```bash
git clone https://github.com/KovalDenys1/Boardly.git
cd Boardly
npm install
```

### 2. Environment Configuration

**📝 See detailed setup guide:** [docs/ENVIRONMENT_SETUP.md](docs/ENVIRONMENT_SETUP.md)

**Quick setup:**
```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

**Required variables:**
```env
# Database
DATABASE_URL="postgresql://username:password@host:port/database"

# NextAuth
NEXTAUTH_SECRET="your-secret-key-min-32-characters"
NEXTAUTH_URL="http://localhost:3000"

# Email (if using email features)
EMAIL_SERVER="smtp://username:password@smtp.example.com:587"
EMAIL_FROM="noreply@example.com"
```

**Generate a secure secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Database Setup

Run Prisma migrations to create the database schema:

```bash
npx prisma db push
```

To view your database in Prisma Studio:
```bash
npx prisma studio
```

### 4. Run Development Server

Start the development server with Socket.IO support:

```bash
npm run dev
```

The application will be available at **http://localhost:3000**

## 🎮 How to Play Yahtzee

1. **Create an Account** or play as a guest at `/auth/register`
2. **Create a Lobby** - Set game name, optional password, and maximum players
3. **Invite Friends** - Share the unique lobby code or copy the invite link
4. **Start the Game** - Lobby owner can start when 2+ players have joined
5. **Play Your Turn**:
   - Roll the dice (up to 3 rolls per turn)
   - Click on dice to hold/unhold them between rolls
   - Select a scoring category from the scorecard
   - Complete your turn within 60 seconds
6. **Win the Game** - Player with the highest total score when all categories are filled wins!

## 🔐 Authentication Options

The platform currently supports:
- **Email/Password** - Traditional registration and login
- **Guest Access** - Quick play without account creation

_OAuth providers (Google, GitHub) may be added in future versions._

## 📁 Project Structure

```
Boardly/
├── app/                      # Next.js App Router
│   ├── api/                  # API Routes
│   │   ├── auth/             # Authentication endpoints
│   │   ├── lobby/            # Lobby management
│   │   ├── game/             # Game state management
│   │   └── user/             # User profile endpoints
│   ├── auth/                 # Authentication pages
│   ├── games/                # Games directory and lobbies
│   ├── lobby/                # Lobby pages
│   ├── profile/              # User profile page
│   └── page.tsx              # Landing page
├── components/               # Reusable React components
│   ├── Chat.tsx              # In-game chat
│   ├── Dice.tsx              # Single dice component
│   ├── DiceGroup.tsx         # Dice group with roll logic
│   ├── Scorecard.tsx         # Yahtzee scorecard
│   ├── PlayerList.tsx        # Player list display
│   └── Header.tsx            # Application header
├── contexts/                 # React Context providers
│   └── ToastContext.tsx      # Toast notification system
├── hooks/                    # Custom React hooks
│   └── useConfetti.ts        # Confetti animation hook
├── lib/                      # Utility functions and logic
│   ├── auth.ts               # Authentication helpers
│   ├── db.ts                 # Prisma database client
│   ├── game-engine.ts        # Core game engine
│   ├── lobby.ts              # Lobby management utilities
│   ├── yahtzee.ts            # Yahtzee game logic
│   ├── sounds.ts             # Sound effects manager
│   ├── games/                # Individual game implementations
│   └── validation/           # Input validation schemas
├── prisma/
│   ├── schema.prisma         # Database schema definition
│   └── migrations/           # Database migrations
├── public/
│   └── sounds/               # Sound effect files
├── types/                    # TypeScript type definitions
├── socket-server.ts          # Standalone Socket.IO server
└── package.json              # Project dependencies and scripts
```

## 🚀 Deployment

This project deploys to **Vercel** (frontend) with **PostgreSQL** database and **Render** (Socket.IO server).

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/KovalDenys1/Boardly)

**Manual deployment:**

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com/) and sign in
3. Click **"Add New Project"**
4. Import your `Boardly` repository
5. Add environment variables (see below)
6. Click **"Deploy"**

**Required Environment Variables:**
```bash
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=https://your-project.vercel.app
NEXT_PUBLIC_SOCKET_URL=https://your-project.vercel.app
```

**Optional (OAuth):**
```bash
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

📖 **Detailed deployment guide:** See [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md)

### Setup Supabase Database

1. Create a project at [Supabase](https://supabase.com/)
2. Get your PostgreSQL connection string from **Settings** → **Database**
3. Use the connection string in your `DATABASE_URL` environment variable
4. Run migrations: `npx prisma db push`

📖 **Database migration guide:** See [MIGRATE_QUICK_START.md](MIGRATE_QUICK_START.md)


## 📚 API Overview

The application provides REST API endpoints for game and user management:

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - User login
- `POST /api/auth/guest` - Create guest session
- `POST /api/auth/verify-email` - Email verification
- `POST /api/auth/forgot-password` - Password reset request
- `POST /api/auth/reset-password` - Reset password with token

### Lobby Management
- `GET /api/lobby` - List all active lobbies
- `POST /api/lobby` - Create a new game lobby
- `GET /api/lobby/[code]` - Get specific lobby details
- `POST /api/lobby/[code]` - Join a lobby
- `POST /api/lobby/[code]/leave` - Leave a lobby

### Game
- `GET /api/game/[gameId]/state` - Retrieve current game state
- `POST /api/game/create` - Create a new game session

### User
- `GET /api/user/profile` - Get user profile information
- `PATCH /api/user/profile` - Update user profile (username, etc.)

### WebSocket Events (Socket.IO)
Real-time events are handled through Socket.IO for immediate game updates, chat messages, and player actions.

## 🤝 Contributing

This project welcomes contributions! Whether you want to:
- 🎮 Add a new game
- 🐛 Fix bugs
- 🎨 Improve UI/UX
- 📝 Enhance documentation
- ✨ Suggest new features

Feel free to open an issue or submit a pull request!

### Contributing Guidelines

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes and commit: `git commit -m 'Add some feature'`
4. Push to your branch: `git push origin feature/your-feature-name`
5. Open a Pull Request with a clear description

### Adding a New Game

Interested in adding your own game? Check out the existing game implementations in `lib/games/` for reference. Each game should:
- Implement core game logic as a separate module
- Define game state types
- Create corresponding Socket.IO event handlers
- Add UI components for the game board/interface

## 🎓 Learning Resources

This project uses several modern web technologies. If you're learning, here are helpful resources:

- [Next.js Documentation](https://nextjs.org/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Socket.IO Documentation](https://socket.io/docs/)
- [Prisma Guides](https://www.prisma.io/docs/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Denys Koval**  
- GitHub: [@KovalDenys1](https://github.com/KovalDenys1)

This project serves as both a learning journey and a portfolio piece, demonstrating real-time web application development with modern technologies.

## 🙏 Acknowledgments

Special thanks to the amazing open-source projects that make this possible:

- [Next.js](https://nextjs.org/) - The React framework for production
- [Socket.IO](https://socket.io/) - Real-time bidirectional event-based communication
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [NextAuth.js](https://next-auth.js.org/) - Authentication for Next.js
- [Supabase](https://supabase.com/) - Open source Firebase alternative
- [Vercel](https://vercel.com/) - Platform for frontend frameworks and static sites

Built with ❤️ and lots of coffee ☕

---

⭐ **Star this repository** if you find it interesting or useful!

💬 **Questions or suggestions?** Feel free to open an issue!

🎮 **Want to play?** [Visit the live demo](#) _(coming soon)_
