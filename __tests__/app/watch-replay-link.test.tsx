import { render, screen, waitFor } from '@testing-library/react'
import TicTacToeLobbyPage from '@/app/(site)/lobby/[code]/tic-tac-toe-page'
import ConnectFourLobbyPage from '@/app/(site)/lobby/[code]/connect-four-page'
import CheckersLobbyPage from '@/app/(site)/lobby/[code]/checkers-page'
import RockPaperScissorsLobbyPage from '@/app/(site)/lobby/[code]/rock-paper-scissors-page'
import { CheckersGame } from '@/lib/games/checkers-game'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

/*
 * "Watch replay" on the result overlay (#1421) must only show once the game row is final.
 * Tic-Tac-Toe, Connect Four and Checkers keep one row for a whole series and send it back
 * to 'playing' with next-round, so between rounds the link would leave a live match and
 * then answer 409.
 */

const mockChannel: {
  on: jest.Mock
  subscribe: jest.Mock
} = {
  on: jest.fn(() => mockChannel),
  subscribe: jest.fn(() => mockChannel),
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), prefetch: jest.fn() }),
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'user-1' } }, status: 'authenticated' }),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: false, guestToken: null, guestId: null, guestName: null }),
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    error: jest.fn(),
    errorFrom: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
    infoText: jest.fn(),
  },
}))

jest.mock('@/lib/fetch-with-guest', () => ({ fetchWithGuest: jest.fn() }))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

jest.mock('@/lib/lobby-create-metrics', () => ({ finalizePendingLobbyCreateMetric: jest.fn() }))

jest.mock('@/lib/analytics', () => ({
  trackLobbyLeaveRedirect: jest.fn(),
  trackMoveSubmitApplied: jest.fn(),
}))

jest.mock('@/components/LoadingSpinner', () => ({
  __esModule: true,
  default: () => <div data-testid="loading-spinner" />,
}))

jest.mock('@/components/ConfirmModal', () => ({ __esModule: true, default: () => null }))

jest.mock('@/lib/lobby-realtime-topic-client', () => ({
  fetchLobbyTopic: jest.fn(async (code: string) => `lobby:${code}:test-secret`),
}))

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => ({
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn().mockResolvedValue({}),
  })),
}))

// The three layout trees mount together and the hook elects the visible one
// (#1052); jsdom's matchMedia answers `matches: false` for both queries, so the
// elected tree is 'desktop'. Saying so here rather than relying on it keeps the
// Memory desktop assertions from turning into assertions about jsdom.
const mockLayout: { current: 'desktop' | 'mobile' | 'landscape' } = { current: 'desktop' }

jest.mock('@/hooks/useActiveGameLayout', () => ({
  useActiveGameLayout: () => mockLayout.current,
}))

const PLAYERS = [
  { id: 'player-1', userId: 'user-1', name: 'Alice', score: 0, user: { username: 'Alice' } },
  { id: 'player-2', userId: 'user-2', name: 'Bob', score: 0, user: { username: 'Bob' } },
]

const lobby = (gameType: string) => ({ id: 'lobby-1', code: 'ABCD', gameType, creatorId: 'user-1', name: 'Lobby', isActive: false })

function ticTacToeRoundWon(targetRounds: number | null) {
  const engine = new TicTacToeGame('game-1', { maxPlayers: 2, minPlayers: 2, rules: { targetRounds } })
  engine.addPlayer({ id: 'user-1', name: 'Alice', score: 0, isActive: true })
  engine.addPlayer({ id: 'user-2', name: 'Bob', score: 0, isActive: true })
  engine.startGame()
  const cells: Array<[string, number, number]> = [['user-1', 0, 0], ['user-2', 1, 0], ['user-1', 0, 1], ['user-2', 1, 1], ['user-1', 0, 2]]
  for (const [playerId, row, col] of cells) {
    if (!engine.makeMove({ playerId, type: 'place', data: { row, col }, timestamp: new Date() })) throw new Error('move rejected')
  }
  const state = engine.getState()
  if (state.status !== 'finished') throw new Error('round did not finish')
  return { lobby: lobby('tic_tac_toe'), activeGame: { id: 'game-1', status: 'finished', currentTurn: 5, state, players: PLAYERS } }
}

function connectFourRoundWon() {
  const board = Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => null))
  const state = {
    status: 'finished',
    currentPlayerIndex: 0,
    players: [{ id: 'user-1', name: 'Alice' }, { id: 'user-2', name: 'Bob' }],
    data: { board, currentDisc: 1, winner: 1, winningLine: null, lastDroppedRow: null, lastDroppedCol: null, moveHistory: [] },
  }
  return { lobby: lobby('connect_four'), activeGame: { id: 'game-1', gameType: 'connect_four', status: 'finished', currentPlayerIndex: 0, state, players: PLAYERS } }
}

function checkersRoundWon() {
  const engine = new CheckersGame('game-1')
  engine.addPlayer({ id: 'user-1', name: 'Alice', score: 0, isActive: true })
  engine.addPlayer({ id: 'user-2', name: 'Bob', score: 0, isActive: true })
  engine.startGame()
  const state = engine.getState() as unknown as { status: string; winner?: string; data: Record<string, unknown> }
  state.status = 'finished'
  state.winner = 'user-1'
  state.data = { ...state.data, winner: 1 }
  return { lobby: lobby('checkers'), activeGame: { id: 'game-1', gameType: 'checkers', status: 'finished', currentTurn: 0, state, players: PLAYERS } }
}

function rockPaperScissorsMatchWon() {
  const state = {
    status: 'finished',
    currentPlayerIndex: 0,
    players: [{ id: 'user-1', name: 'Alice' }, { id: 'user-2', name: 'Bob' }],
    data: { mode: 'best-of-3', rounds: [], playerChoices: {}, scores: {}, playersReady: [], gameWinner: 'user-1' },
  }
  return { lobby: { ...lobby('rock_paper_scissors'), isActive: true }, activeGame: { id: 'game-1', gameType: 'rock_paper_scissors', status: 'finished', currentPlayerIndex: 0, state, players: PLAYERS } }
}

const mockFetch = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
const respondWith = (body: unknown) => mockFetch.mockResolvedValue({ ok: true, json: async () => body } as Response)
const overlayShown = (container: HTMLElement) =>
  waitFor(() => expect(container.querySelectorAll('[data-testid="game-result-overlay"]').length).toBeGreaterThan(0))
const replayLinks = () => screen.queryAllByRole('link', { name: 'profile.gameReplay.watch' })

describe('Watch replay on the result overlay waits for the series to end (#1421)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('tic-tac-toe: not after a round of an endless series', async () => {
    respondWith(ticTacToeRoundWon(null))
    const { container } = render(<TicTacToeLobbyPage code="ABCD" />)
    await overlayShown(container)
    expect(replayLinks()).toHaveLength(0)
  })

  it('tic-tac-toe: not after the first round of a best of 3', async () => {
    respondWith(ticTacToeRoundWon(3))
    const { container } = render(<TicTacToeLobbyPage code="ABCD" />)
    await overlayShown(container)
    expect(replayLinks()).toHaveLength(0)
  })

  it('tic-tac-toe: yes once the series is decided', async () => {
    respondWith(ticTacToeRoundWon(1))
    const { container } = render(<TicTacToeLobbyPage code="ABCD" />)
    await overlayShown(container)
    expect(replayLinks()[0]?.getAttribute('href')).toBe('/replay/game-1')
  })

  it('connect four: not after a round, since next round reuses the game', async () => {
    respondWith(connectFourRoundWon())
    const { container } = render(<ConnectFourLobbyPage code="ABCD" />)
    await overlayShown(container)
    expect(replayLinks()).toHaveLength(0)
  })

  it('checkers: not after a round, since next round reuses the game', async () => {
    respondWith(checkersRoundWon())
    const { container } = render(<CheckersLobbyPage code="ABCD" />)
    await overlayShown(container)
    expect(replayLinks()).toHaveLength(0)
  })

  it('rock paper scissors: yes, the match ends the game', async () => {
    respondWith(rockPaperScissorsMatchWon())
    const { container } = render(<RockPaperScissorsLobbyPage code="ABCD" />)
    await overlayShown(container)
    expect(replayLinks()[0]?.getAttribute('href')).toBe('/replay/game-1')
  })
})
