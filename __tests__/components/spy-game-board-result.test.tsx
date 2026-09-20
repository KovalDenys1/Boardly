// @ts-nocheck
import { render, screen, within } from '@testing-library/react'
import SpyGameBoard from '@/app/lobby/[code]/components/SpyGameBoard'
import { SpyGame, SpyGamePhase } from '@/lib/games/spy-game'

/**
 * #905 review, BLOCKER: the game-over overlay titled itself from
 * resolveSpyOutcome, which reads the CURRENT round only, while the engine picks
 * the winner from the cumulative scores across all three rounds and writes it to
 * state.winner. So a table where the spy escaped the last round read "Spy Wins!"
 * over a score table whose top row was somebody else, and the trophy went to a
 * player who had not won.
 *
 * These drive the real SpyGame to a finished final round rather than
 * hand-writing a state blob, because the disagreement is precisely between what
 * the engine computes and what the screen prints - a fixture would just be the
 * screen's opinion twice.
 */

// One `t` across renders (lib/i18n-helpers.ts keeps it stable), echoing
// `key:{options}` so interpolated names are readable in the DOM.
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

const SPY = 'guest-38f84943-8c99-4de1-ace8-00973711c848'
const LEADER = 'cmuabbsne000072si1gg8rjbq'
const THIRD = 'cmuabbsne000072si1gg8rjbr'

const NAMES: Record<string, string> = { [SPY]: 'Bob', [LEADER]: 'Alice', [THIRD]: 'Carol' }

/**
 * A finished three-round game in which the LAST round went to the spy - the
 * table voted out an innocent - while the cumulative scores put a regular on
 * top. The two answers are different, which is the whole point.
 */
function buildFinishedGame() {
  const game = new SpyGame('game-1')
  for (const id of [LEADER, SPY, THIRD]) {
    game.addPlayer({ id, name: NAMES[id], isActive: true })
  }
  game.startGame()

  const state = game.getState()
  const data = state.data
  data.phase = SpyGamePhase.VOTING
  data.currentRound = 3
  data.totalRounds = 3
  data.location = 'Zoo'
  data.spyPlayerId = SPY
  // Two rounds already banked: Alice well clear, Bob second.
  data.scores = { [LEADER]: 900, [SPY]: 400, [THIRD]: 150 }
  data.votes = {}

  // Alice and Bob vote Carol, Carol votes Alice: Carol is eliminated, the spy
  // escapes, so the ROUND is the spy's.
  const vote = (playerId: string, targetId: string) =>
    game.makeMove({ playerId, type: 'vote', data: { targetId }, timestamp: Date.now() })
  vote(LEADER, THIRD)
  vote(SPY, THIRD)
  vote(THIRD, LEADER)

  return game
}

function renderBoard(game: SpyGame, currentUserId: string, overrides: Record<string, unknown> = {}) {
  const state = game.getState()
  return render(
    <SpyGameBoard
      gameId="game-1"
      lobbyCode="ABCD"
      lobbyCreatorId={LEADER}
      players={[LEADER, SPY, THIRD].map((id) => ({
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
      {...overrides}
    />
  )
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ roleInfo: null }),
  })
})

describe('SpyGameBoard game-over result (#905 review)', () => {
  it('finishes the game on the engine, with the last round going the other way', () => {
    const state = buildFinishedGame().getState()
    // The premise of every assertion below: the engine has finished the game,
    // named a winner, and that winner is not the spy who took round 3.
    expect(state.status).toBe('finished')
    expect(state.winner).toBe(LEADER)
    expect(state.data.spyPlayerId).toBe(SPY)
    expect(state.data.scores[LEADER]).toBeGreaterThan(state.data.scores[SPY])
  })

  it('names the engine winner, not the last round verdict', () => {
    renderBoard(buildFinishedGame(), THIRD)

    const overlay = within(screen.getAllByTestId('game-result-overlay')[0])
    expect(overlay.getByText('spy.gameWinner:{"player":"Alice"}')).toBeTruthy()
    // The spy did take round 3, and the results panel underneath still says so
    // - that is the round. The overlay is the GAME, and must not repeat it.
    expect(overlay.queryByText('spy.spyWins')).toBeNull()
    expect(overlay.queryByText('spy.regularsWin')).toBeNull()
  })

  it('makes the results panel under the overlay say the same thing', () => {
    renderBoard(buildFinishedGame(), THIRD)

    const plate = screen.getAllByTestId('spy-game-result')[0]
    expect(plate.textContent).toContain('spy.gameWinner:{"player":"Alice"}')
  })

  it('gives the trophy to the winner and withholds it from the spy who took the round', () => {
    const { unmount } = renderBoard(buildFinishedGame(), LEADER)
    const winnerOverlay = screen.getAllByTestId('game-result-overlay')[0]
    expect(winnerOverlay.querySelector('[data-icon="trophy"]')).toBeTruthy()
    expect(within(winnerOverlay).getByText('spy.youWinGame')).toBeTruthy()
    unmount()

    // The spy won round 3 and still lost the game: no trophy, and the title
    // names Alice rather than them.
    renderBoard(buildFinishedGame(), SPY)
    const spyOverlay = screen.getAllByTestId('game-result-overlay')[0]
    expect(spyOverlay.querySelector('[data-icon="trophy"]')).toBeNull()
    expect(within(spyOverlay).getByText('spy.gameWinner:{"player":"Alice"}')).toBeTruthy()
  })

  /**
   * #905 keeps the board mounted after the game finishes, which removed the
   * automatic drop back to the waiting room without adding a replacement: the
   * lobby's settings, invite, add-bot and kick controls became unreachable.
   */
  it('offers the host a route back to the waiting room', () => {
    const onReturnToWaiting = jest.fn()
    renderBoard(buildFinishedGame(), LEADER, { onReturnToWaiting })

    const buttons = screen.getAllByText('game.ui.returnToLobby')
    expect(buttons.length).toBeGreaterThan(0)
    buttons[0].click()
    expect(onReturnToWaiting).toHaveBeenCalled()
  })

  it('offers no such route when the viewer is not the host', () => {
    renderBoard(buildFinishedGame(), THIRD)
    expect(screen.queryByText('game.ui.returnToLobby')).toBeNull()
  })
})
