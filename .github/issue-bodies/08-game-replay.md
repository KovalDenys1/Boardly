## 📋 Issue Description

Implement game replay functionality to allow users to watch previously played games, helping them learn strategies, review funny moments, or analyze their gameplay.

## 🎯 Goal

Add premium feature that stores game state snapshots and allows playback of completed games.

## ✅ Acceptance Criteria

- [ ] Extend `Games` table to store state snapshots during gameplay
- [ ] Create replay API endpoints (GET `/api/game/[id]/replay`)
- [ ] Implement replay viewer UI component
- [ ] Add playback controls (play, pause, speed, step forward/back)
- [ ] Show game state at each turn with player actions
- [ ] Add "Watch Replay" button on game history page
- [ ] Optimize storage (compress snapshots, limit duration)
- [ ] Add option to download replay as JSON
- [ ] Gate feature behind premium tier (optional - can be free initially)
- [ ] Test with Yahtzee and Spy games
- [ ] Deploy to production

## 📝 Implementation Notes

**State Snapshot Storage**:

```prisma
model GameStateSnapshot {
  id        String   @id @default(cuid())
  gameId    String
  game      Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  
  turnNumber Int      // Which turn this snapshot represents
  state      Json     // Full game state at this turn
  action     Json     // What action was taken
  playerId   String   // Who made the action
  
  createdAt DateTime @default(now())
  
  @@index([gameId, turnNumber])
}
```

**Replay Flow**:

1. During game: Save snapshot after each significant action
2. Game ends: Mark game as "has replay"
3. User clicks "Watch Replay" → Load all snapshots
4. Replay UI: Step through snapshots with controls

**Replay Viewer UI**:

- Game board displayed at each turn
- Player list showing who's active
- Action description ("Player X rolled dice", "Player Y scored Yahtzee")
- Timeline slider to jump to specific turn
- Speed controls (0.5x, 1x, 2x, 4x)
- Auto-play mode

**Storage Optimization**:

- Only store diff from previous state (not full state each time)
- Compress JSON with gzip
- Limit replay storage to 90 days for free users, unlimited for premium
- Auto-delete old replays (cleanup cron job)

**Games Support**:

- ✅ Yahtzee: Track dice rolls, holds, scores
- ✅ Spy: Track questions, votes, reveals
- 🔜 Future games: Add snapshot logic during implementation

## 🧪 Testing Requirements

- [ ] Test snapshot creation during gameplay
- [ ] Verify replay loads correctly
- [ ] Test playback controls (play, pause, step)
- [ ] Check storage size (optimize if > 100KB per game)
- [ ] Test with long games (20+ turns)
- [ ] Verify auto-delete old replays works

## 📊 Estimated Complexity

**L (Large - 2-3 sprints / 2-3 weeks)**

- Week 1: Schema, snapshot creation during games
- Week 2: Replay viewer UI, playback controls
- Week 3: Optimization, premium gating, polish

## 🔗 Related Issues

- Premium feature for monetization
- Enhances game history page
- Educational tool for new players

## 💰 Monetization Potential

- **Free**: Last 10 replays, 90-day retention
- **Premium**: Unlimited replays, permanent storage
- **Pro**: Download replays, advanced analytics

## 📚 Additional Context

**Use Cases**:

- Review strategy (how did opponent win?)
- Entertainment (watch funny moments)
- Learning tool (study expert plays)
- Shareable (send replay link to friends)

**Technical Challenges**:

- Storage cost (need compression)
- Replay UI complexity (different for each game)
- Performance (loading 50+ snapshots)

**Priority**: Q2 2026 (Medium priority feature)
