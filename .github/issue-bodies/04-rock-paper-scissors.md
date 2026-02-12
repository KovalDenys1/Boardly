---
status: done
priority: high
type: game
---

## 📋 Game Description

Implement Rock Paper Scissors (Камінь-Ножиці-Папір) - a classic hand game where two players simultaneously form one of three shapes to determine the winner.

## 🎯 Goal

Add second simple game with simultaneous turn mechanics, introducing a new game pattern different from turn-based games.

## ✅ Acceptance Criteria

- [x] Create `RockPaperScissorsGame` class extending `GameEngine`
- [x] Implement simultaneous move submission (both players choose, then reveal)
- [x] Add best-of-3 or best-of-5 mode selection
- [x] Implement round winner calculation (rock beats scissors, scissors beats paper, paper beats rock)
- [x] Add `rockPaperScissors` to `GameType` enum in schema
- [x] Create lobby page with mode selection (best-of-3/5)
- [x] Implement choice UI (rock/paper/scissors buttons with emoji)
- [x] Add reveal animation when both players have chosen
- [x] Show round history and current score
- [x] Add translations (EN/UK)
- [x] Write unit tests with 80%+ coverage (32 tests, all passing)
- [ ] Deploy to production

## 📝 Implementation Notes

**Game Rules**:

- 2 players only
- Simultaneous turns (both submit before reveal)
- Rock (🪨) beats Scissors (✂️)
- Scissors (✂️) beats Paper (📄)
- Paper (📄) beats Rock (🪨)
- Same choice = Draw, replay round
- Best-of-3 or Best-of-5 format

**State Structure**:

```typescript
interface RPSState {
  mode: 'best-of-3' | 'best-of-5'
  rounds: {
    player1Choice: 'rock' | 'paper' | 'scissors' | null
    player2Choice: 'rock' | 'paper' | 'scissors' | null
    winner: 'player1' | 'player2' | 'draw' | null
  }[]
  score: { player1: number, player2: number }
  currentRound: number
  gameWinner: string | null
  waitingFor: string[]  // Players who haven't submitted yet
}
```

**Key Challenge**: **Simultaneous Moves**

- Both players submit choices independently
- Choices hidden until both submitted
- Reveal animation when ready
- Lock choices after submission to prevent changes

**Move Flow**:

1. Both players see choice buttons
2. Player clicks choice → submitted (but hidden from opponent)
3. UI shows "Waiting for opponent..."
4. When both submitted → reveal animation
5. Display round winner and update score
6. If game not over, start new round

**Files to Create**:

- `lib/games/rps-game.ts`
- `__tests__/lib/games/rps-game.test.ts`
- `app/games/rock-paper-scissors/lobbies/page.tsx`
- Game board component with choice buttons and reveal animation

## 🧪 Testing Requirements

- [ ] Unit tests: Winner calculation for all combinations
- [ ] Simultaneous move handling
- [ ] Best-of-3 and best-of-5 modes
- [ ] Draw scenarios (same choice)
- [ ] Real-time synchronization (both players see reveal at same time)
- [ ] Mobile responsive testing

## 📊 Estimated Complexity

### M (Medium - 1-2 days)

- Day 1: Game logic with simultaneous moves, tests
- Day 2: UI with reveal animation, integration

## 🎮 Game Details

- **Players**: 2
- **Difficulty**: Easy
- **Average Duration**: 2-5 minutes
- **Icon**: ✊
- **Description EN**: "Classic quick game. Outsmart your opponent in three moves!"
- **Description UK**: "Класична швидка гра. Перехитруй суперника за три ходи!"

## 🔗 Related Issues

- Part of Q1 2026 game expansion
- Introduces simultaneous turn pattern (useful for future games)

## 📚 Additional Context

**New Pattern**: Simultaneous moves (vs sequential turns in Yahtzee/Spy)

- Hidden choice submission
- Reveal synchronization
- Prevents cheating (can't see opponent's choice early)

This pattern will be useful for other simultaneous-choice games.

**Priority**: Week of Feb 16-22 or Feb 23-29, 2026 (from TODO.md)
