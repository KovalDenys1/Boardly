# Prisma Migrations

This directory contains all database migrations for the Boardly project.

## Migration Timeline

### 20260212000000_init

Complete initial schema - Squashed from all previous migrations for clean state

Creates the full Boardly database schema:

#### Enums

- GameStatus (waiting, playing, finished, abandoned, cancelled)
- GameType (yahtzee, tic_tac_toe, rock_paper_scissors, chess, guess_the_spy, uno, other)

#### Core Tables

- Users (with friendCode, isGuest, lastActiveAt for guest/social features)
- Bots (platform, name, skill, stats, userId for bot player system)
- Accounts (OAuth provider accounts)
- Sessions (user sessions)
- VerificationTokens, PasswordResetTokens, EmailVerificationTokens

#### Game Tables

- Lobbies (with turnTimer for timed games)
- Games (with gameType enum, abandonedAt for game lifecycle)
- Players (with finalScore, placement, isWinner, yahtzeeStats & yahtzeeData)

#### Social Features

- FriendRequests (sender/receiver with status tracking)
- Friendships (user1/user2 with timestamps)
- SpyLocations (game locations with activity flags)

All tables use proper plural names with indexes and foreign key constraints.

### 20260212000001_enable_rls

Complete RLS setup:

- Helper functions: get_current_user_id(), is_authenticated()
- Enabled RLS on all 13 tables
- Created policies for secure multi-tenant access
- Performance indexes: idx_players_userid_gameid, idx_games_lobbyid, idx_lobbies_creatorid, idx_bots_userid
- Granted permissions to authenticated and service_role roles

## Row Level Security (RLS)

All tables have RLS enabled with appropriate policies:

- Service role has full access for backend operations
- Users can only access their own data
- Game-related data is accessible based on participation
- Social features respect privacy boundaries

## Running Migrations

### Development

```bash
npx prisma migrate dev
```

### Production

```bash
npx prisma migrate deploy
```

### RLS Smoke Tests

```bash
npm run db:rls:smoke
```

This runs comprehensive checks to ensure RLS is properly configured on all tables.
