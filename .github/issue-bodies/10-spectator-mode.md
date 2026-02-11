## 📋 Issue Description

Implement spectator mode allowing users to watch ongoing games without participating, useful for learning, entertainment, and community building.

## 🎯 Goal

Allow users to observe games in progress, fostering community engagement and helping new players learn by watching experienced players.

## ✅ Acceptance Criteria

- [ ] Add "Allow Spectators" toggle to lobby settings
- [ ] Create separate socket room for spectators (`lobby:${code}:spectators`)
- [ ] Implement "Watch" button on lobby list (for spectate-enabled lobbies)
- [ ] Create read-only game view for spectators
- [ ] Show spectator count in lobby listing
- [ ] List spectators in lobby sidebar (collapsible)
- [ ] Allow spectator chat (separate from player chat)
- [ ] Prevent spectators from seeing hidden information (e.g., spy role, face-down cards)
- [ ] Add "Join as Player" button if lobby not full
- [ ] Implement spectator limits (max 10-20 spectators per game)
- [ ] Test with all games (Yahtzee, Spy, future games)
- [ ] Deploy to production

## 📝 Implementation Notes

**Lobby Settings Update**:
```prisma
model Lobbies {
  // ... existing fields
  allowSpectators Boolean @default(false)
  maxSpectators   Int     @default(10)
  spectatorCount  Int     @default(0)
}
```

**Socket Rooms**:
- Players: `lobby:${code}` (full game state)
- Spectators: `lobby:${code}:spectators` (filtered game state)

**Spectator Join Flow**:
1. User clicks "Watch" on lobby
2. Check if spectators allowed & not at limit
3. Join spectator room
4. Receive game state updates (filtered)
5. Show read-only game board

**Hidden Information Filtering**:
- Yahtzee: Spectators see all rolls (no hidden info)
- Spy: Hide spy identity until reveal phase
- Future card games: Hide face-down cards, opponent hands

**Spectator UI**:
- Same game board as players but grayed out controls
- Banner: "You are spectating" with "Join as Player" button (if space)
- Spectator chat tab (separate from player chat)
- List of other spectators

**Socket Events**:
```typescript
// Client → Server
socket.emit('join-spectators', { lobbyCode })
socket.emit('leave-spectators', { lobbyCode })
socket.emit('spectator-chat', { lobbyCode, message })

// Server → Spectators
io.to(`lobby:${code}:spectators`).emit('game-update', filteredState)
io.to(`lobby:${code}:spectators`).emit('spectator-joined', { username })
io.to(`lobby:${code}:spectators`).emit('spectator-chat', { username, message })
```

## 🧪 Testing Requirements

- [ ] Test spectator join/leave
- [ ] Verify hidden information is filtered correctly
- [ ] Test spectator chat
- [ ] Check spectator limit enforcement
- [ ] Verify spectators don't affect game state
- [ ] Test "Join as Player" transition
- [ ] Mobile spectator experience
- [ ] Test with 0, 1, 10, 20 spectators

## 📊 Estimated Complexity

**M (Medium - 1-2 sprints / 1-2 weeks)**
- Week 1: Backend (socket rooms, state filtering, API endpoints)
- Week 2: Frontend (spectator UI, chat, join flow)

## 🎮 Game-Specific Considerations

**Yahtzee**: No hidden info, easy to implement
**Spy**: Hide spy role until reveal
**Future Memory**: Show all cards as face-down to spectators
**Future card games**: Complex filtering (opponents' hands, deck)

## 🔗 Related Issues

- Enhances community engagement
- Learning tool for new players
- Popular feature in Chess, Poker platforms

## 📚 Additional Context

**Use Cases**:
- Learning: Watch expert players
- Entertainment: Watch friends' games
- Community: Foster social interaction
- Tournaments: Spectate high-stakes matches

**Design Considerations**:
- Clear visual distinction (spectator vs player)
- Performance (don't overload socket broadcasts)
- Privacy (respect "private game" settings)
- Moderation (kick spectators if needed)

**Similar Features**:
- Chess.com live games
- Twitch watch parties
- Poker tournament streams

**Priority**: Q2 2026 (after basic features complete)