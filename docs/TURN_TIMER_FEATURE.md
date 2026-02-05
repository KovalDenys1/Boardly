# Turn Timer and Game Mode Settings - January 2026

## Overview
Added configurable turn timer settings and a placeholder for future game mode selection to the Yahtzee lobby creation interface.

## Changes Made

### 1. Database Schema (`prisma/schema.prisma`)
- Added `turnTimer` field to `Lobby` model
- Type: `Int` with default value of 60 seconds
- Supports timer values: 30, 60, 90, 120 seconds

```prisma
model Lobby {
  turnTimer Int @default(60) // Turn time limit in seconds (30, 60, 90, 120)
  // ...other fields
}
```

### 2. API Layer (`app/api/lobby/route.ts`)
- Updated `createLobbySchema` to accept `turnTimer` parameter
- Validation: `z.number().int().min(30).max(180).default(60)`
- Includes turnTimer in lobby creation logging

### 3. UI Components (`app/lobby/create/page.tsx`)
Added two new sections to the lobby creation form:

#### Turn Timer Settings
- 4 preset buttons: 30s, 60s, 90s, 120s
- Visual feedback: selected button highlighted with scale effect
- Helper text explaining the timer's purpose
- Default: 60 seconds

#### Game Mode Selection (Placeholder)
- Disabled button with lock icon
- "Coming Soon" text
- Helper text mentioning future modes: Fast, Short, and Mods
- Prepares UI structure for future feature

### 4. Internationalization
Added translation keys in both English and Ukrainian:

**English** (`locales/en.ts`):
- `lobby.create.turnTimer`: "Turn Time Limit"
- `lobby.create.turnTimerHelper`: "Each player has this much time to complete their turn"
- `lobby.create.gameMode`: "Game Mode"
- `lobby.create.gameModeHelper`: "Fast mode, short mode, and mods coming soon!"
- `lobby.create.comingSoon`: "Coming Soon"

**Ukrainian** (`locales/uk.ts`):
- `lobby.create.turnTimer`: "Ліміт часу на хід"
- `lobby.create.turnTimerHelper`: "Кожен гравець має цей час для завершення свого ходу"
- `lobby.create.gameMode`: "Режим гри"
- `lobby.create.gameModeHelper`: "Швидкий режим, короткий режим та моди з\'являться незабаром!"
- `lobby.create.comingSoon`: "Незабаром"

## Database Migration

Since this is a production database, a manual SQL migration is required:

```sql
-- Run this on production:
ALTER TABLE "Lobby" ADD COLUMN "turnTimer" INTEGER NOT NULL DEFAULT 60;
COMMENT ON COLUMN "Lobby"."turnTimer" IS 'Turn time limit in seconds (30-180)';
```

**Location**: `prisma/migrations/manual_add_turn_timer.sql`

**To Apply**:
```bash
psql "$DATABASE_URL" -f prisma/migrations/manual_add_turn_timer.sql
```

## Future Implementation

### Turn Timer Integration
To make the timer functional, update these files:
1. `app/lobby/[code]/hooks/useGameTimer.ts` - Replace hardcoded 60s with `lobby.turnTimer`
2. `app/lobby/[code]/page.tsx` - Pass `turnTimer` to timer hook
3. Server-side validation in bot turn logic

### Game Mode Feature
When implementing game modes:
1. Add `gameMode` enum to Prisma schema
2. Remove `disabled` attribute from button
3. Create mode selection modal/dropdown
4. Implement mode-specific game logic:
   - Fast: Reduced turn timer, fewer rounds
   - Short: Limited categories, quick game
   - Mods: Custom rules and variations

## UI Preview

```
┌─────────────────────────────┐
│ ⏱️ Turn Time Limit *        │
├─────────────────────────────┤
│ [30s] [60s✓] [90s] [120s]   │
│ Each player has this much... │
└─────────────────────────────┘

┌─────────────────────────────┐
│ 🎮 Game Mode                │
├─────────────────────────────┤
│ [🔒 Coming Soon]   (disabled)│
│ Fast mode, short mode...    │
└─────────────────────────────┘
```

## Testing Checklist
- [x] TypeScript compilation passes
- [x] UI renders correctly on mobile and desktop
- [x] Turn timer value is saved to database
- [x] Translation keys work in both languages
- [x] Form validation prevents invalid timer values
- [ ] Manual SQL migration applied to production database
- [ ] Turn timer actually controls game pace (future work)

## Files Modified
- `prisma/schema.prisma` - Added turnTimer field
- `app/api/lobby/route.ts` - API validation and creation logic
- `app/lobby/create/page.tsx` - UI components
- `locales/en.ts` - English translations
- `locales/uk.ts` - Ukrainian translations

## Files Created
- `prisma/migrations/manual_add_turn_timer.sql` - Database migration script
- `docs/TURN_TIMER_FEATURE.md` - This documentation

## Next Steps
1. Apply SQL migration to production database
2. Integrate turnTimer with `useGameTimer` hook
3. Plan and implement game mode feature
4. Add timer configuration to game settings panel

## Notes
- Turn timer is currently cosmetic - needs integration with game logic
- Game mode button is intentionally disabled as a placeholder
- Database migration must be applied manually due to production constraints
