// @ts-nocheck
import { act, render, screen, within } from '@testing-library/react'
import SpyGameBoard from '@/app/lobby/[code]/components/SpyGameBoard'
import { SpyGame, SpyGamePhase } from '@/lib/games/spy-game'

/**
 * #1263 on the board: the spy's Guess button only while the engine takes a
 * guess, a player who left is no longer offered as a vote target or counted,
 * and the board asks the server to close the vote once its clock runs out.
 */

jest.mock('@/lib/i18n-helpers', () => {
  const t = (key: string, opts?: Record<string, unknown>) =>
    opts ? `${key}:${JSON.stringify(opts)}` : key
  return { useTranslation: () => ({ t }) }
})
jest.mock('@/lib/analytics', () => ({ trackMoveSubmitApplied: jest.fn() }))
jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}))
jest.mock('@/components/Chat', () => ({ __esModule: true, default: () => null }))

const IDS = ['user-a', 'user-b', 'user-c', 'user-d']
const NAMES: Record<string, string> = { 'user-a': 'Alice', 'user-b': 'Bob', 'user-c': 'Carol', 'user-d': 'Dave' }
const SPY = 'user-b'

function gameIn(phase: SpyGamePhase) {
  const game = new SpyGame('game-1')
  for (const id of IDS) game.addPlayer({ id, name: NAMES[id] })
  game.startGame()
  const data = game.getState().data
  data.phase = phase
  data.spyPlayerId = SPY
  data.allLocationNames = ['Airport', 'Zoo']
  data.phaseStartTime = Date.now()
  return game
}

function renderBoard(game: SpyGame, currentUserId: string, onRefresh = jest.fn()) {
  return render(
    <SpyGameBoard
      gameId="game-1"
      lobbyCode="ABCD"
      lobbyCreatorId="user-a"
      players={IDS.map((id) => ({ id: `player-${id}`, userId: id, score: 0, name: NAMES[id], user: { username: NAMES[id] } }))}
      state={game.getState()}
      currentUserId={currentUserId}
      isGuest={false}
      guestId={null}
      guestName={null}
      guestToken={null}
      onRefresh={onRefresh}
    />
  )
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      roleInfo: { role: 'Spy', possibleCategories: ['Travel'], possibleLocations: ['Airport', 'Zoo'] },
    }),
  })
})

afterEach(() => {
  jest.useRealTimers()
})

describe('SpyGameBoard: the spy guess button (#1263)', () => {
  it('offers the guess while the questions run', async () => {
    renderBoard(gameIn(SpyGamePhase.QUESTIONING), SPY)
    expect((await screen.findAllByText('spy.guessLocation')).length).toBeGreaterThan(0)
  })

  it('hides it during the vote, when the server would refuse it', async () => {
    renderBoard(gameIn(SpyGamePhase.VOTING), SPY)
    // The role card is there (the fetch landed), the button is not.
    expect((await screen.findAllByText('spy.roles.spy')).length).toBeGreaterThan(0)
    expect(screen.queryByText('spy.guessLocation')).toBeNull()
  })
})

describe('SpyGameBoard: a player who left (#1263)', () => {
  it('is not offered as a vote target, nor counted in the tally', async () => {
    const game = gameIn(SpyGamePhase.VOTING)
    game.getState().players.find((p) => p.id === 'user-d').isActive = false
    renderBoard(game, 'user-a')
    await screen.findAllByText('spy.roles.spy')

    const buttons = screen.getAllByRole('button').map((b) => b.textContent || '')
    expect(buttons.some((text) => text.includes('Carol'))).toBe(true)
    expect(buttons.some((text) => text.includes('Dave'))).toBe(false)
    expect(screen.getAllByText('0/3').length).toBeGreaterThan(0)
  })
})

describe('SpyGameBoard: the vote clock (#1263)', () => {
  it('asks the server to close the vote once its 60 seconds are up, and keeps asking', async () => {
    jest.useFakeTimers()
    const game = gameIn(SpyGamePhase.VOTING)
    game.getState().data.phaseStartTime = Date.now() - 58_000
    const onRefresh = jest.fn().mockResolvedValue(undefined)
    renderBoard(game, 'user-a', onRefresh)

    await act(async () => {
      jest.advanceTimersByTime(1_000)
    })
    expect(onRefresh).not.toHaveBeenCalled()

    await act(async () => {
      jest.advanceTimersByTime(2_000)
    })
    expect(onRefresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      jest.advanceTimersByTime(5_000)
    })
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })

  it('does not ask while the questions run', async () => {
    jest.useFakeTimers()
    const game = gameIn(SpyGamePhase.QUESTIONING)
    game.getState().data.phaseStartTime = Date.now() - 600_000
    const onRefresh = jest.fn().mockResolvedValue(undefined)
    renderBoard(game, 'user-a', onRefresh)

    await act(async () => {
      jest.advanceTimersByTime(10_000)
    })
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
