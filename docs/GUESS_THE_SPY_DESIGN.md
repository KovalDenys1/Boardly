# Guess the Spy - Game Design Document

## Game Overview

**Guess the Spy** is a social deduction game where players must identify the spy among them through questioning and deduction.

### Core Concept
- **Players**: 3-10 players
- **Duration**: 5-10 minutes per round
- **Roles**: Regular players + 1 Spy
- **Objective**: 
  - Regular players: Identify the spy
  - Spy: Blend in and avoid detection

## Game Flow

### Phase 1: Setup (30 seconds)
1. Players join lobby (3-10 players required)
2. Host starts the game
3. System randomly assigns roles:
   - 1 Spy (random selection)
   - Remaining players are Regular players
4. System selects a random location from the database

### Phase 2: Role Assignment (10 seconds)
- **Regular players** see:
  - "You are a REGULAR player"
  - The location (e.g., "Airport")
  - A specific role at that location (e.g., "Pilot", "Security Guard", "Passenger")
- **Spy** sees:
  - "You are the SPY"
  - List of possible locations (category hint)
  - NO specific location revealed

### Phase 3: Question Round (5 minutes)
- Players take turns asking questions to each other
- Questions should be about the location (without being too obvious)
- Each player can ask 1 question per round
- Timer: 30 seconds per question
- Chat displays all questions and answers
- Players can vote to skip their turn

**Examples**:
- Good question: "What do you usually wear here?"
- Bad question: "Are we at an airport?" (too obvious)

### Phase 4: Voting (60 seconds)
- All players vote simultaneously for who they think is the spy
- Players cannot vote for themselves
- Countdown timer shows remaining time
- Votes are hidden until all players vote or timer expires

### Phase 5: Results
- Votes are revealed with animation
- Player with most votes is revealed
- **If spy is caught**:
  - Regular players win
  - Spy's identity revealed
  - Location revealed to spy
- **If innocent player caught**:
  - Spy wins
  - All roles revealed
- Score distribution based on outcome

### Phase 6: Next Round (Optional)
- Display final scores
- "Play Again" button
- "Back to Lobby" button
- New roles and location assigned if continuing

## Game Mechanics

### Locations Database
Organized by categories:
- **Travel**: Airport, Train Station, Hotel, Cruise Ship
- **Entertainment**: Movie Theater, Casino, Concert Hall, Circus
- **Public**: Hospital, School, Library, Police Station
- **Workplace**: Office, Restaurant, Factory, Bank
- **Recreation**: Beach, Park, Gym, Spa

Each location has 8-10 specific roles:
```json
{
  "location": "Airport",
  "category": "Travel",
  "roles": [
    "Pilot", "Flight Attendant", "Security Guard", 
    "Passenger", "Customs Officer", "Baggage Handler",
    "Check-in Staff", "Duty-Free Shop Worker"
  ]
}
```

### Scoring System
- **Spy caught**: Regular players get 100 points each
- **Spy wins**: Spy gets 300 points
- **Voted correctly**: +50 bonus points
- **Voted incorrectly**: -10 points
- **Asked good questions**: +10 points (based on engagement)

### Turn Timer
- Question phase: 5 minutes total
- Each question: 30 seconds to ask
- Each answer: 30 seconds to respond
- Voting phase: 60 seconds
- Auto-skip if time expires

## UX Flow

### Lobby Screen
```
┌─────────────────────────────────────┐
│  Guess the Spy - Lobby              │
│  Code: ABC123                       │
├─────────────────────────────────────┤
│  Players (3/10):                    │
│  ✓ John (Host) 🟢                   │
│  ✓ Alice 🟢                         │
│  ✓ Bob 🟢                           │
│  + Add Bot                          │
├─────────────────────────────────────┤
│  Settings:                          │
│  Question Time: 5 min               │
│  Voting Time: 60 sec                │
│  Rounds: 3                          │
├─────────────────────────────────────┤
│  [Start Game]  [Leave Lobby]        │
└─────────────────────────────────────┘
```

### Role Reveal Screen
```
┌─────────────────────────────────────┐
│         🕵️ YOUR ROLE 🕵️             │
│                                     │
│     You are a REGULAR PLAYER        │
│                                     │
│     Location: AIRPORT ✈️            │
│     Your Role: PILOT                │
│                                     │
│  Remember: Don't reveal the         │
│  location too obviously!            │
│                                     │
│  [Ready] (3/5)                      │
└─────────────────────────────────────┘
```

### Question Phase Screen
```
┌─────────────────────────────────────┐
│  Round 1 - Question Phase  [3:42]   │
├─────────────────────────────────────┤
│  Turn: Alice → Bob                  │
│                                     │
│  Chat History:                      │
│  John → Alice: "What's the weather  │
│  like here usually?"                │
│  Alice: "It can vary quite a bit"   │
│                                     │
│  Bob → John: "Do you need any       │
│  special equipment?"                │
│  John: "Yes, very specialized"      │
├─────────────────────────────────────┤
│  [Type your question...]            │
│  [Send] [Skip Turn]                 │
├─────────────────────────────────────┤
│  Players:                           │
│  John ✓ | Alice ✓ | Bob ⏱️          │
└─────────────────────────────────────┘
```

### Voting Screen
```
┌─────────────────────────────────────┐
│       🗳️ VOTING TIME 🗳️             │
│         Time: 0:45                  │
├─────────────────────────────────────┤
│  Who do you think is the spy?       │
│                                     │
│  [ ] John                           │
│  [ ] Alice                          │
│  [✓] Bob                            │
│  [ ] Charlie                        │
│                                     │
│  Voted: 3/5 players                 │
│                                     │
│  [Confirm Vote]                     │
└─────────────────────────────────────┘
```

### Results Screen
```
┌─────────────────────────────────────┐
│          📊 RESULTS 📊               │
├─────────────────────────────────────┤
│  Voting Results:                    │
│  Bob: ████ (3 votes) ← ELIMINATED   │
│  Alice: ██ (2 votes)                │
│  John: █ (1 vote)                   │
├─────────────────────────────────────┤
│     🎉 REGULAR PLAYERS WIN! 🎉      │
│                                     │
│     Bob was the SPY! 🕵️            │
│     Location was: AIRPORT ✈️        │
├─────────────────────────────────────┤
│  Scores:                            │
│  John: +100 pts (150 total)         │
│  Alice: +100 pts (100 total)        │
│  Charlie: +100 pts (100 total)      │
│  Bob (Spy): +0 pts (0 total)        │
├─────────────────────────────────────┤
│  [Play Again] [Back to Lobby]       │
└─────────────────────────────────────┘
```

## Technical Architecture

### Database Schema
```prisma
enum SpyGamePhase {
  WAITING
  ROLE_REVEAL
  QUESTIONING
  VOTING
  RESULTS
}

model SpyGameState {
  gameId          String
  phase           SpyGamePhase
  currentRound    Int
  totalRounds     Int
  location        String
  locationCategory String
  spyPlayerId     String
  playerRoles     Json // { playerId: role }
  votes           Json // { voterId: votedPlayerId }
  questionHistory Json[] // { askerId, answerId, question, answer, timestamp }
  scores          Json // { playerId: score }
  phaseStartTime  DateTime
  questionTimer   Int // seconds remaining
  votingTimer     Int // seconds remaining
}
```

### Game Engine Methods
```typescript
class SpyGame extends GameEngine {
  // Setup
  initializeGame(players: Player[]): SpyGameState
  assignRoles(): { spyId: string, playerRoles: Map }
  selectLocation(): { location: string, category: string }
  
  // Questioning
  askQuestion(playerId: string, targetId: string, question: string): boolean
  answerQuestion(playerId: string, answer: string): boolean
  skipTurn(playerId: string): boolean
  
  // Voting
  submitVote(voterId: string, targetId: string): boolean
  tallyVotes(): { eliminatedId: string, votes: Map }
  
  // Results
  calculateScores(): Map<string, number>
  determineWinner(): 'spy' | 'regular'
  
  // Validation
  validateMove(move: GameMove): boolean
  checkGameEnd(): boolean
}
```

### Socket.IO Events
```typescript
// Client → Server
socket.emit('spy:ask-question', { targetId, question })
socket.emit('spy:answer-question', { answer })
socket.emit('spy:skip-turn')
socket.emit('spy:vote', { targetId })
socket.emit('spy:ready') // for role reveal phase

// Server → Client
socket.on('spy:phase-change', { phase, timer })
socket.on('spy:role-assigned', { role, location?, locationRole? })
socket.on('spy:question-asked', { askerId, targetId, question })
socket.on('spy:answer-given', { playerId, answer })
socket.on('spy:turn-change', { currentPlayerId })
socket.on('spy:voting-started', { timer })
socket.on('spy:vote-submitted', { voterId }) // hide actual vote
socket.on('spy:results', { eliminatedId, wasSpyl votes, scores })
```

## Anti-Cheat Measures

1. **Role Privacy**: Roles sent only to respective players (server-side filtering)
2. **Vote Secrecy**: Votes stored server-side, revealed only after voting ends
3. **Turn Validation**: Server enforces whose turn it is
4. **Timer Enforcement**: Server-side timers, not client-controlled
5. **Chat Logging**: All questions/answers logged for review

## Accessibility

- Color-blind friendly indicators (not just color-coded)
- Screen reader support for role reveals
- Keyboard navigation for voting
- High contrast mode for text
- Clear audio cues for phase changes

## Future Enhancements

- **Multiple Spies**: 2 spies for 8+ players (hard mode)
- **Custom Locations**: Players can create custom location sets
- **Voice Chat**: Optional voice integration for questioning
- **Spectator Mode**: Watch games in progress
- **Replays**: Review past games with revealed roles
- **Statistics**: Track spy win rate, best questioners, etc.
- **Achievements**: "Master Interrogator", "Perfect Spy", etc.

## Localization Keys

```json
{
  "spy.roles.regular": "Regular Player",
  "spy.roles.spy": "Spy",
  "spy.phases.waiting": "Waiting for players...",
  "spy.phases.roleReveal": "Role Assignment",
  "spy.phases.questioning": "Question Round",
  "spy.phases.voting": "Voting Time",
  "spy.phases.results": "Results",
  "spy.location": "Location",
  "spy.yourRole": "Your Role",
  "spy.askQuestion": "Ask a question...",
  "spy.vote": "Vote",
  "spy.spyWins": "Spy Wins!",
  "spy.regularsWin": "Regular Players Win!",
  "spy.wasSpy": "was the Spy!",
  "spy.wasInnocent": "was innocent!"
}
```

---

**Status**: ✅ Design Complete  
**Next**: Backend implementation (DB schema, API routes, game engine)
