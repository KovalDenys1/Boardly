# Game Settings Architecture

## Overview
Flexible configuration system for game-specific lobby settings. Each game can define its own set of available settings, making it easy to add new games with unique configurations.

## Architecture

### Game Settings Configuration
Each game in `GAME_INFO` has a `settings` object that defines what configuration options are available:

```typescript
type GameSettings = {
  hasTurnTimer?: boolean      // Whether this game supports turn timer
  hasGameModes?: boolean       // Whether this game supports game modes
  turnTimerOptions?: number[]  // Available turn timer options (in seconds)
  defaultTurnTimer?: number    // Default turn timer value
}
```

### Current Game Configurations

#### Yahtzee
```typescript
settings: {
  hasTurnTimer: true,
  hasGameModes: true,
  turnTimerOptions: [30, 60, 90, 120],
  defaultTurnTimer: 60,
}
```
- **Turn Timer**: ✅ Enabled (30s, 60s, 90s, 120s)
- **Game Modes**: ✅ Enabled (placeholder for Fast, Short, Mods)

#### Guess the Spy
```typescript
settings: {
  hasTurnTimer: false,  // Spy game doesn't need turn timer
  hasGameModes: false,  // Spy game doesn't need game modes yet
}
```
- **Turn Timer**: ❌ Disabled (round-based, not time-based)
- **Game Modes**: ❌ Disabled (no modes planned yet)

## How It Works

### 1. Conditional Rendering
Settings UI only renders if the game supports them:

```tsx
{gameInfo.settings.hasTurnTimer && (
  <div>
    {/* Turn Timer UI */}
  </div>
)}

{gameInfo.settings.hasGameModes && (
  <div>
    {/* Game Mode UI */}
  </div>
)}
```

### 2. Dynamic Defaults
Form data automatically uses game-specific defaults:

```typescript
turnTimer: GAME_INFO[selectedGameType].settings.defaultTurnTimer || 60
```

### 3. Game Switching
When user changes game type, settings automatically update:

```typescript
useEffect(() => {
  setFormData(prev => ({
    ...prev,
    turnTimer: gameInfo.settings.defaultTurnTimer || 60,
  }))
}, [selectedGameType])
```

## Adding a New Game

### Example: Adding "Uno"

1. **Define game type**:
```typescript
type GameType = 'yahtzee' | 'guess_the_spy' | 'uno'
```

2. **Add game configuration**:
```typescript
uno: {
  name: 'Uno',
  emoji: '🃏',
  description: '',
  gradient: 'from-red-600 via-yellow-500 to-green-400',
  allowedPlayers: [2, 3, 4, 5, 6, 7, 8],
  defaultMaxPlayers: 4,
  settings: {
    hasTurnTimer: true,
    hasGameModes: true,
    turnTimerOptions: [20, 30, 45, 60], // Faster game, shorter timers
    defaultTurnTimer: 30,
  },
}
```

3. **That's it!** UI automatically adapts:
- Turn timer buttons render with [20s, 30s, 45s, 60s]
- Game mode placeholder appears
- Default is 30 seconds

### Example: Game Without Settings

```typescript
chess: {
  name: 'Chess',
  emoji: '♟️',
  description: '',
  gradient: 'from-gray-700 via-gray-600 to-gray-500',
  allowedPlayers: [2],
  defaultMaxPlayers: 2,
  settings: {
    hasTurnTimer: false,  // Chess uses its own time control system
    hasGameModes: false,
  },
}
```
Result: No settings UI shown, clean lobby creation form.

## Adding New Setting Types

### Example: Add "allowSpectators" setting

1. **Update GameSettings type**:
```typescript
type GameSettings = {
  hasTurnTimer?: boolean
  hasGameModes?: boolean
  hasSpectators?: boolean  // NEW
  turnTimerOptions?: number[]
  defaultTurnTimer?: number
}
```

2. **Add to game configurations**:
```typescript
yahtzee: {
  // ...
  settings: {
    hasTurnTimer: true,
    hasGameModes: true,
    hasSpectators: true,  // NEW
  },
}
```

3. **Add UI component**:
```tsx
{gameInfo.settings.hasSpectators && (
  <div>
    <label>🎭 {t('lobby.create.allowSpectators')}</label>
    <input 
      type="checkbox"
      checked={formData.allowSpectators}
      onChange={(e) => setFormData({...formData, allowSpectators: e.target.checked})}
    />
  </div>
)}
```

## Benefits

### ✅ Scalability
- Adding new games requires only config changes
- No need to modify UI rendering logic
- Settings automatically adapt to game type

### ✅ Maintainability
- All game settings in one place (`GAME_INFO`)
- Clear documentation of what each game supports
- Easy to understand game capabilities at a glance

### ✅ Flexibility
- Games can have unique settings
- Easy to add/remove settings per game
- No code duplication

### ✅ Type Safety
- TypeScript ensures all settings are properly typed
- Compiler catches missing configurations
- IDE autocomplete for all settings

## Future Enhancements

### Planned Setting Types
```typescript
type GameSettings = {
  // Existing
  hasTurnTimer?: boolean
  hasGameModes?: boolean
  turnTimerOptions?: number[]
  defaultTurnTimer?: number
  
  // Future
  hasSpectators?: boolean
  hasDifficulty?: boolean
  hasTeamMode?: boolean
  hasCustomRules?: boolean
  difficultyLevels?: string[]
  maxSpectators?: number
  customRuleOptions?: string[]
}
```

### Example: Full-Featured Game
```typescript
advancedGame: {
  name: 'Advanced Game',
  emoji: '🎮',
  // ...
  settings: {
    hasTurnTimer: true,
    hasGameModes: true,
    hasSpectators: true,
    hasDifficulty: true,
    hasTeamMode: true,
    turnTimerOptions: [30, 60, 90],
    defaultTurnTimer: 60,
    difficultyLevels: ['Easy', 'Medium', 'Hard'],
    maxSpectators: 10,
  },
}
```

## Migration Notes

### Before (Hardcoded)
```tsx
{/* Always shown for all games */}
<div>Turn Timer UI</div>
<div>Game Mode UI</div>
```

### After (Configurable)
```tsx
{/* Only shown if game supports it */}
{gameInfo.settings.hasTurnTimer && <div>Turn Timer UI</div>}
{gameInfo.settings.hasGameModes && <div>Game Mode UI</div>}
```

## Testing

When adding a new game or setting:
1. ✅ Verify UI renders correctly for games WITH the setting
2. ✅ Verify UI doesn't render for games WITHOUT the setting
3. ✅ Test game switching updates settings properly
4. ✅ Ensure default values work correctly
5. ✅ TypeScript compilation passes

## Files Modified
- `app/lobby/create/page.tsx` - Game settings configuration and UI
- `docs/GAME_SETTINGS_ARCHITECTURE.md` - This documentation

## Related Documentation
- `docs/TURN_TIMER_FEATURE.md` - Turn timer implementation
- `app/lobby/create/page.tsx` - Main lobby creation component
- `locales/*.ts` - Translation files for settings labels
