/**
 * #1133 item 1: no analytics field carries a player's name. `game_completed` used to
 * send `winner` (a name) and `final_scores` as name + score pairs to Vercel Analytics;
 * the question it answers — how games end — needs a seat and the numbers only.
 */
import { GameSessionAnalytics, trackAuth, trackGameCompleted } from '@/lib/analytics'
import { track } from '@vercel/analytics'

jest.mock('@vercel/analytics', () => ({
  track: jest.fn(),
}))

const mockTrack = track as jest.MockedFunction<typeof track>

describe('game_completed', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('sends the winner seat and the scores, with no name field', () => {
    trackGameCompleted({
      gameType: 'yahtzee',
      duration: 12,
      playerCount: 2,
      winnerSeat: 1,
      wasBot: true,
      finalScores: [180, 231],
    })

    expect(mockTrack).toHaveBeenCalledWith('game_completed', {
      game_type: 'yahtzee',
      duration_minutes: 12,
      player_count: 2,
      winner_seat: 1,
      winner_was_bot: true,
      final_scores: '[180,231]',
    })
  })

  it('sends null for a game nobody won', () => {
    trackGameCompleted({
      gameType: 'yahtzee',
      duration: 3,
      playerCount: 2,
      winnerSeat: null,
      wasBot: false,
      finalScores: [100, 100],
    })

    expect(mockTrack.mock.calls[0][1]).toEqual(expect.objectContaining({ winner_seat: null }))
  })

  it('GameSessionAnalytics.end passes the same name-free shape through', () => {
    new GameSessionAnalytics('yahtzee').end(0, false, 2, [250, 120])

    const completed = mockTrack.mock.calls.find(([name]) => name === 'game_completed')
    expect(completed?.[1]).toEqual(expect.objectContaining({ winner_seat: 0, final_scores: '[250,120]' }))
    expect(completed?.[1]).not.toHaveProperty('winner')
  })
})

describe('auth', () => {
  it('sends the method and the outcome only', () => {
    jest.clearAllMocks()
    trackAuth({ event: 'login', method: 'email', success: true })
    expect(mockTrack).toHaveBeenCalledWith('auth', { method: 'email', success: true })
  })
})
