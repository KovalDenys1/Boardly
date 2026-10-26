// @ts-nocheck
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import SpyGameBoard from '@/app/(site)/lobby/[code]/components/SpyGameBoard'
import { SpyGame, SpyGamePhase } from '@/lib/games/spy-game'
import { showToast } from '@/lib/i18n-toast'
import { acceptTerms } from '@/lib/client/terms-consent'

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
jest.mock('@/lib/client/terms-consent', () => ({
  ...jest.requireActual('@/lib/client/terms-consent'),
  acceptTerms: jest.fn(),
}))

let mockBlockedIds: ReadonlySet<string> = new Set()
jest.mock('@/hooks/useBlockedPlayers', () => ({
  useBlockedPlayers: () => ({
    blocked: [],
    blockedIds: mockBlockedIds,
    ready: true,
    failed: false,
    unknown: false,
    retry: jest.fn(),
    block: jest.fn(),
    unblock: jest.fn(),
  }),
}))

const IDS = ['user-a', 'user-b', 'user-c', 'user-d']
const NAMES: Record<string, string> = { 'user-a': 'Alice', 'user-b': 'Bob', 'user-c': 'Carol', 'user-d': 'Dave' }

function questioningGame() {
  const game = new SpyGame('game-1')
  for (const id of IDS) game.addPlayer({ id, name: NAMES[id] })
  game.startGame()
  const data = game.getState().data
  data.phase = SpyGamePhase.QUESTIONING
  data.spyPlayerId = 'user-b'
  data.allLocationNames = ['Airport', 'Zoo']
  data.phaseStartTime = Date.now()
  data.currentQuestionerId = 'user-a'
  data.currentTargetId = null
  data.pendingQuestion = null
  return game
}

function renderBoard(game: SpyGame, currentUserId: string, extra: Record<string, unknown> = {}) {
  return render(
    <SpyGameBoard
      gameId="game-1"
      lobbyCode="ABCD"
      lobbyCreatorId="user-d"
      players={IDS.map((id) => ({ id: `player-${id}`, userId: id, score: 0, name: NAMES[id], user: { username: NAMES[id] } }))}
      state={game.getState()}
      currentUserId={currentUserId}
      isGuest={false}
      guestId={null}
      guestName={null}
      guestToken={null}
      onRefresh={jest.fn()}
      {...extra}
    />
  )
}

/** The desktop tree; the board renders one per layout and CSS shows one. */
const board = () => within(screen.getByTestId('spy-board'))

function response(status: number, body: unknown) {
  const make = () => ({ ok: status >= 200 && status < 300, status, json: async () => body, clone: make })
  return make()
}

let spyActions: Array<Record<string, unknown>> = []

function serveTermsRefusal() {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/spy-action')) {
      spyActions.push(JSON.parse(String(init?.body)))
      return response(403, { error: 'Accept the Terms of Use first', code: 'TERMS_REQUIRED' })
    }
    return response(200, { roleInfo: { role: 'Regular', location: 'Airport', locationRole: 'Pilot' } })
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockBlockedIds = new Set()
  spyActions = []
  serveTermsRefusal()
})

describe('SpyGameBoard: the terms before a question or an answer (#1482)', () => {
  it('puts the consent panel in place of the question box after a TERMS_REQUIRED refusal, and gives the question back', async () => {
    const onAcceptChatTerms = jest.fn().mockResolvedValue(true)
    renderBoard(questioningGame(), 'user-a', { chatTermsAccepted: null, onAcceptChatTerms })

    fireEvent.change(board().getByPlaceholderText('spy.askQuestion'), { target: { value: 'Is the food good here?' } })
    fireEvent.click(board().getByRole('button', { name: 'spy.askButton' }))

    await waitFor(() => expect(board().getByRole('button', { name: 'chat.termsAcceptPlay' })).toBeTruthy())
    expect(spyActions).toEqual([{ action: 'ask-question', data: { targetId: 'user-b', question: 'Is the food good here?' } }])
    expect(board().queryByPlaceholderText('spy.askQuestion')).toBeNull()
    expect(board().queryByRole('button', { name: 'spy.askButton' })).toBeNull()
    // Skipping carries no text, so the turn can still be passed on.
    expect(board().getByRole('button', { name: 'spy.skipTurn' })).toBeTruthy()
    expect(showToast.error).not.toHaveBeenCalled()

    fireEvent.click(board().getByRole('button', { name: 'chat.termsAcceptPlay' }))

    await waitFor(() => expect(board().getByPlaceholderText('spy.askQuestion')).toBeTruthy())
    expect(onAcceptChatTerms).toHaveBeenCalledTimes(1)
    expect((board().getByPlaceholderText('spy.askQuestion') as HTMLTextAreaElement).value).toBe('Is the food good here?')
  })

  it('puts the consent panel in place of the answer box after a TERMS_REQUIRED refusal, and gives the answer back', async () => {
    ;(acceptTerms as jest.Mock).mockResolvedValue(true)
    const game = questioningGame()
    Object.assign(game.getState().data, { currentTargetId: 'user-c', pendingQuestion: 'Where are you right now?' })
    // No chat hook handed down (the spectate page's shape): the board records the acceptance itself.
    renderBoard(game, 'user-c')

    fireEvent.change(board().getByPlaceholderText('spy.answerQuestion'), { target: { value: 'Somewhere warm' } })
    fireEvent.click(board().getByRole('button', { name: 'spy.submitAnswer' }))

    await waitFor(() => expect(board().getByRole('button', { name: 'chat.termsAcceptPlay' })).toBeTruthy())
    expect(spyActions).toEqual([{ action: 'answer-question', data: { answer: 'Somewhere warm' } }])
    expect(board().queryByPlaceholderText('spy.answerQuestion')).toBeNull()
    expect(board().queryByRole('button', { name: 'spy.submitAnswer' })).toBeNull()
    expect(showToast.error).not.toHaveBeenCalled()

    fireEvent.click(board().getByRole('button', { name: 'chat.termsAcceptPlay' }))

    await waitFor(() => expect(board().getByPlaceholderText('spy.answerQuestion')).toBeTruthy())
    expect(acceptTerms).toHaveBeenCalledTimes(1)
    expect((board().getByPlaceholderText('spy.answerQuestion') as HTMLTextAreaElement).value).toBe('Somewhere warm')
  })

  it('asks for the terms up front when the chat already knows they are not accepted', async () => {
    const onAcceptChatTerms = jest.fn().mockResolvedValue(true)
    const { unmount } = renderBoard(questioningGame(), 'user-a', { chatTermsAccepted: false, onAcceptChatTerms })
    expect(board().getByRole('button', { name: 'chat.termsAcceptPlay' })).toBeTruthy()
    expect(board().queryByPlaceholderText('spy.askQuestion')).toBeNull()
    unmount()

    const game = questioningGame()
    Object.assign(game.getState().data, { currentTargetId: 'user-c', pendingQuestion: 'Where are you right now?' })
    renderBoard(game, 'user-c', { chatTermsAccepted: false, onAcceptChatTerms })
    expect(board().getByRole('button', { name: 'chat.termsAcceptPlay' })).toBeTruthy()
    expect(board().queryByPlaceholderText('spy.answerQuestion')).toBeNull()
    expect(spyActions).toEqual([])
  })
})

describe('SpyGameBoard: text from a blocked player folds (#1482)', () => {
  it('folds the questions and answers a blocked player wrote in the conversation, and nothing else', async () => {
    mockBlockedIds = new Set(['user-b'])
    const game = questioningGame()
    game.getState().data.questionHistory = [
      { askerId: 'user-a', askerName: 'Alice', targetId: 'user-b', targetName: 'Bob', question: 'Question from Alice', answer: 'Answer from Bob', timestamp: 1 },
      { askerId: 'user-b', askerName: 'Bob', targetId: 'user-c', targetName: 'Carol', question: 'Question from Bob', answer: 'Answer from Carol', timestamp: 2 },
    ]
    renderBoard(game, 'user-d')

    expect(board().getByText('Question from Alice')).toBeTruthy()
    expect(board().getByText('Answer from Carol')).toBeTruthy()
    expect(board().queryByText('Answer from Bob')).toBeNull()
    expect(board().queryByText('Question from Bob')).toBeNull()
    expect(board().getAllByText('blockedPlayers.hiddenText')).toHaveLength(2)
    // Who asked whom stays, so the round can still be followed.
    expect(board().getByText('Alice - Bob')).toBeTruthy()
    expect(board().getByText('Bob - Carol')).toBeTruthy()

    fireEvent.click(board().getAllByRole('button', { name: 'blockedPlayers.show' })[0])
    expect(board().getByText('Answer from Bob')).toBeTruthy()
  })

  it('folds a blocked player\'s pending question for the player asked and for the rest of the table', async () => {
    mockBlockedIds = new Set(['user-a'])
    const game = questioningGame()
    Object.assign(game.getState().data, { currentTargetId: 'user-c', pendingQuestion: 'A question from Alice' })

    const { unmount } = renderBoard(game, 'user-c')
    expect(board().queryByText('A question from Alice')).toBeNull()
    expect(board().getByText('blockedPlayers.hiddenText')).toBeTruthy()
    // The answer box stays: the round is still playable.
    expect(board().getByPlaceholderText('spy.answerQuestion')).toBeTruthy()
    unmount()

    renderBoard(game, 'user-d')
    expect(board().queryByText('A question from Alice')).toBeNull()
    expect(board().getByText('blockedPlayers.hiddenText')).toBeTruthy()
    expect(board().getAllByText('spy.waitingForAnswer:{"player":"Carol"}', { exact: false }).length).toBeGreaterThan(0)

    fireEvent.click(board().getByRole('button', { name: 'blockedPlayers.show' }))
    expect(board().getByText('A question from Alice')).toBeTruthy()
  })
})
