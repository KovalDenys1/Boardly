## 📋 Issue Description

Implement Memory (Match Pairs) game - a classic card-matching game where players take turns flipping cards to find matching pairs.

## 🎯 Goal

Add Memory game to expand casual game offerings with a simple turn-based matching mechanic.

## ✅ Acceptance Criteria

- [ ] Create `MemoryGame` class extending `GameEngine`
- [ ] Implement card grid generation (4x4, 5x4, or 6x6 based on difficulty)
- [ ] Add card flip animation
- [ ] Implement match detection (2 cards with same value)
- [ ] Track matched pairs for each player
- [ ] Turn-based gameplay (failed match = next player's turn)
- [ ] Add `memory` to `GameType` enum in schema
- [ ] Create lobby page with difficulty selection
- [ ] Implement card flip UI with reveal/hide animation
- [ ] Show score (matched pairs count) for each player
- [ ] Add translations (EN/UK)
- [ ] Write unit tests with 80%+ coverage
- [ ] Support 2-4 players
- [ ] Deploy to production

## 📝 Implementation Notes

**Game Rules**:

- 2-4 players
- Grid of facedown cards (pairs of matching cards)
- Players take turns flipping 2 cards
- If cards match → player keeps the pair and gets another turn
- If cards don't match → cards flip back, next player's turn
- Game ends when all pairs found
- Winner = most pairs collected

**State Structure**:

```typescript
interface MemoryState {
  cards: {
    id: string
    value: string  // emoji or image identifier
    isMatched: boolean
    isFlipped: boolean
  }[]
  gridSize: '4x4' | '5x4' | '6x6'  // 16, 20, or 36 cards
  currentPlayerId: string
  flippedCards: string[]  // Currently flipped (max 2)
  scores: Record<string, number>  // Player ID → pairs matched
  winner: string | null
}
```

**Card Values**: Use emojis for simplicity

- Easy (4x4): 🍎🍊🍋🍌🍇🍓🍒🥝 (8 unique, 16 cards)
- Medium (5x4): Add 🥥🍑 (10 unique, 20 cards)
- Hard (6x6): Add 🍐🍉🥭🍍🥑🫐🍈🥥 (18 unique, 36 cards)

**Match Logic**:

1. Player clicks card → flip animation
2. If 2 cards flipped:
   - Compare values
   - If match: Mark as matched, add score, player gets another turn
   - If no match: Wait 1.5s (show cards), then flip back, next player
3. Check win condition after each match

**Files to Create**:

- `lib/games/memory-game.ts`
- `__tests__/lib/games/memory-game.test.ts`
- `app/games/memory/lobbies/page.tsx`
- Card grid component with flip animations

## 🧪 Testing Requirements

- [ ] Unit tests: Match detection, turn rotation, scoring
- [ ] Test all grid sizes (4x4, 5x4, 6x6)
- [ ] Test 2, 3, and 4 player games
- [ ] Verify turn bonus (consecutive matches)
- [ ] Animation timing (cards flip back after delay)
- [ ] Mobile responsive card grid

## 📊 Estimated Complexity

**M (Medium - 2-3 days)**

- Day 1: Game logic, card generation, tests
- Day 2: UI with flip animations, grid layouts
- Day 3: Polish, difficulty modes, deployment

## 🎮 Game Details

- **Players**: 2-4
- **Difficulty**: Easy
- **Average Duration**: 5-10 minutes
- **Icon**: 🧠
- **Description EN**: "Find all the matching pairs. Test your memory skills!"
- **Description UK**: "Знайди всі пари карток. Перевір свою пам'ять!"

## 🔗 Related Issues

- Part of Q1 2026 simple games
- Good for younger players

## 📚 Additional Context

**Design Considerations**:

- Card flip animation is critical for UX
- Delay before flipping back allows memorization
- Responsive grid (3 cards wide on mobile, 4+ on desktop)
- Clear visual feedback for matched pairs (grayed out or removed)

**Priority**: Week of Feb 23-29 or Mar 2-8, 2026
