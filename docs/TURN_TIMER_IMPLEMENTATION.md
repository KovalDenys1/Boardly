# Turn Timer Implementation - Complete Integration

**Date**: January 2025  
**Status**: ✅ Fully Integrated  
**Feature**: Configurable turn time limits for Yahtzee games

## Overview

The turn timer feature allows lobby creators to set custom time limits for each player's turn (30-180 seconds). The timer is stored in the database, validated by the API, displayed in the UI, and fully integrated with the game logic.

## Implementation Summary

### 1. Database Schema
**File**: `prisma/schema.prisma`

```prisma
model Lobby {
  // ... other fields
  turnTimer   Int       @default(60)  // Turn time limit in seconds (30-180)
}
```

**Migration**: `prisma/migrations/manual_add_turn_timer.sql`
```sql
ALTER TABLE "Lobby" ADD COLUMN "turnTimer" INTEGER NOT NULL DEFAULT 60;
```

### 2. API Validation
**File**: `app/api/lobby/route.ts`

- Added Zod validation for `turnTimer` field (30-180 seconds, default 60)
- Validation ensures only valid timer values are stored
- Errors returned for out-of-range values

### 3. UI Components

#### Lobby Creation
**File**: `app/lobby/create/page.tsx`

- Turn timer selector (30s, 60s, 90s, 120s options)
- Preview badge shows selected timer: `⏱️ 60s`
- Conditional rendering based on game settings architecture

#### Waiting Room
**File**: `app/lobby/[code]/components/WaitingRoom.tsx`

- Displays turn timer setting alongside player count
- Visual badge: `⏱️ 60s per turn` with "Time limit" subtitle
- Only shown if turnTimer is configured

### 4. Game Logic Integration

#### Timer Hook
**File**: `app/lobby/[code]/hooks/useGameTimer.ts`

**Changes**:
- Added `turnTimerLimit` parameter to interface
- Replaced hardcoded `60` with dynamic `turnTimerLimit` (3 locations)
- Updated calculations: `Math.max(0, turnTimerLimit - elapsedSeconds)`
- Updated logs to show configured limit

**Before**:
```typescript
const [timeLeft, setTimeLeft] = useState<number>(60)
const remainingTime = Math.max(0, 60 - elapsedSeconds)
```

**After**:
```typescript
const [timeLeft, setTimeLeft] = useState<number>(turnTimerLimit)
const remainingTime = Math.max(0, turnTimerLimit - elapsedSeconds)
```

#### Lobby Page
**File**: `app/lobby/[code]/page.tsx`

**Changes**:
- Extract `turnTimerLimit` from lobby settings: `const turnTimerLimit = (lobby as any)?.turnTimer || 60`
- Pass to `useGameTimer` hook
- Pass to `GameBoard` component (desktop + mobile)

#### Game Board
**File**: `app/lobby/[code]/components/GameBoard.tsx`

**Changes**:
- Added `turnTimerLimit` prop to interface
- Calculate dynamic percentage: `const percentage = (timeLeft / turnTimerLimit) * 100`
- Updated color thresholds to use percentage instead of fixed seconds:
  - Red (urgent): `percentage <= 17%` (was `timeLeft <= 10`)
  - Yellow (warning): `percentage <= 50%` (was `timeLeft <= 30`)
  - Blue (safe): `percentage > 50%`

#### Lobby Actions
**File**: `app/lobby/[code]/hooks/useLobbyActions.ts`

**Changes**:
- Extract `turnTimerLimit` from lobby when starting game
- Initialize timer with dynamic value: `setTimeLeft(turnTimerLimit)`

### 5. Translations
**Files**: `locales/{en,uk,no,ru}.ts`

Added keys:
- `yahtzee.ui.perTurn`: "per turn" / "на хід" / "per tur" / "на ход"
- `yahtzee.ui.timeLimit`: "Time limit" / "Ліміт часу" / "Tidsgrense" / "Лимит времени"

## Data Flow

```
1. Lobby Creation UI (select timer)
   ↓
2. API validation (30-180s)
   ↓
3. Database storage (Lobby.turnTimer)
   ↓
4. Lobby page loads
   ↓
5. Extract turnTimer from lobby object
   ↓
6. Pass to useGameTimer hook
   ↓
7. Timer uses dynamic limit for countdown
   ↓
8. GameBoard displays with percentage-based colors
   ↓
9. On timeout, auto-score with correct timing
```

## UI/UX Features

### Lobby Preview (Creation)
- Badge shows selected timer: `⏱️ 60s`
- Appears alongside player count and privacy status
- Updates dynamically when timer setting changes

### Waiting Room (Pre-Game)
- Timer badge: `⏱️ 60s per turn`
- Subtitle: "Time limit"
- Responsive layout: wraps on mobile, inline on desktop
- Only visible if turnTimer is set (conditional rendering)

### Game Board (Active Game)
- Timer display at top of dice area
- Dynamic colors based on percentage:
  - 🔵 Blue: > 50% time remaining (calm)
  - 🟡 Yellow: 17-50% remaining (warning)
  - 🔴 Red: < 17% remaining (urgent, pulsing)
- Shows seconds: `⏱️ 45s`
- Responsive sizing for mobile and desktop

## Technical Details

### Type Safety
- `turnTimerLimit` parameter added to interfaces
- TypeScript compilation passes with no errors
- Proper prop drilling from lobby → page → hooks → components

### Performance
- Timer calculated once per render
- Percentage calculation: `O(1)` operation
- No unnecessary re-renders

### Edge Cases Handled
1. **Missing turnTimer**: Fallback to `60` seconds default
2. **Invalid values**: API validation rejects out-of-range values
3. **Database migration**: Manual SQL script for production deployment
4. **Existing lobbies**: Default value `60` applied automatically

## Testing

### Manual Testing Checklist
- [x] Create lobby with 30s timer → Timer shows 30s in game
- [x] Create lobby with 120s timer → Timer shows 120s in game
- [x] Timer colors change at correct percentages
- [x] Auto-score triggers when timer expires
- [x] Timer resets correctly on turn change
- [x] Translations work in all 4 languages
- [x] Mobile and desktop layouts render correctly

### Database Migration
**Production Deployment**:
```bash
psql "$DATABASE_URL" -f prisma/migrations/manual_add_turn_timer.sql
```

**Verification**:
```sql
-- Check column exists
\d "Lobby"

-- Verify default value
SELECT "turnTimer" FROM "Lobby" LIMIT 5;
```

## Future Enhancements

1. **Per-Player Timers**: Different time limits for human vs bot players
2. **Dynamic Timers**: Faster timers in later rounds
3. **Time Bank**: Reserve time that can be used across multiple turns
4. **Timer Settings UI**: More granular control (5-second increments)
5. **Timer Sound**: Audio alert when time is running low
6. **Timer Pause**: Ability to pause timer for discussion/questions

## Related Files

### Modified Files
- `prisma/schema.prisma` - Database schema
- `app/api/lobby/route.ts` - API validation
- `app/lobby/create/page.tsx` - UI selection
- `app/lobby/[code]/page.tsx` - Data extraction and prop passing
- `app/lobby/[code]/hooks/useGameTimer.ts` - Timer logic
- `app/lobby/[code]/hooks/useLobbyActions.ts` - Game start logic
- `app/lobby/[code]/components/GameBoard.tsx` - Timer display
- `app/lobby/[code]/components/WaitingRoom.tsx` - Pre-game display
- `locales/{en,uk,no,ru}.ts` - Translations

### New Files
- `prisma/migrations/manual_add_turn_timer.sql` - Migration script
- `docs/TURN_TIMER_FEATURE.md` - Feature documentation (original)
- `docs/TURN_TIMER_IMPLEMENTATION.md` - This file (complete guide)

## Migration Notes

### Development
```bash
# Already applied via Prisma
npx prisma migrate dev --name add_turn_timer
```

### Production (Render.com)
```bash
# Connect to database
psql "$DATABASE_URL"

# Run migration
\i prisma/migrations/manual_add_turn_timer.sql

# Verify
SELECT "turnTimer" FROM "Lobby" LIMIT 1;
```

## Verification Commands

### TypeScript Check
```bash
npx tsc --noEmit
# Expected: No errors
```

### Build Check
```bash
npm run build
# Expected: Successful build
```

### Runtime Check
```bash
# Start both servers
npm run dev:all

# Test flow:
# 1. Create lobby with custom timer
# 2. Join lobby
# 3. Start game
# 4. Verify timer displays and counts down correctly
# 5. Wait for timeout and verify auto-score
```

## Status: ✅ Complete

All functionality implemented and tested:
- ✅ Database schema
- ✅ API validation
- ✅ UI components (creation + display)
- ✅ Game logic integration
- ✅ Timer hook updated
- ✅ Color thresholds percentage-based
- ✅ Translations (4 languages)
- ✅ TypeScript compilation passes
- ✅ Documentation complete

**Ready for Production Deployment**

Remaining task: Apply database migration to production database.
