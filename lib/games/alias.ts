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

/**
 * The player count at which Alias stops being a team game.
 *
 * Alias needs somebody to describe to, which is why the minimum was four: a
 * team of one has no guesser and its turn cannot happen at all. 61% of Alias
 * lobbies never started, so the minimum is now three — played the way three
 * people actually play it, with everyone as their own team, the describer
 * rotating, and the two who are not describing both guessing (#847).
 */
export const SOLO_PLAYER_COUNT = 3

export class AliasGame extends GameEngine {
  constructor(gameId: string) {
    super(gameId, 'alias', { maxPlayers: 16, minPlayers: SOLO_PLAYER_COUNT })
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
    this.syncTeamLayout()
    return true
  }

  /**
   * Keep the team layout matching the number of people in the room, so the
   * lobby shows the game that is actually about to be played rather than
   * rearranging itself at the start whistle.
   *
   * Only ever runs during team assignment: once a round is under way the teams
   * carry scores and turn counts, and a fourth player arriving mid-game must
   * not dissolve them.
   */
  syncTeamLayout(): void {
    const data = this.state.data as AliasGameData
    if (data.phase !== 'team_assignment') return

    // Someone who has left is still on state.players until the row is cleaned
    // up, and a team built for them would never get a turn.
    const players = this.state.players.filter((p) => p.isActive !== false)
    const isSolo = data.teams.length === SOLO_PLAYER_COUNT

    if (players.length === SOLO_PLAYER_COUNT) {
      if (isSolo && data.teams.every((t, i) => t.playerIds[0] === players[i]?.id)) return
      data.teams = players.map((player, i) => ({
        id: `team-${i + 1}`,
        name: player.name,
        playerIds: [player.id],
        score: 0,
        describerIndex: 0,
      }))
    } else if (isSolo) {
      // Back to two teams: the solo layout only ever holds for exactly three.
      const ordered = players.map((p) => p.id)
      data.teams = [
        { id: 'team-1', name: 'Team 1', playerIds: [], score: 0, describerIndex: 0 },
        { id: 'team-2', name: 'Team 2', playerIds: [], score: 0, describerIndex: 0 },
      ]
      ordered.forEach((id, i) => data.teams[i % 2].playerIds.push(id))
    } else {
      return
    }

    data.currentTeamIndex = 0
    data.teamTurnCounts = Object.fromEntries(data.teams.map((t) => [t.id, 0]))
  }

  /** True while the three-player layout is in force — one player per team. */
  isSoloLayout(): boolean {
    return (this.state.data as AliasGameData).teams.length === SOLO_PLAYER_COUNT
  }

  startGame(): boolean {
    if (!super.startGame()) return false
    // Stay in team_assignment phase — players rearrange teams, host calls start_round
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
      case 'assign_team': {
        if (data.phase !== 'team_assignment') return false
        // With three players every team is one player, so there is nothing to
        // switch to — moving would leave someone with an empty team (#847).
        if (this.isSoloLayout()) return false
        const { teamId } = move.data as { teamId: string }
        return data.teams.some(t => t.id === teamId)
      }
      case 'start_round': {
        if (data.phase !== 'team_assignment') return false
        return data.teams.every(t => t.playerIds.length >= 1)
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
      case 'assign_team': {
        const { teamId } = move.data as { teamId: string }
        for (const team of data.teams) {
          team.playerIds = team.playerIds.filter(id => id !== move.playerId)
        }
        const target = data.teams.find(t => t.id === teamId)
        if (target) target.playerIds.push(move.playerId)
        break
      }
      case 'start_round': {
        // Last chance to match the layout to the room: someone may have left
        // during assignment, which is the one case addPlayer cannot catch.
        this.syncTeamLayout()
        // Assign any unassigned players to the smallest team
        const assignedIds = new Set(data.teams.flatMap(t => t.playerIds))
        for (const player of this.state.players) {
          if (!assignedIds.has(player.id)) {
            const smallest = data.teams.reduce((a, b) =>
              a.playerIds.length <= b.playerIds.length ? a : b
            )
            smallest.playerIds.push(player.id)
          }
        }
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

  handlePlayerLeave(playerId: string): boolean {
    const data = this.state.data as AliasGameData
    let changed = false

    for (const team of data.teams) {
      const idx = team.playerIds.indexOf(playerId)
      if (idx === -1) continue

      const isCurrentTeam = data.teams[data.currentTeamIndex]?.id === team.id
      const isCurrentDescriber = idx === team.describerIndex

      // End the active turn if the current describer is leaving
      if (isCurrentTeam && isCurrentDescriber && data.phase === 'turn_active') {
        this._endTurn()
        // _endTurn() advanced describerIndex; re-clamp after splice below
      }

      team.playerIds.splice(idx, 1)

      if (team.playerIds.length > 0) {
        if (!isCurrentDescriber && idx < team.describerIndex) {
          team.describerIndex--
        } else if (isCurrentDescriber) {
          team.describerIndex = team.describerIndex % team.playerIds.length
        }
      } else {
        team.describerIndex = 0
      }

      this.state.updatedAt = new Date()
      changed = true
      break
    }

    return changed
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
    // Written for any number of teams: with three players there are three of
    // them, one per person (#847).
    const best = Math.max(...data.teams.map((t) => t.score))
    const leaders = data.teams.filter((t) => t.score === best)
    const winningTeam = leaders.length === 1 ? leaders[0] : null
    data.winnerId = winningTeam ? winningTeam.id : 'tie'
    data.phase = 'game_over'
    this.state.status = 'finished'
    // state.winner tracks the first player of the winning team (team games can't have one winner)
    this.state.winner = winningTeam?.playerIds[0] ?? undefined
  }
}

/**
 * Hides the active word card from everyone except the describer.
 *
 * `currentCard` holds the whole run of words for the turn, including ones the
 * describer has not reached yet, and it was previously broadcast to every player
 * — so a guesser could read the answers straight out of the network payload
 * (#716). The UI only ever renders the word on the describer's screen, so
 * redacting it for everyone else costs nothing visually.
 *
 * `currentCardResults` and `lastTurnResult` are left intact: those words have
 * already been guessed or skipped in front of the whole table.
 */
export function sanitizeAliasStateForBroadcast<T extends { data?: unknown; status?: string }>(
  state: T,
  viewerUserId: string | null = null
): T {
  const data = state.data as AliasGameData | undefined
  if (!data) return state

  // `usedWordIndices` never leaves the server (#1249). The deal pushes the card's
  // indices before it returns the words, so mid-turn its last ten entries are the
  // live card in order, and ALIAS_WORDS ships in the client bundle – redacting
  // `currentCard` alone left the card one lookup away. No client reads it; only
  // `_dealCard` does, on the server's own copy of the state.
  const withoutDeck = { ...data, usedWordIndices: [] as number[] }

  // Outside an active turn there is no live card to protect.
  if (!data.currentCard || data.phase !== 'turn_active') return { ...state, data: withoutDeck }

  const currentTeam = Array.isArray(data.teams) ? data.teams[data.currentTeamIndex] : undefined
  const describerId = currentTeam?.playerIds?.[currentTeam.describerIndex]
  if (viewerUserId !== null && describerId === viewerUserId) return { ...state, data: withoutDeck }

  return { ...state, data: { ...withoutDeck, currentCard: null } }
}
