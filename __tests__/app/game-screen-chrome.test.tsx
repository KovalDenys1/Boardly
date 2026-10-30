import type { ComponentType } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import TicTacToeLobbyPage from '@/app/(site)/lobby/[code]/tic-tac-toe-page'
import ConnectFourLobbyPage from '@/app/(site)/lobby/[code]/connect-four-page'
import CheckersLobbyPage from '@/app/(site)/lobby/[code]/checkers-page'
import LudoLobbyPage from '@/app/(site)/lobby/[code]/ludo-page'
import RockPaperScissorsLobbyPage from '@/app/(site)/lobby/[code]/rock-paper-scissors-page'
import AliasPage from '@/app/(site)/lobby/[code]/alias-page'
import LiarsPartyPage from '@/app/(site)/lobby/[code]/liars-party-page'
import SketchAndGuessLobbyPage from '@/app/(site)/lobby/[code]/sketch-and-guess-page'
import MemoryGameBoard from '@/app/(site)/lobby/[code]/components/MemoryGameBoard'
import SpyGameBoard from '@/app/(site)/lobby/[code]/components/SpyGameBoard'
import LobbyPage from '@/app/(site)/lobby/[code]/LobbyPageClient'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { ConnectFourGame } from '@/lib/games/connect-four-game'
import { CheckersGame } from '@/lib/games/checkers-game'
import { LudoGame } from '@/lib/games/ludo-game'
import { RockPaperScissorsGame } from '@/lib/games/rock-paper-scissors-game'
import { AliasGame } from '@/lib/games/alias'
import { LiarsPartyGame } from '@/lib/games/liars-party-game'
import { SketchAndGuessGame } from '@/lib/games/sketch-and-guess-game'
import { MemoryGame } from '@/lib/games/memory-game'
import { SpyGame, SpyGamePhase } from '@/lib/games/spy-game'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

/**
 * #1566: every game screen reads the same. Each game is rendered as a player
 * sees it, in English, and asked three things – one h1 naming the game, a status
 * line in the one grammar "<whose turn>: <what to do>", and the sound control in
 * the header's actions. Only a viewer who can act is told what to do; another
 * player's turn, and anything a spectator reads, says what is happening.
 */

let mockViewerId = 'user-1'
let mockLayout: 'desktop' | 'mobile' | 'landscape' = 'desktop'

const mockChannel: any = {
  on: jest.fn(() => mockChannel),
  subscribe: jest.fn(() => mockChannel),
  track: jest.fn(),
  send: jest.fn(),
  untrack: jest.fn(),
  presenceState: jest.fn(() => ({})),
}

jest.mock('next/navigation', () => {
  const router = { replace: jest.fn(), push: jest.fn(), prefetch: jest.fn(), back: jest.fn(), refresh: jest.fn() }
  const search = new URLSearchParams()
  return {
    useRouter: () => router,
    useParams: () => ({ code: 'ABCD' }),
    usePathname: () => '/lobby/ABCD',
    useSearchParams: () => search,
  }
})
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: mockViewerId } }, status: 'authenticated' }),
}))
jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: false, guestToken: null, guestId: null, guestName: null, setGuestMode: jest.fn() }),
}))
jest.mock('@/lib/i18n-helpers', () => {
  const { englishT } = jest.requireActual('@/__tests__/fixtures/english-t')
  const translation = { t: englishT, i18n: { language: 'en' } }
  return { useTranslation: () => translation }
})
jest.mock('react-i18next', () => {
  const { englishT } = jest.requireActual('@/__tests__/fixtures/english-t')
  const translation = { t: englishT, i18n: { language: 'en' } }
  return { ...jest.requireActual('react-i18next'), useTranslation: () => translation }
})
jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn(), errorFrom: jest.fn(), success: jest.fn(), info: jest.fn(), infoText: jest.fn() },
}))
jest.mock('@/lib/fetch-with-guest', () => ({ fetchWithGuest: jest.fn() }))
jest.mock('@/lib/client-logger', () => ({
  clientLogger: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))
jest.mock('@/lib/lobby-create-metrics', () => ({ finalizePendingLobbyCreateMetric: jest.fn() }))
jest.mock('@/lib/analytics', () => new Proxy({}, { get: (_target, key) => (key === '__esModule' ? true : jest.fn()) }))
jest.mock('@vercel/analytics', () => ({ track: jest.fn() }))
jest.mock('@/lib/sound-engine', () => ({ ...jest.requireActual('@/lib/sound-engine'), playCue: jest.fn(() => true) }))
jest.mock('@/components/LoadingSpinner', () => ({ __esModule: true, default: () => <div data-testid="loading-spinner" /> }))
jest.mock('@/components/ConfirmModal', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/Chat', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/SketchAndGuessGameBoard', () => ({
  __esModule: true,
  default: () => <div data-testid="sketch-board" />,
  SketchScoreRows: () => <div data-testid="sketch-scores" />,
  emptySketchAndGuessDraft: () => ({ strokes: [], color: '#1F1B16', isThick: false, isEraser: false, guess: '' }),
  serializeSketchDrawing: (strokes: unknown[]) => JSON.stringify({ type: 'drawing', version: 1, width: 480, height: 480, strokes }),
}))
jest.mock('@/hooks/useInviteShare', () => ({ useInviteShare: () => jest.fn() }))
jest.mock('@/hooks/useActiveGameLayout', () => ({ useActiveGameLayout: () => mockLayout }))
jest.mock('@/hooks/useIsMobileViewport', () => ({ useIsMobileViewport: () => mockLayout === 'mobile' }))
jest.mock('@/hooks/useBlockedPlayers', () => {
  const blocked = {
    blocked: [], blockedIds: new Set(), ready: true, failed: false, unknown: false,
    retry: () => {}, block: async () => true, unblock: async () => true,
  }
  return { useBlockedPlayers: () => blocked }
})
jest.mock('@/app/(site)/lobby/[code]/hooks/useLobbyRouteState', () => ({
  useLobbyRouteState: () => ({ gameType: 'yahtzee', gameStatus: 'playing', loading: false, handleGameStarted: jest.fn(), handleGameReset: jest.fn() }),
}))
jest.mock('@/lib/lobby-realtime-topic-client', () => ({ fetchLobbyTopic: jest.fn(async (code: string) => `lobby:${code}:test-secret`) }))
jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => ({ channel: jest.fn(() => mockChannel), removeChannel: jest.fn().mockResolvedValue({}) })),
}))

if (!(Element.prototype as any).animate) {
  ;(Element.prototype as any).animate = function () {
    return { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null, addEventListener() {}, removeEventListener() {} }
  }
}

const NAMES = ['Alice', 'Bob', 'Cara', 'Dan']
const seats = (count: number) => NAMES.slice(0, count).map((name, index) => ({
  id: `player-${index + 1}`,
  userId: `user-${index + 1}`,
  name,
  score: 0,
  user: { id: `user-${index + 1}`, username: name },
}))

/** A live game straight out of the engine, as the lobby read returns it. */
function lobbyResponse(gameType: string, engine: any, playerCount: number, patch?: (state: any) => void) {
  const state = JSON.parse(JSON.stringify(engine.getState()))
  patch?.(state)
  return {
    lobby: { id: 'lobby-1', code: 'ABCD', gameType, creatorId: 'user-1', name: 'Lobby', isActive: true, turnTimer: 60, allowSpectators: true, maxPlayers: playerCount },
    activeGame: { id: 'game-1', status: 'playing', currentTurn: 0, state, players: seats(playerCount) },
  }
}

function started(engine: any, playerCount: number) {
  for (const seat of seats(playerCount)) engine.addPlayer({ id: seat.userId, name: seat.name, score: 0, isActive: true })
  engine.startGame()
  return engine
}

function serve(response: unknown) {
  ;(fetchWithGuest as jest.Mock).mockImplementation(async () => ({ ok: true, status: 200, json: async () => response }))
}

/** Anyone not seated at the table: not one of the players in `seats`. */
const SPECTATOR = 'spectator'
const SPECTATOR_ID = 'user-9'

type Mount = (isSpectator: boolean) => ReturnType<typeof render>

const dedicated = (Page: ComponentType<{ code: string; isSpectator?: boolean }>, gameType: string, build: () => any, playerCount: number, patch?: (state: any) => void): Mount => (isSpectator) => {
  serve(lobbyResponse(gameType, build(), playerCount, patch))
  return render(<Page code="ABCD" isSpectator={isSpectator} />)
}

const memoryBoard: Mount = (isSpectator) => {
  const state = JSON.parse(JSON.stringify(started(new MemoryGame('game-1', { maxPlayers: 4, minPlayers: 2 }), 2).getState()))
  return render(
    <MemoryGameBoard
      gameId="game-1" lobbyCode="ABCD" players={seats(2)} state={state} currentUserId={mockViewerId}
      turnTimerLimit={60} onLeave={jest.fn()} allowSpectators isSpectator={isSpectator}
    />,
  )
}

function spyBoard(patch: Record<string, unknown>): Mount {
  return (isSpectator) => {
    const engine = started(new SpyGame('game-1'), 3)
    engine.initializeRound([{ name: 'Zoo', category: 'Places', roles: ['Keeper', 'Visitor', 'Vet'] }])
    const state = JSON.parse(JSON.stringify(engine.getState()))
    Object.assign(state.data, patch)
    return render(
      <SpyGameBoard
        gameId="game-1" lobbyCode="ABCD" lobbyCreatorId="user-1" players={seats(3)} state={state}
        currentUserId={mockViewerId} isGuest={false} guestId={null} guestName={null} guestToken={null}
        onRefresh={jest.fn()} onLeave={jest.fn()} allowSpectators isSpectator={isSpectator}
      />,
    )
  }
}

function aliasEngine() {
  const engine = started(new AliasGame('game-1'), 4)
  expect(engine.makeMove({ playerId: 'user-1', type: 'start_round', data: {}, timestamp: new Date() })).toBe(true)
  const data = engine.getState().data as any
  expect(data.phase).toBe('turn_active')
  expect(data.teams[0].playerIds).toEqual(['user-1', 'user-3'])
  expect(data.teams[0].describerIndex).toBe(0)
  return engine
}

function sketchEngine() {
  const engine = started(new SketchAndGuessGame('game-1'), 3)
  expect((engine.getState().data as any).currentDrawerId).toBe('user-1')
  return engine
}

function liarsEngine() {
  const engine = started(new LiarsPartyGame('game-1'), 4)
  expect((engine.getState().data as any).currentClaimantId).toBe('user-1')
  return engine
}

interface GameCase {
  name: string
  mount: Mount
  /** The banner line, by viewer: a seat's user id, or SPECTATOR. */
  lines: Record<string, string>
}

const GAMES: GameCase[] = [
  {
    name: 'Tic-Tac-Toe',
    mount: dedicated(TicTacToeLobbyPage, 'tic_tac_toe', () => started(new TicTacToeGame('game-1'), 2), 2),
    lines: { 'user-1': 'Your turn: place a mark', 'user-2': "Alice's turn: placing a mark", [SPECTATOR]: "Alice's turn: placing a mark" },
  },
  {
    name: 'Connect Four',
    mount: dedicated(ConnectFourLobbyPage, 'connect_four', () => started(new ConnectFourGame('game-1'), 2), 2),
    lines: { 'user-1': 'Your turn: drop a disc', 'user-2': "Alice's turn: dropping a disc", [SPECTATOR]: "Alice's turn: dropping a disc" },
  },
  {
    name: 'Checkers',
    mount: dedicated(CheckersLobbyPage, 'checkers', () => started(new CheckersGame('game-1'), 2), 2),
    lines: { 'user-1': 'Your turn: move a piece', 'user-2': "Alice's turn: moving a piece", [SPECTATOR]: "Alice's turn: moving a piece" },
  },
  {
    name: 'Ludo',
    mount: dedicated(LudoLobbyPage, 'ludo', () => started(new LudoGame('game-1'), 2), 2),
    lines: { 'user-1': 'Your turn: roll the die', 'user-2': "Alice's turn: rolling the die", [SPECTATOR]: "Alice's turn: rolling the die" },
  },
  {
    name: 'Rock Paper Scissors',
    mount: dedicated(RockPaperScissorsLobbyPage, 'rock_paper_scissors', () => started(new RockPaperScissorsGame('game-1'), 2), 2, (state) => {
      state.data.playersReady = ['user-1']
    }),
    lines: { 'user-1': "Bob's turn: picking a move", 'user-2': 'Your turn: pick a move', [SPECTATOR]: "Bob's turn: picking a move" },
  },
  {
    name: 'Rock Paper Scissors',
    mount: dedicated(RockPaperScissorsLobbyPage, 'rock_paper_scissors', () => started(new RockPaperScissorsGame('game-1'), 2), 2),
    lines: { 'user-1': 'Your turn: pick a move', [SPECTATOR]: 'Both players are choosing' },
  },
  {
    name: 'Alias',
    mount: dedicated(AliasPage, 'alias', aliasEngine, 4),
    lines: {
      'user-1': 'Your turn: describe the words',
      'user-3': 'Your turn: guess the words',
      'user-2': "Alice's turn: describing the words",
      [SPECTATOR]: "Alice's turn: describing the words",
    },
  },
  {
    name: "Liar's Party",
    mount: dedicated(LiarsPartyPage, 'liars_party', liarsEngine, 4),
    lines: { 'user-1': 'Your turn: make a claim', 'user-2': "Alice's turn: making a claim", [SPECTATOR]: "Alice's turn: making a claim" },
  },
  {
    name: "Liar's Party",
    mount: dedicated(LiarsPartyPage, 'liars_party', liarsEngine, 4, (state) => {
      state.data.phase = 'challenge'
      state.data.claim = { playerId: 'user-1', text: 'I have never lost at chess', isBluff: true, submittedAt: Date.now() }
      state.data.challengeVotes = [{ playerId: 'user-3', decision: 'believe', submittedAt: Date.now() }]
    }),
    lines: {
      'user-1': 'The table is voting on your claim',
      'user-2': "Everyone's turn: challenge or believe",
      'user-3': 'The table is voting',
      [SPECTATOR]: 'The table is voting',
    },
  },
  {
    name: 'Sketch & Guess',
    mount: dedicated(SketchAndGuessLobbyPage, 'sketch_and_guess', sketchEngine, 3),
    lines: { 'user-1': 'Your turn: choose a word', 'user-2': "Alice's turn: choosing a word", [SPECTATOR]: "Alice's turn: choosing a word" },
  },
  {
    name: 'Sketch & Guess',
    mount: dedicated(SketchAndGuessLobbyPage, 'sketch_and_guess', sketchEngine, 3, (state) => {
      state.data.phase = 'drawing'
      state.data.submittedPlayerIds = ['user-3']
    }),
    lines: {
      'user-1': 'Your turn: draw the word',
      'user-2': 'Your turn: guess the drawing',
      'user-3': "Alice's turn: drawing",
      [SPECTATOR]: "Alice's turn: drawing",
    },
  },
  {
    name: 'Memory',
    mount: memoryBoard,
    lines: { 'user-1': 'Your turn: flip two cards', 'user-2': "Alice's turn: flipping cards", [SPECTATOR]: "Alice's turn: flipping cards" },
  },
  {
    name: 'Guess the Spy',
    mount: spyBoard({ playersReady: ['user-2'] }),
    lines: {
      'user-1': "Everyone's turn: check your role",
      'user-2': 'Players are checking their roles',
      [SPECTATOR]: 'Players are checking their roles',
    },
  },
  {
    name: 'Guess the Spy',
    mount: spyBoard({ phase: SpyGamePhase.QUESTIONING, playersReady: ['user-1', 'user-2', 'user-3'], currentQuestionerId: 'user-1', currentTargetId: null, pendingQuestion: null }),
    lines: { 'user-1': 'Your turn: ask a question', 'user-2': "Alice's turn: asking a question", [SPECTATOR]: "Alice's turn: asking a question" },
  },
  {
    name: 'Guess the Spy',
    mount: spyBoard({ phase: SpyGamePhase.VOTING, playersReady: ['user-1', 'user-2', 'user-3'], votes: { 'user-2': 'user-3' } }),
    lines: { 'user-1': "Everyone's turn: vote for the spy", 'user-2': 'Players are voting', [SPECTATOR]: 'Players are voting' },
  },
]

const ONE_GRAMMAR = /^(Your turn|.+'s turn|Everyone's turn): \S.*$/

beforeEach(() => {
  jest.clearAllMocks()
  mockViewerId = 'user-1'
  mockLayout = 'desktop'
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })) as unknown as typeof fetch
})

describe.each(GAMES.map((game) => [game.name, Object.keys(game.lines).join(' / '), game] as const))('%s (%s)', (_name, _viewers, game) => {
  it.each(Object.entries(game.lines))('reads the status line to %s', async (viewer, line) => {
    mockViewerId = viewer === SPECTATOR ? SPECTATOR_ID : viewer
    game.mount(viewer === SPECTATOR)
    const titles = await screen.findAllByTestId('game-status-title', undefined, { timeout: 3000 })
    for (const title of titles) {
      expect(title.textContent).toBe(line)
      const whose = title.getAttribute('data-turn')
      if (whose !== 'nobody') expect(title.textContent).toMatch(ONE_GRAMMAR)
      // Only "you" and "everyone" carry an instruction, and only to a viewer who can act on it.
      if (viewer === SPECTATOR) expect(['player', 'nobody']).toContain(whose)
    }
  })

  it('has exactly one h1, and it names the game', async () => {
    const { container } = game.mount(false)
    await screen.findAllByTestId('game-status-title', undefined, { timeout: 3000 })
    const headings = container.querySelectorAll('h1')
    expect(headings).toHaveLength(1)
    expect(headings[0].textContent).toBe(game.name)
  })

  it('puts the sound control in the header actions', async () => {
    const { container } = game.mount(false)
    await screen.findAllByTestId('game-status-title', undefined, { timeout: 3000 })
    const headers = [...container.querySelectorAll('.game-header')]
    expect(headers.length).toBeGreaterThan(0)
    for (const header of headers) {
      const actions = header.querySelector('.game-header__actions') as HTMLElement
      expect(within(actions).getByRole('button', { name: 'Sound' })).toBeTruthy()
    }
  })
})

describe('Yahtzee below 1024px', () => {
  jest.setTimeout(15000)

  function yahtzeeResponse(playerCount: number) {
    const engine = started(new YahtzeeGame('game-1'), playerCount)
    return lobbyResponse('yahtzee', engine, playerCount, (state) => {
      state.players.forEach((player: any, index: number) => { player.score = (index + 1) * 10 })
    })
  }

  async function mountYahtzee(playerCount: number) {
    const response = yahtzeeResponse(playerCount)
    serve(response)
    // The shared lobby shell reads its lobby with plain fetch.
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (String(url).startsWith('/api/lobby/ABCD?') ? response : {}),
    })) as unknown as typeof fetch
    const view = render(<LobbyPage />)
    await waitFor(() => expect(view.container.querySelector('.yahtzee-screen')).not.toBeNull(), { timeout: 8000 })
    return view
  }

  it('has one h1 naming the game and the shared status line', async () => {
    mockLayout = 'mobile'
    const { container } = await mountYahtzee(2)
    const headings = container.querySelectorAll('h1')
    expect(headings).toHaveLength(1)
    expect(headings[0].textContent).toBe('Yahtzee')
    const titles = within(container.querySelector('.yahtzee-screen') as HTMLElement).getAllByTestId('game-status-title')
    expect(titles.map((title) => title.textContent)).toEqual(['Your turn: roll the dice'])
  })

  it.each([['user-2', "Alice's turn: rolling the dice"], [SPECTATOR_ID, "Alice's turn: rolling the dice"]])('tells %s what Alice is doing, not what to do', async (viewer, line) => {
    mockViewerId = viewer
    mockLayout = 'mobile'
    const { container } = await mountYahtzee(2)
    const titles = within(container.querySelector('.yahtzee-screen') as HTMLElement).getAllByTestId('game-status-title')
    expect(titles.map((title) => title.textContent)).toEqual([line])
  })
})
