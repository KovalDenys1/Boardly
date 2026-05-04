import { GameEngine, type Move, type Player } from '@/lib/game-engine'
import { ALIAS_WORDS } from './alias-words'

export interface AliasTeam {
  id: string
  name: string
  playerIds: string[]
  score: number
  describerIndex: number
}

export interface AliasWordResult {
  word: string
  result: 'guessed' | 'skipped'
}

export interface AliasTurnResult {
  teamId: string
  describerId: string
  wordResults: AliasWordResult[]
  scoreDelta: number
  turnIndex: number
}

export interface AliasGameData {
  phase: 'team_assignment' | 'turn_active' | 'turn_results' | 'game_over'
  teams: AliasTeam[]
  currentTeamIndex: number
  turnsPerTeam: number
  skipPenalty: number
  currentCard: string[] | null
  currentCardIndex: number
  currentCardResults: AliasWordResult[]
  turnStartedAt: number | null
  teamTurnCounts: Record<string, number>
  lastTurnResult: AliasTurnResult | null
  usedWordIndices: number[]
  winnerId: string | null
}

export class AliasGame extends GameEngine {
  constructor(gameId: string) {
    super(gameId, 'alias', { maxPlayers: 16, minPlayers: 4 })
  }

  getInitialGameData(): AliasGameData {
    return {
      phase: 'team_assignment',
      teams: [
        { id: 'team-1', name: 'Team 1', playerIds: [], score: 0, describerIndex: 0 },
        { id: 'team-2', name: 'Team 2', playerIds: [], score: 0, describerIndex: 0 },
      ],
      currentTeamIndex: 0,
      turnsPerTeam: 3,
      skipPenalty: -1,
      currentCard: null,
      currentCardIndex: 0,
      currentCardResults: [],
      turnStartedAt: null,
      teamTurnCounts: { 'team-1': 0, 'team-2': 0 },
      lastTurnResult: null,
      usedWordIndices: [],
      winnerId: null,
    }
  }

  getGameRules(): string[] {
    return [
      'Two teams compete to describe words.',
      'Guessed word: +1 point. Skipped word: -1 point.',
      'Each turn: one describer, 10 words, 60 seconds.',
      '3 turns per team. Most points wins.',
    ]
  }

  addPlayer(player: Player): boolean {
    const result = super.addPlayer(player)
    if (!result) return false
    const data = this.state.data as AliasGameData
    // Assign to the team with fewer players; on tie, assign to the first team
    const smaller = data.teams.reduce((a, b) =>
      a.playerIds.length <= b.playerIds.length ? a : b
    )
    smaller.playerIds.push(player.id)
    return true
  }

  startGame(): boolean {
    const data = this.state.data as AliasGameData
    const allTeamsValid = data.teams.every(t => t.playerIds.length >= 2)
    if (!allTeamsValid) return false
    if (!super.startGame()) return false
    const card = this._dealCard()
    data.currentCard = card
    data.currentCardIndex = 0
    data.currentCardResults = []
    data.turnStartedAt = Date.now()
    data.phase = 'turn_active'
    return true
  }

  protected canProcessMoveWhenNotPlaying(_move: Move): boolean {
    return false
  }

  protected shouldAdvanceTurn(_move: Move): boolean {
    // We manage turn advancement ourselves in processMove
    return false
  }

  checkWinCondition(): Player | null {
    // Win condition is handled inline in _finishGame()
    return null
  }

  validateMove(move: Move): boolean {
    const data = this.state.data as AliasGameData
    switch (move.type) {
      case 'word_action': {
        if (data.phase !== 'turn_active') return false
        const currentTeam = data.teams[data.currentTeamIndex]
        const describerId = currentTeam.playerIds[currentTeam.describerIndex]
        if (move.playerId !== describerId) return false
        const { action } = move.data as { action: string }
        if (action !== 'guess' && action !== 'skip') return false
        if (data.currentCardIndex >= (data.currentCard?.length ?? 0)) return false
        return true
      }
      case 'end_turn': {
        if (data.phase !== 'turn_active') return false
        const currentTeam = data.teams[data.currentTeamIndex]
        const describerId = currentTeam.playerIds[currentTeam.describerIndex]
        return move.playerId === describerId
      }
      case 'next_turn': {
        return data.phase === 'turn_results'
      }
      default:
        return false
    }
  }

  processMove(move: Move): void {
    const data = this.state.data as AliasGameData
    switch (move.type) {
      case 'word_action': {
        const { action } = move.data as { action: 'guess' | 'skip' }
        if (!data.currentCard) return
        const word = data.currentCard[data.currentCardIndex]
        data.currentCardResults.push({ word, result: action === 'guess' ? 'guessed' : 'skipped' })
        data.currentCardIndex++
        this.state.lastMoveAt = Date.now()
        if (data.currentCardIndex >= (data.currentCard?.length ?? 0)) {
          this._endTurn()
        }
        break
      }
      case 'end_turn': {
        this._endTurn()
        break
      }
      case 'next_turn': {
        data.currentTeamIndex = (data.currentTeamIndex + 1) % data.teams.length
        const card = this._dealCard()
        data.currentCard = card
        data.currentCardIndex = 0
        data.currentCardResults = []
        data.turnStartedAt = Date.now()
        data.phase = 'turn_active'
        break
      }
    }
  }

  applyTimeoutFallback(turnTimerSeconds: number, nowMs: number = Date.now()): { changed: boolean } {
    const data = this.state.data as AliasGameData
    if (data.phase !== 'turn_active' || data.turnStartedAt === null) {
      return { changed: false }
    }
    const elapsed = nowMs - data.turnStartedAt
    if (elapsed < turnTimerSeconds * 1000) {
      return { changed: false }
    }
    while (data.currentCardIndex < (data.currentCard?.length ?? 0)) {
      data.currentCardResults.push({
        word: data.currentCard![data.currentCardIndex],
        result: 'skipped',
      })
      data.currentCardIndex++
    }
    this._endTurn()
    this.state.updatedAt = new Date()
    return { changed: true }
  }

  private _dealCard(): string[] {
    const data = this.state.data as AliasGameData
    let available = ALIAS_WORDS.map((_, i) => i).filter(
      i => !data.usedWordIndices.includes(i)
    )
    if (available.length < 10) {
      data.usedWordIndices = []
      available = ALIAS_WORDS.map((_, i) => i)
    }
    const arr = [...available]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    const selected = arr.slice(0, 10)
    data.usedWordIndices.push(...selected)
    return selected.map(i => ALIAS_WORDS[i])
  }

  private _endTurn(): void {
    const data = this.state.data as AliasGameData
    const guessedCount = data.currentCardResults.filter(r => r.result === 'guessed').length
    const skippedCount = data.currentCardResults.filter(r => r.result === 'skipped').length
    const scoreDelta = guessedCount - skippedCount * Math.abs(data.skipPenalty)
    const currentTeam = data.teams[data.currentTeamIndex]
    currentTeam.score += scoreDelta
    const turnIndex = data.teamTurnCounts[currentTeam.id] ?? 0
    const describerId = currentTeam.playerIds[currentTeam.describerIndex]
    data.lastTurnResult = {
      teamId: currentTeam.id,
      describerId,
      wordResults: [...data.currentCardResults],
      scoreDelta,
      turnIndex,
    }
    currentTeam.describerIndex = (currentTeam.describerIndex + 1) % currentTeam.playerIds.length
    data.teamTurnCounts[currentTeam.id] = turnIndex + 1
    data.currentCard = null
    data.currentCardResults = []

    // Check if all teams have completed all their turns
    const allDone = data.teams.every(
      t => (data.teamTurnCounts[t.id] ?? 0) >= data.turnsPerTeam
    )
    if (allDone) {
      this._finishGame(data)
    } else {
      data.phase = 'turn_results'
    }
  }

  private _finishGame(data: AliasGameData): void {
    const [team1, team2] = data.teams
    let winningTeam: (typeof data.teams)[number] | null = null
    if (team1.score > team2.score) {
      data.winnerId = team1.id
      winningTeam = team1
    } else if (team2.score > team1.score) {
      data.winnerId = team2.id
      winningTeam = team2
    } else {
      data.winnerId = 'tie'
    }
    data.phase = 'game_over'
    this.state.status = 'finished'
    // state.winner tracks the first player of the winning team (team games can't have one winner)
    this.state.winner = winningTeam?.playerIds[0] ?? undefined
  }
}
