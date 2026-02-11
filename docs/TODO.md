# Boardly Development Roadmap

> ⚠️ **Note**: This file is now legacy. For current task tracking, see **[GitHub Issues](https://github.com/KovalDenys1/Boardly/issues)** and **[GitHub Projects](https://github.com/KovalDenys1/Boardly/projects)**.
> 
> **New Workflow**: See [ISSUE_WORKFLOW.md](ISSUE_WORKFLOW.md) for how to work with Issues.

> Goal: Build a production-ready multiplayer board games platform with engaging casual games

## 🎯 Current Status (February 11, 2026)

**✅ LIVE IN PRODUCTION**: [boardly.online](https://boardly.online)

### Completed Milestones

#### Core Platform (Nov-Dec 2025)
- ✅ Yahtzee fully implemented and deployed
- ✅ Guess the Spy fully implemented and deployed
- ✅ Real-time multiplayer with Socket.IO dual-server architecture
- ✅ Authentication (Email, Google, GitHub OAuth)
- ✅ Guest mode for instant play
- ✅ Smart AI bot opponents with probability-based decisions
- ✅ Production infrastructure (Vercel + Render + Supabase)
- ✅ Error tracking with Sentry (optional, quota-saving)
- ✅ Email service with Resend
- ✅ Turn timer with auto-scoring and persistence
- ✅ In-game chat system with scroll controls and typing indicators
- ✅ Fully responsive mobile UI with tabs
- ✅ Sound effects and celebrations
- ✅ Project cleanup and English-only codebase
- ✅ Comprehensive documentation
- ✅ Internationalization (English/Ukrainian)
- ✅ Unit testing (131+ tests passing, 80-96% core coverage)
- ✅ WebSocket reconnection with exponential backoff
- ✅ Analytics integration (Vercel Analytics + Speed Insights)
- ✅ Socket.IO and database monitoring
- ✅ Performance optimizations (code splitting, caching)
- ✅ SEO with Open Graph images
- ✅ Game History feature with filters and pagination
- ✅ Socket.IO reliability improvements for Render free tier
- ✅ Abandoned games cleanup cron job
- ✅ Lobby improvements (filters, search, sorting, stats UI)
- ✅ Stuck games auto-abandon fix (when humans leave with bots)
- ✅ Friend system (friend requests, friend codes, friend list UI)
- ✅ User Profile page (avatar, stats, settings, account management)

#### Q1 2026 (Jan-Feb)
- ✅ Mobile UI major improvements (dynamic viewport height, iOS fixes) - January 2026
- ✅ Bot system modular refactoring (separate Bots table, extensible architecture) - February 2026
- ✅ Database migration to plural table names (Users, Games, Lobbies, etc.) - February 2026
- ✅ Game status sync fix for Spy game - February 2026
- ✅ Security hardening (rate limiting, CSRF protection)

### 🚧 In Progress (Week of Feb 10-16, 2026)
- 🔄 Row Level Security (RLS) migration fix - migration needs update for plural table names
- 🔄 Planning next game implementation from coming soon list

## 📅 Development Timeline

### ✅ Completed Phases (Nov 2025 - Feb 2026)

#### Phase 1: Foundation (Nov 19 - Dec 5, 2025)
- ✅ Core multiplayer infrastructure (Socket.IO + Next.js)
- ✅ Yahtzee game fully implemented
- ✅ Bot AI system with probability-based decisions
- ✅ Authentication and guest mode
- ✅ Production deployment (Vercel + Render + Supabase)
- ✅ Turn timer, chat, mobile responsive UI
- ✅ Internationalization (EN/UK)
- ✅ Analytics and monitoring

#### Phase 2: Expansion (Dec 8-14, 2025)
- ✅ Guess the Spy game fully implemented
- ✅ Lobby improvements (filters, search, stats)
- ✅ Friend system (requests, codes, UI)
- ✅ User profile pages with settings
- ✅ Game history with pagination

#### Phase 2.5: Q1 2026 Improvements (Jan-Feb 2026)
- ✅ Mobile UI overhaul (iOS fixes, dynamic viewport)
- ✅ Bot system modular refactoring
- ✅ Database schema migration (plural tables)
- ✅ Game status sync fixes


### 🚧 Current Sprint (Week of Feb 9-15, 2026)

**Focus**: Security & Infrastructure Polish

#### Week Goals (Migrated to GitHub Issues)
- [ ] Fix RLS migration for plural table names → [#33](https://github.com/KovalDenys1/Boardly/issues/33) **[CRITICAL]**
- [ ] Update copilot-instructions.md → [#34](https://github.com/KovalDenys1/Boardly/issues/34) **[HIGH]**
- [ ] Test RLS policies in staging environment (part of #33)
- [ ] Review and update security documentation (part of #33)

### 📋 Upcoming Sprints (Q1 2026)

#### Week of Feb 16-22: Simple Game Implementation #1
- [ ] Choose first game from coming soon list (likely Tic-Tac-Toe or Rock-Paper-Scissors)
- [ ] Tic-Tac-Toe implementation → [#35](https://github.com/KovalDenys1/Boardly/issues/35) **[GAME]**
- [ ] Rock Paper Scissors implementation → [#36](https://github.com/KovalDenys1/Boardly/issues/36) **[GAME]**
- [ ] QA testing for Spy game → [#37](https://github.com/KovalDenys1/Boardly/issues/37) **[HIGH]**

#### Week of Feb 23-29: Simple Game Implementation #2
- [ ] Memory card game → [#40](https://github.com/KovalDenys1/Boardly/issues/40) **[GAME]**
- [ ] Polish and bug fixes based on feedback
#### Week of Mar 2-8: Polish & Bug Fixes
- [ ] Address user feedback on new games
- [ ] Performance optimization
- [ ] Mobile UI testing on new games
- [ ] Update documentation
- [ ] Test suite maintenance

#### Week of Mar 9-15: User Experience Improvements
- [ ] Improve onboarding flow for new users
- [ ] Add tutorial mode for games
- [ ] Enhanced statistics on profile page
- [ ] Notification system improvements

#### Week of Mar 16-22: Social Features Enhancement
- [ ] Private game invites via friend system
- [ ] In-game player profiles (quick view)
- [ ] Recent players list
- [ ] Block/report functionality

#### Week of Mar 23-29: Q1 Wrap-up
- [ ] End-to-end testing all games
- [ ] Performance benchmarking
- [ ] Documentation refresh
- [ ] Plan Q2 roadmap

### 🔮 Future Phases

#### Q2 2026 (Apr-Jun): More Games + Advanced Features
- Implement 2-3 more games from coming soon list
- Spectator mode
- Game replay functionality
- Leaderboards and achievements
- PWA support for mobile installation

#### Q3 2026 (Jul-Sep): Monetization
*Deferred from December 2025 - focus on games and user base first*
- Design premium features and pricing tiers
- Stripe integration and checkout flow
- Billing system (receipts, subscriptions)
- Premium features (ad-free, custom themes, advanced stats)
- Payment flow testing

#### Q4 2026: Scale & Community
- Tournament system
- Advanced matchmaking
- Community features (Discord/Telegram integration)
- Email notifications for game events
- Admin dashboard
- Load testing and scaling infrastructure

## 🎮 Game Development Status

### ✅ Live Games (Production)

#### Yahtzee (Complete)
- **Status**: Live at [boardly.online/games/yahtzee/lobbies](https://boardly.online/games/yahtzee/lobbies)
- **Players**: 2-4
- **Difficulty**: Medium
- **Features**: 
  - Real-time multiplayer with Socket.IO sync
  - AI bot opponents with probability-based decisions
  - Turn timer with auto-scoring (30-180 seconds)
  - Sound effects and celebrations
  - Real-time chat with typing indicators
  - Roll history tracking
  - Fully responsive mobile UI
  - Internationalized (EN/UK)
  - Comprehensive test coverage (80%+)
- **Game Engine**: `lib/games/yahtzee-game.ts`
- **Tests**: `__tests__/lib/games/yahtzee-game.test.ts` (20+ tests)

#### Guess the Spy (Complete)
- **Status**: Live at [boardly.online/games/spy/lobbies](https://boardly.online/games/spy/lobbies)
- **Players**: 3-10
- **Difficulty**: Easy-Medium
- **Features**:
  - Random role assignment (Spy vs Regular players)
  - 24 locations with multiple categories
  - Question/answer rounds with discussion
  - Voting system to identify spy
  - Multi-round support with score tracking
  - Spy reveal animations and results
  - Chat for questioning phase
  - Fully responsive mobile UI
  - Internationalized (EN/UK)
- **Game Engine**: `lib/games/spy-game.ts`
- **Tests**: `__tests__/lib/games/spy-game.test.ts` (15+ tests)
- **Documentation**: `docs/SPY_GAME_IMPLEMENTATION.md`, `docs/GUESS_THE_SPY_DESIGN.md`

### 🎯 Coming Soon Games (Roadmap)

*Games listed on /games page awaiting implementation. Ordered by complexity (easiest first).*

#### High Priority (Q1 2026 - Simple Implementation)

1. **Tic-Tac-Toe** (❌)
   - Players: 2
   - Difficulty: Easy
   - Description: "Simple and fast game. Get three in a row to win!"
   - Estimated: 1 sprint (1 week)
   - Notes: Great first game to implement, simple state machine

2. **Rock Paper Scissors** (✊)
   - Players: 2
   - Difficulty: Easy  
   - Description: "Classic quick game. Outsmart your opponent in three moves!"
   - Estimated: 1 sprint (1 week)
   - Notes: Simultaneous turn mechanics, best-of-3 or best-of-5

3. **Memory** (🧠)
   - Players: 2-4
   - Difficulty: Easy
   - Description: "Find all the matching pairs. Test your memory skills!"
   - Estimated: 1-2 sprints
   - Notes: Card grid generation, match detection, turn-based

#### Medium Priority (Q2 2026 - Moderate Complexity)

4. **Alias** (🗣️)
   - Players: 4-16
   - Difficulty: Medium
   - Description: "Explain words to your team without using the word itself!"
   - Estimated: 2-3 sprints
   - Notes: Requires word database, team mechanics, timer per round

5. **Anagrams** (🔀)
   - Players: 2-8
   - Difficulty: Medium
   - Description: "Rearrange the letters to find the hidden word!"
   - Estimated: 2 sprints
   - Notes: Word validation, letter pool generation, scoring system

6. **Words-Mines** (💣)
   - Players: 2-8  
   - Difficulty: Medium
   - Description: "Avoid the mines and guess the right words!"
   - Estimated: 2-3 sprints
   - Notes: Similar to Minesweeper + word guessing, complex grid logic

7. **Crocodile** (🐊)
   - Players: 3-12
   - Difficulty: Medium
   - Description: "Act out or draw the word for your team to guess!"
   - Estimated: 3-4 sprints
   - Notes: Team-based, drawing canvas integration (complex), word database

### ❌ Removed from Roadmap

- **Chess**: Removed due to high complexity (move validation, checkmate detection, AI complexity)
- **Uno**: Removed from near-term roadmap (complex card game mechanics)

## 🚀 Infrastructure Roadmap

### ✅ Q4 2025 - Q1 2026 (Complete)
- ✅ Vercel deployment for frontend (Next.js 14)
- ✅ Render deployment for Socket.IO server (standalone port 3001)
- ✅ Supabase PostgreSQL database with connection pooling
- ✅ Prisma ORM with plural table names migration (Feb 2026)
- ✅ Resend transactional emails (verification, password reset)
- ✅ Sentry error tracking (optional, quota-saving)
- ✅ OAuth providers (Google + GitHub)
- ✅ Vercel Analytics + Speed Insights
- ✅ Socket.IO monitoring with health checks
- ✅ Database query monitoring with Prisma middleware
- ✅ Cron jobs (cleanup guests, unverified accounts, abandoned games)
- ✅ Rate limiting on all API routes
- ✅ CSRF protection in middleware

### 🚧 Q1 2026 (Current - In Progress)
- 🔄 Row Level Security (RLS) - migration fix needed for plural tables
- 📋 Email notifications system for game invites
- 📋 PWA support (manifest, service worker, offline mode)

### 📋 Q2 2026 (Planned)
- 📋 Redis for caching and session management
- 📋 CDN for static assets (images, sounds, avatars)
- 📋 CI/CD pipeline improvements (automated testing in PRs)
- 📋 Database read replicas for performance
- 📋 Automated backups with point-in-time recovery

### 🔮 Q3-Q4 2026 (Future)
- 📋 Load balancing for Socket.IO (horizontal scaling)
- 📋 Advanced monitoring (uptime alerts, performance dashboards)
- 📋 Stripe payments integration (Q3 - for monetization)
- 📋 GraphQL API (if needed for mobile apps)

## 💰 Monetization Strategy

*Status: Deferred to Q3 2026 - Focus on building user base and adding more games first*

### Planned Tiers (Q3 2026)

#### Free Tier (Current - Everyone)
- Play all games
- No game limits
- All core features
- Ad-free (for now)

#### Premium ($4.99/month) - TBD Q3 2026
- All free features
- Custom themes and avatars
- Advanced statistics dashboard
- Priority matchmaking
- Exclusive badges
- Early access to new games
- Remove ads (if we add them)

#### Pro ($9.99/month) - TBD Q3 2026
- All Premium features
- Private tournaments
- Game replays and analysis
- Custom lobby branding
- API access (for developers)
- Priority support

### Implementation Timeline (Q3 2026)
- Week 1-2: Stripe integration, checkout flow, webhooks
- Week 3-4: Premium feature gating, subscription management
- Week 5-6: Billing dashboard, receipt generation
- Week 7-8: Testing payment flows, security review

## 📊 Success Metrics

### Current Status (February 11, 2026)
- 👥 Registered users: [Track in analytics]
- 🎮 Total games played: [Track in analytics]
- 📈 Daily active users: [Track in analytics]
- ⏱️ Average response time: <500ms (target met)
- ✅ Uptime: 99.9%+ on Vercel/Render
- 🎮 Available games: 2 (Yahtzee, Guess the Spy)

### Q1 2026 Goals (Jan-Mar)
- 🎯 500+ registered users
- 🎯 5,000+ games played
- 🎯 50+ daily active users
- 🎯 4+ available games (add 2 simple games)
- 🎯 Maintain <500ms avg response time
- 🎯 99.9%+ uptime

### Q2 2026 Goals (Apr-Jun)
- 🎯 1,500+ registered users
- 🎯 20,000+ games played
- 🎯 150+ daily active users
- 🎯 6+ available games
- 🎯 Player retention: 40%+ (7-day return rate)

### Q3 2026 Goals (Jul-Sep) - Monetization Launch
- 🎯 5,000+ registered users
- 🎯 50,000+ games played
- 🎯 300+ daily active users
- 🎯 25+ premium subscriptions
- 🎯 $250+ monthly recurring revenue (MRR)
- 🎯 4.5+ average user rating

## 🐛 Known Issues & Tech Debt

### 🔴 High Priority (Current Sprint - Feb 2026)

#### 1. Row Level Security (RLS) Migration Fix
- **Status**: ⚠️ Migration exists but needs update
- **Issue**: Migration `20260205000000_enable_rls/migration.sql` uses old singular table names (User, Game, Lobby)
- **Action Needed**:
  - Rewrite migration SQL to use plural table names (Users, Games, Lobbies, Players, etc.)
  - Test policies in staging with service role
  - Create missing documentation: `docs/RLS_CONFIGURATION.md`
  - Apply to production after thorough testing
- **Risk**: Database permission errors if applied as-is
- **Estimated Effort**: 3-5 days
- **Priority**: HIGH - security feature

#### 2. Update Copilot Instructions
- **Issue**: `copilot-instructions.md` claims RLS is "✅ complete" but it's not applied
- **Action**: Update documentation to reflect actual status
- **Estimated Effort**: 1 hour

### 🟡 Medium Priority (Q1-Q2 2026)

#### 3. Game Replay Functionality
- **Description**: Store and replay past games for learning/entertainment
- **Requirements**: Game state snapshots, replay viewer UI, storage optimization
- **Benefit**: Premium feature, helps players improve
- **Estimated Effort**: 2-3 sprints

#### 4. Player Statistics Dashboard
- **Description**: Advanced stats beyond basic game history (win rates, average scores, trends)
- **Requirements**: Analytics queries, charts with recharts/visx, caching
- **Benefit**: User engagement, premium feature
- **Estimated Effort**: 1-2 sprints

#### 5. Email Notifications for Game Invites
- **Description**: Notify users via email when invited to games
- **Requirements**: Notification preferences table, email templates, queue system
- **Status**: Resend integration exists for auth only
- **Estimated Effort**: 1 sprint

#### 6. Web Push Notifications
- **Description**: Browser push notifications for turn reminders, invites
- **Requirements**: Service worker, push notification API, user opt-in
- **Estimated Effort**: 1-2 sprints

#### 7. Spectator Mode
- **Description**: Allow users to watch ongoing games without playing
- **Requirements**: Separate socket rooms, read-only UI, lobby indication
- **Estimated Effort**: 1-2 sprints

#### 8. Admin Dashboard
- **Description**: Internal admin panel for user management, game moderation
- **Requirements**: Admin role, protected routes, admin UI components
- **Estimated Effort**: 2-3 sprints

### 🟢 Low Priority (Backlog)

#### 9. PWA Progressive Web App Support
- **Description**: Installable mobile app experience
- **Requirements**: manifest.json, service worker, offline mode, app icons
- **Estimated Effort**: 1 sprint

#### 10. Tournament System
- **Description**: Organized competitive brackets
- **Requirements**: Tournament table, bracket generation, scheduling
- **Estimated Effort**: 3-4 sprints

#### 11. Leaderboards
- **Description**: Global and per-game rankings
- **Requirements**: Ranking calculation, caching, leaderboard UI
- **Estimated Effort**: 1-2 sprints

#### 12. Achievements/Badges System
- **Description**: Unlock achievements for milestones (first win, 100 games, etc.)
- **Requirements**: Achievement definitions, trigger system, badge UI
- **Estimated Effort**: 2 sprints

#### 13. Dark Mode Customization
- **Description**: More theme options beyond light/dark
- **Current**: Basic light/dark toggle exists
- **Enhancement**: Custom color schemes, theme marketplace
- **Estimated Effort**: 1 sprint

#### 14. Avatar Customization
- **Description**: Custom avatars, avatar builder
- **Current**: Basic profile images
- **Enhancement**: Avatar editor, preset packs
- **Estimated Effort**: 2 sprints

#### 15. Additional Language Translations
- **Current**: English, Ukrainian
- **Candidates**: Spanish, French, German, Polish, Russian
- **Estimated Effort**: 1 week per language (translation + review)

## 📝 Recent Activity Log

### February 2026

#### Week of Feb 10-16 (Current)
- 🔄 TODO.md comprehensive refresh (updated Feb 11)
- 🔄 RLS migration fix planning
- 🔄 Next game selection from coming soon list

#### Week of Feb 3-9
- ✅ Game status sync fix for Spy game (Feb 9)
- ✅ Documentation updates (BOT_REFACTORING_SUMMARY.md, GAME_STATUS_FIX_FEB2026.md)
- ✅ Code cleanup and comment standardization

#### Week of Jan 27 - Feb 2
- ✅ Bot system modular refactoring completed
- ✅ Database migration: Separate Bots table (Feb 5)
- ✅ Database migration: Plural table names - Users, Games, Lobbies, etc. (Feb 5)
- ✅ All code updated to use `!!user.bot` pattern instead of `user.isBot`
- ✅ Bot factory pattern implemented
- ✅ RLS migration created (needs fix for plural tables)

### January 2026

#### Week of Jan 20-26
- ✅ Mobile UI major improvements (dynamic viewport height)
- ✅ iOS Safari/Chrome positioning fixes
- ✅ Tab-based interface for mobile optimized
- ✅ Layout reflow on game transitions fixed
- ✅ Documentation: MOBILE_UI_FIX_JAN2026.md

#### Week of Jan 13-19
- ✅ User profile enhancements
- ✅ Settings page improvements
- ✅ Friend system UI polish

### December 2025 (Archived)

#### Week of Dec 8-14
- ✅ Guess the Spy game fully implemented
- ✅ Lobby improvements (filters, search, stats)
- ✅ Friend system implementation (API + UI)

#### Week of Dec 1-7
- ✅ Major UX/UI improvements and responsive design overhaul (Dec 1)
- ✅ Internationalization (i18n) with English/Ukrainian (Dec 2)
- ✅ Comprehensive testing suite - 131+ tests (Dec 2-4)
- ✅ Analytics integration (Dec 2)
- ✅ WebSocket reconnection with exponential backoff (Dec 2)
- ✅ Socket.IO and database monitoring systems (Dec 3)
- ✅ Mobile tabs implementation (Dec 5)
- ✅ Chat improvements with scroll controls (Dec 5)

#### Week of Nov 25-30
- ✅ Production readiness improvements (Nov 25)
- ✅ Bot turn automation (Nov 25-27)
- ✅ Database optimization (Nov 28)
- ✅ Open Graph images (Nov 28)
- ✅ Vercel Analytics integration (Nov 28)
- ✅ Timer persistence and waiting room UX (Nov 30)

## 📝 Notes

### How to Use This Document
- **Weekly Sprint Review**: Update at the start of each week with completed tasks
- **Task Status**: Mark as ✅ DONE when completed, 🔄 for in-progress, 📋 TODO for planned
- **Priority Changes**: Adjust sprint goals based on user feedback and blockers
- **Archive Old Work**: Move completed sprints to Recent Activity Log section
- **Quarterly Reviews**: Every 3 months, review goals and adjust roadmap

### Development Principles
1. **Quality over speed** - Ensure games work flawlessly before launching
2. **User feedback first** - Iterate based on real player experiences
3. **Test thoroughly** - Maintain 80%+ coverage on all game logic
4. **Document everything** - Keep copilot-instructions.md, docs/, and code comments in sync
5. **Security always** - Never compromise on security or data privacy
6. **English comments only** - All code comments must be in English for consistency

### Testing Strategy
- **Unit tests** for game logic (GameEngine subclasses)
- **Integration tests** for API routes and database operations
- **Manual testing** for real-time multiplayer scenarios
- **Performance testing** before production deployments
- **Target**: 80%+ coverage on business logic, 131+ tests maintained

### Weekly Sprint Pattern
1. **Monday**: Review TODO.md, plan week's goals
2. **Tuesday-Thursday**: Implementation and testing
3. **Friday**: Code review, documentation updates, deploy if ready
4. **Weekend**: Monitor production, user feedback, plan next sprint

### Resources
- **Live Site**: [boardly.online](https://boardly.online)
- **GitHub Issues**: [github.com/KovalDenys1/Boardly/issues](https://github.com/KovalDenys1/Boardly/issues) ⭐ **NEW**
- **GitHub Projects**: [github.com/KovalDenys1/Boardly/projects](https://github.com/KovalDenys1/Boardly/projects) ⭐ **NEW**
- **Issue Workflow**: `/docs/ISSUE_WORKFLOW.md` ⭐ **NEW**
- **Documentation**: `/docs` directory
- **GitHub Repo**: [github.com/KovalDenys1/Boardly](https://github.com/KovalDenys1/Boardly)  
- **Games Page**: [boardly.online/games](https://boardly.online/games)
- **Copilot Instructions**: `.github/copilot-instructions.md`

### Key Files for New Games
- **Game Engine**: `lib/game-engine.ts` (base class)
- **Game Implementation**: `lib/games/[game-name]-game.ts`
- **Schema Update**: `prisma/schema.prisma` (add to GameType enum)
- **Tests**: `__tests__/lib/games/[game-name]-game.test.ts`
- **Lobby Page**: `app/games/[game-name]/lobbies/page.tsx`
- **Game Board**: Component in lobby page or separate
- **Translations**: `messages/en.json` and `messages/uk.json`

---

*Last Updated: February 11, 2026*  
*Next Review: February 17, 2026 (Weekly Sprint Planning)*  
*Current Sprint: Week of Feb 10-16, 2026 - Security & Infrastructure Polish*
