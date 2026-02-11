## 📋 Game Description

Implement Tic-Tac-Toe (Хрестики-Нулики) - a classic two-player game where players take turns marking spaces in a 3×3 grid, trying to get three in a row.

## 🎯 Goal

Add the first simple game from the "Coming Soon" list to expand game offerings and establish patterns for future simple games.

## ✅ Acceptance Criteria

- [ ] Create `TicTacToeGame` class extending `GameEngine` in `lib/games/tic-tac-toe-game.ts`
- [ ] Implement core methods: `validateMove()`, `processMove()`, `getInitialGameData()`, `checkWinCondition()`
- [ ] Add `ticTacToe` to `GameType` enum in `prisma/schema.prisma`
- [ ] Create lobby page at `app/games/tic-tac-toe/lobbies/page.tsx`
- [ ] Implement game board UI component with 3×3 grid
- [ ] Add win condition detection (rows, columns, diagonals)
- [ ] Implement draw detection (board full, no winner)
- [ ] Add translations to `messages/en.json` and `messages/uk.json`
- [ ] Write unit tests with 80%+ coverage
- [ ] Add game to `/games` page listing
- [ ] Test multiplayer with 2 real players
- [ ] Deploy to production

## 📝 Implementation Notes

**Game Rules**:

- 2 players only
- Players alternate turns
- First player is X, second is O
- Win: 3 in a row (horizontal, vertical, or diagonal)
- Draw: Board full with no winner

**State Structure**:

```typescript
interface TicTacToeState {
  board: ('X' | 'O' | null)[][]  // 3x3 grid
  currentPlayer: 'X' | 'O'
  winner: 'X' | 'O' | 'draw' | null
  winningLine: [number, number][] | null  // For highlighting
}
```

**Move Validation**:

- Game not finished
- Valid coordinates (0-2, 0-2)
- Cell is empty
- Player's turn

**Files to Create**:

- `lib/games/tic-tac-toe-game.ts` - Game logic
- `__tests__/lib/games/tic-tac-toe-game.test.ts` - Tests
- `app/games/tic-tac-toe/lobbies/page.tsx` - Lobby page
- Add component in `app/lobby/[code]/components/GameBoard.tsx`

**Pattern Reference**: See `lib/games/yahtzee-game.ts` for implementation example

## 🧪 Testing Requirements

- [ ] Unit tests: Move validation, win detection, draw detection
- [ ] Integration: Create lobby, join, play full game
- [ ] Real-time: Test with 2 players in different browsers
- [ ] Mobile: Test responsive UI on mobile devices
- [ ] i18n: Verify all text is translated

## 📊 Estimated Complexity

**M (Medium - 1-2 days)**

- Day 1: Game logic, tests, schema update
- Day 2: UI components, integration, deployment

## 🎮 Game Details

- **Players**: 2
- **Difficulty**: Easy
- **Average Duration**: 1-3 minutes
- **Icon**: ❌
- **Description EN**: "Simple and fast game. Get three in a row to win!"
- **Description UK**: "Проста та швидка гра. Збери три в ряд, щоб перемогти!"

## 🔗 Related Issues

- Part of Q1 2026 game expansion roadmap
- Follows established GameEngine pattern

## 📚 Additional Context

This is the simplest game to implement - perfect for:

- Testing game implementation workflow
- Establishing patterns for future games
- Quick win to expand game library
- Learning tool for new contributors

**Priority**: Week of Feb 16-22, 2026 (from TODO.md)
