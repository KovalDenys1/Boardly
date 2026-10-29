// @ts-nocheck
import { render, screen } from '@testing-library/react'
import SpyGameBoard from '@/app/(site)/lobby/[code]/components/SpyGameBoard'
import { SpyGame, SpyGamePhase } from '@/lib/games/spy-game'

/**
 * #1380: role reveal and voting are shared phases - every seat acts at once,
 * so no seat holds a turn. And between rounds only the host can start the
 * next one, so everyone else needs to be told they are waiting for the host.
 */

jest.mock('@/lib/i18n-helpers', () => {
  const t = (key: string, opts?: Record<string, unknown>) =>
    opts ? `${key}:${JSON.stringify(opts)}` : key
  return { useTranslation: () => ({ t }) }
})

jest.mock('@/lib/analytics', () => ({
  trackMoveSubmitApplied: jest.fn(),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}))

jest.mock('@/components/Chat', () => ({
  __esModule: true,
  default: () => null,
}))

const HOST = 'user-host'
const SECOND = 'user-second'
const THIRD = 'user-third'
const NAMES: Record<string, string> = { [HOST]: 'Alice', [SECOND]: 'Bob', [THIRD]: 'Carol' }

function buildGame(patch: Record<string, unknown>) {
  const game = new SpyGame('game-1')
  for (const id of [HOST, SECOND, THIRD]) {
    game.addPlayer({ id, name: NAMES[id], isActive: true })
  }
  game.startGame()
  const state = game.getState()
  Object.assign(state.data, {
    currentRound: 1,
    totalRounds: 3,
    location: 'Zoo',
    spyPlayerId: SECOND,
    playersReady: [],
    votes: {},
    scores: {},
    currentQuestionerId: HOST,
    currentTargetId: THIRD,
    phaseStartTime: Date.now(),
    ...patch,
  })
  return state
}

function renderBoard(state, currentUserId: string) {
  return render(
    <SpyGameBoard
      gameId="game-1"
      lobbyCode="ABCD"
      lobbyCreatorId={HOST}
      players={[HOST, SECOND, THIRD].map((id) => ({
        id: `player-${id}`,
        userId: id,
        score: 0,
        name: NAMES[id],
        user: { username: NAMES[id] },
      }))}
      state={state}
      currentUserId={currentUserId}
      isGuest={false}
      guestId={null}
      guestName={null}
      guestToken={null}
      onRefresh={jest.fn()}
    />
  )
}

function turnMarkers(container: HTMLElement) {
  return {
    activeSeats:
      container.querySelectorAll('.game-player-card[data-active="true"]').length +
      container.querySelectorAll('.spy-player-row-active').length,
    labels:
      screen.queryAllByText('game.ui.yourTurn').length + screen.queryAllByText('game.ui.theirTurn').length,
  }
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ roleInfo: null }),
  })
})

describe('SpyGameBoard turn marker in shared phases (#1380)', () => {
  it.each([
    ['role reveal', { phase: SpyGamePhase.ROLE_REVEAL, playersReady: [HOST] }],
    ['voting', { phase: SpyGamePhase.VOTING, votes: { [HOST]: THIRD } }],
  ])('marks no seat as holding the turn during %s', (_name, patch) => {
    for (const viewer of [HOST, SECOND, THIRD]) {
      const { container, unmount } = renderBoard(buildGame(patch), viewer)
      expect(turnMarkers(container)).toEqual({ activeSeats: 0, labels: 0 })
      unmount()
    }
  })

  it('still marks the questioner during questioning', () => {
    const { container } = renderBoard(buildGame({ phase: SpyGamePhase.QUESTIONING }), SECOND)
    expect(turnMarkers(container).activeSeats).toBeGreaterThan(0)
    expect(screen.queryAllByText('game.ui.theirTurn').length).toBeGreaterThan(0)
  })
})

describe('SpyGameBoard round results next step (#1380)', () => {
  const results = { phase: SpyGamePhase.RESULTS, votes: { [HOST]: SECOND, [SECOND]: THIRD, [THIRD]: SECOND } }

  it('tells a non-host that the host starts the next round', () => {
    renderBoard(buildGame(results), THIRD)
    expect(screen.queryAllByText('game.ui.waitingForHost').length).toBeGreaterThan(0)
    expect(screen.queryByText('spy.nextRound')).toBeNull()
  })

  it('gives the host the next-round button instead of the waiting line', () => {
    renderBoard(buildGame(results), HOST)
    expect(screen.queryAllByText('spy.nextRound').length).toBeGreaterThan(0)
    expect(screen.queryByText('game.ui.waitingForHost')).toBeNull()
  })
})
