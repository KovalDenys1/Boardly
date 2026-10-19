// @ts-nocheck
import { act, render, screen, within } from '@testing-library/react'
import SpyGameBoard from '@/app/lobby/[code]/components/SpyGameBoard'
import { SpyGame, SpyGamePhase } from '@/lib/games/spy-game'



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

describe('SpyGameBoard: a question waiting for its answer', () => {
  it('shows the rest of the table the question and whose answer it waits for', async () => {
    const game = gameIn(SpyGamePhase.QUESTIONING)
    const data = game.getState().data
    data.currentQuestionerId = 'user-a'
    data.currentTargetId = 'user-b'
    data.pendingQuestion = 'Is it warm in here?'

    renderBoard(game, 'user-c')

    expect((await screen.findAllByText('Is it warm in here?')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('spy.waitingForAnswer:{"player":"Bob"}', { exact: false }).length).toBeGreaterThan(0)
    expect(screen.queryAllByText(/spy\.decidingQuestion/)).toHaveLength(0)
  })
})

describe('SpyGameBoard: the host start-voting button (#1481)', () => {
  it('lets a long label wrap inside the button instead of running out of it', async () => {
    const game = gameIn(SpyGamePhase.QUESTIONING)
    renderBoard(game, 'user-a')

    const buttons = await screen.findAllByRole('button', { name: 'spy.startVoting' })
    // .bd-btn is nowrap, which is what pushed the Russian label past the button edge.
    for (const button of buttons) {
      expect(button.className).toMatch(/\bwhitespace-normal\b/)
      expect(button.className).toMatch(/\btext-center\b/)
    }
  })
})
