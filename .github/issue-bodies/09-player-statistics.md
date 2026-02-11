## 📋 Issue Description

Create advanced player statistics dashboard showing detailed analytics beyond basic game history - win rates, average scores, trends over time, favorite games, etc.

## 🎯 Goal

Provide users with insights into their gameplay performance and progression, increasing engagement and retention.

## ✅ Acceptance Criteria

- [ ] Design statistics data model (aggregate queries)
- [ ] Create stats calculation service (`lib/stats-calculator.ts`)
- [ ] Implement API endpoint: GET `/api/user/[id]/stats`
- [ ] Build Statistics page/section in profile
- [ ] Show overall stats:
  - Total games played
  - Win rate (%)
  - Average game duration
  - Favorite game
  - Current win streak
  - Longest win streak
- [ ] Per-game stats:
  - Games played per game type
  - Win rate per game
  - Average score (for scored games like Yahtzee)
  - Best score / personal record
- [ ] Add charts for trends over time (recharts or visx)
  - Games played per day/week/month
  - Win rate trend
  - Performance over time
- [ ] Cache stats (update on game end, not real-time)
- [ ] Add filter by date range
- [ ] Make premium feature (or basic free, advanced premium)
- [ ] Deploy to production

## 📝 Implementation Notes

**Stats Calculation**:
```typescript
interface UserStats {
  overall: {
    totalGames: number
    wins: number
    losses: number
    draws: number
    winRate: number  // percentage
    avgGameDuration: number  // minutes
    favoriteGame: GameType
    currentStreak: number
    longestStreak: number
  }
  
  byGame: Record<GameType, {
    gamesPlayed: number
    wins: number
    winRate: number
    avgScore?: number
    bestScore?: number
    lastPlayed: Date
  }>
  
  trends: {
    date: string
    gamesPlayed: number
    wins: number
  }[]
}
```

**Data Sources**:
- `Games` table: Status, winner, duration
- `Players` table: Join game → player mapping
- Calculate on-demand or cache in `UserStats` table

**Caching Strategy**:
- Create `UserStats` table to store pre-computed stats
- Update after each game completion
- Invalidate cache when game deleted/modified
- Fallback to real-time calculation if needed

**Charts** (using recharts):
- Line chart: Games per day over last 30 days
- Bar chart: Wins per game type
- Pie chart: Game type distribution
- Area chart: Win rate trend

**Premium vs Free**:
- **Free**: Basic stats (total games, win rate, last 30 days)
- **Premium**: Advanced stats (trends, all-time, per-game breakdown, charts)

## 🧪 Testing Requirements

- [ ] Test stats calculation accuracy
- [ ] Verify cache updates on game completion
- [ ] Test with users who have 0, 1, 10, 100+ games
- [ ] Check chart rendering on mobile
- [ ] Performance test (large dataset, 1000+ games)
- [ ] Test date range filtering

## 📊 Estimated Complexity

**M (Medium - 1-2 sprints / 1-2 weeks)**
- Week 1: Stats calculation, caching, API endpoints
- Week 2: UI, charts, polish

## 🔗 Related Issues

- Enhances profile page
- Premium feature for monetization
- Related to game history (already implemented)

## 💰 Monetization Potential

Premium feature differentiator - users love seeing their stats and progress!

## 📚 Additional Context

**Design Inspiration**:
- Chess.com stats page
- Duolingo progress tracking
- Gaming achievements/profile pages

**Technical Considerations**:
- Query optimization (aggregate functions, indexes)
- Chart library choice (recharts recommended - lightweight)
- Mobile responsive charts (aspect ratio, touch controls)

**Priority**: Q1-Q2 2026 (after basic games implemented)