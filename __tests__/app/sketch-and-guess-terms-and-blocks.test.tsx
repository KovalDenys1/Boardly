// @ts-nocheck
/**
 * A guess is free text the whole table reads, so it waits for the Terms of Use and
 * the Community Rules like chat does, and a guess from a player the viewer blocked
 * folds to one line. The real board renders inside the real page; the network, the
 * chat hook and the block list are mocked.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

// The whole page renders three layouts, which runs past the default 5 s on a loaded runner.
jest.setTimeout(20_000)

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), prefetch: jest.fn() }),
}))
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'user-1' } }, status: 'authenticated' }),
}))
jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: false, guestToken: null, guestId: null, guestName: null }),
}))
jest.mock('@/lib/i18n-helpers', () => {
  const t = (key: string) => key
  return { useTranslation: () => ({ t }) }
})
jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn(), errorFrom: jest.fn(), success: jest.fn(), info: jest.fn(), infoText: jest.fn() },
}))
jest.mock('@/lib/fetch-with-guest', () => ({ fetchWithGuest: jest.fn() }))
jest.mock('@/lib/client-logger', () => ({ clientLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('@/lib/lobby-create-metrics', () => ({ finalizePendingLobbyCreateMetric: jest.fn() }))
jest.mock('@/lib/analytics', () => ({ trackLobbyLeaveRedirect: jest.fn(), trackMoveSubmitApplied: jest.fn() }))
jest.mock('@/components/Chat', () => ({ __esModule: true, default: () => <div data-testid="chat" /> }))
jest.mock('@/components/ConfirmModal', () => ({ __esModule: true, default: () => null }))
jest.mock('@/lib/lobby-realtime-topic-client', () => ({
  fetchLobbyTopic: jest.fn(async (code: string) => `lobby:${code}:test-secret`),
}))
jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => ({
    channel: jest.fn(() => {
      const channel: any = { on: jest.fn(() => channel), subscribe: jest.fn(() => channel), send: jest.fn() }
      return channel
    }),
    removeChannel: jest.fn().mockResolvedValue({}),
  })),
}))

// The chat hook holds the viewer's answer to the terms; accepting there is what the chat composer sees too.
let mockTermsAccepted: boolean | null = null
const mockAcceptTerms = jest.fn(async () => true)
jest.mock('@/app/(site)/lobby/[code]/hooks/useLobbyChat', () => {
  const React = require('react')
  const noop = () => {}
  const send = async () => null
  return {
    useLobbyChat: () => {
      const [termsAccepted, setTermsAccepted] = React.useState(mockTermsAccepted)
      const acceptTerms = React.useCallback(async () => {
        const accepted = await mockAcceptTerms()
        if (accepted) setTermsAccepted(true)
        return accepted
      }, [])
      return {
        chatMessages: [],
        sendChatMessage: send,
        termsAccepted,
        acceptTerms,
        unreadCount: 0,
        resetUnread: noop,
        someoneTyping: false,
        onChatMessage: noop,
        mergeHistoryMessages: noop,
        setChatMessages: noop,
      }
    },
    useLobbyChatHistory: noop,
  }
})

let mockBlockedIds: ReadonlySet<string> = new Set()
jest.mock('@/hooks/useBlockedPlayers', () => ({
  useBlockedPlayers: () => ({
    blocked: [],
    blockedIds: mockBlockedIds,
    ready: true,
    failed: false,
    unknown: false,
    retry: () => {},
    block: async () => true,
    unblock: async () => true,
  }),
}))

import SketchAndGuessLobbyPage from '@/app/(site)/lobby/[code]/sketch-and-guess-page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'

const GUESS_BOX = 'games.guess_my_drawing.game.guessPlaceholder'
const FEED = 'games.guess_my_drawing.game.guessesTitle'

function buildResponse({ drawerId, guesses = [] }: { drawerId: string; guesses?: unknown[] }) {
  const isViewerDrawing = drawerId === 'user-1'
  return {
    lobby: { id: 'lobby-1', code: 'ABCD', gameType: 'sketch_and_guess', creatorId: 'user-1', name: 'Lobby', isActive: true },
    activeGame: {
      id: 'game-1',
      gameType: 'sketch_and_guess',
      status: 'playing',
      state: {
        data: {
          phase: 'drawing',
          phaseStartedAt: Date.now(),
          currentRound: 1,
          totalRounds: 3,
          drawerOrder: ['user-1', 'user-2', 'user-3'],
          currentDrawerId: drawerId,
          rounds: [
            {
              round: 1,
              drawerId,
              prompt: isViewerDrawing ? 'castle' : '',
              word: isViewerDrawing ? { id: 'castle', en: ['castle'], no: ['slott'], ru: ['замок'], uk: ['замок'] } : null,
              wordChoices: [],
              wordAutoPicked: false,
              drawingStartedAt: Date.now(),
              drawingContent: null,
              drawingSubmittedAt: null,
              drawingAutoSubmitted: false,
              guesses,
              revealAt: null,
              isScored: false,
              scoredAt: null,
            },
          ],
          submittedPlayerIds: guesses.filter((g: any) => g.isCorrect).map((g: any) => g.playerId),
          scores: {},
          scoreBreakdown: {},
          winnerId: null,
          ranking: [],
          completionReason: null,
          finishedAt: null,
          isMvpScaffold: false,
        },
      },
      players: [
        { id: 'player-1', userId: 'user-1', name: 'Alice', user: { username: 'Alice' } },
        { id: 'player-2', userId: 'user-2', name: 'Bob', user: { username: 'Bob' } },
        { id: 'player-3', userId: 'user-3', name: 'Cara', user: { username: 'Cara' } },
      ],
    },
  }
}

const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response
}

async function renderPage(response: ReturnType<typeof buildResponse>) {
  mockFetchWithGuest.mockImplementation(async (url) => {
    if (String(url).endsWith('/sketch-and-guess-action')) {
      return { ok: false, status: 403, json: async () => ({ error: 'Accept the terms first', code: 'TERMS_REQUIRED' }) } as Response
    }
    return okResponse(response)
  })
  const view = render(<SketchAndGuessLobbyPage code="ABCD" />)
  await waitFor(() => expect(view.container.querySelectorAll('canvas').length).toBeGreaterThan(0))
  return view
}

beforeEach(() => {
  jest.clearAllMocks()
  mockTermsAccepted = null
  mockBlockedIds = new Set()
})

describe('Sketch & Guess guess box and the terms', () => {
  it('shows the consent panel instead of the guess box to a player who has not accepted the terms', async () => {
    mockTermsAccepted = false
    await renderPage(buildResponse({ drawerId: 'user-2' }))

    expect(screen.queryAllByPlaceholderText(GUESS_BOX)).toHaveLength(0)
    expect(screen.getAllByText('chat.termsPromptPlay').length).toBeGreaterThan(0)

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'chat.termsAcceptPlay' })[0])
    })

    expect(mockAcceptTerms).toHaveBeenCalledTimes(1)
    expect(screen.queryAllByText('chat.termsPromptPlay')).toHaveLength(0)
    expect(screen.getAllByPlaceholderText(GUESS_BOX).length).toBeGreaterThan(0)
  })

  it('keeps a guess the server refused for the terms in the box and asks for them in its place', async () => {
    await renderPage(buildResponse({ drawerId: 'user-2' }))

    const boxes = screen.getAllByPlaceholderText(GUESS_BOX)
    fireEvent.change(boxes[boxes.length - 1], { target: { value: 'dragon' } })
    await act(async () => {
      fireEvent.keyDown(boxes[boxes.length - 1], { key: 'Enter' })
    })

    await waitFor(() => expect(screen.getAllByText('chat.termsPromptPlay').length).toBeGreaterThan(0))
    expect(screen.queryAllByPlaceholderText(GUESS_BOX)).toHaveLength(0)
    expect(showToast.error).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'chat.termsAcceptPlay' })[0])
    })

    expect(mockAcceptTerms).toHaveBeenCalledTimes(1)
    const values = (screen.getAllByPlaceholderText(GUESS_BOX) as HTMLInputElement[]).map((box) => box.value)
    expect(values.length).toBeGreaterThan(0)
    expect(values.every((value) => value === 'dragon')).toBe(true)
  })
})

describe('Sketch & Guess guess feed and the block list', () => {
  it('folds what a blocked player guessed to one line and keeps their name and the host’s Accept', async () => {
    mockBlockedIds = new Set(['user-2', 'user-3'])
    // The viewer draws and created the lobby, so they see every guess's text and may accept a miss.
    await renderPage(
      buildResponse({
        drawerId: 'user-1',
        guesses: [
          { id: 'r1-g1', playerId: 'user-3', guess: 'meanie', submittedAt: 1, isCorrect: false },
          { id: 'r1-g2', playerId: 'user-2', guess: 'slott', submittedAt: 2, isCorrect: true },
        ],
      })
    )

    const feed = within(screen.getAllByLabelText(FEED)[0])
    expect(feed.queryByText(/meanie/)).toBeNull()
    expect(feed.queryByText(/slott/)).toBeNull()
    expect(feed.getAllByText('blockedPlayers.hiddenText')).toHaveLength(2)
    expect(feed.getByText('Cara')).toBeTruthy()
    expect(feed.getByText('games.guess_my_drawing.game.guessedIt')).toBeTruthy()
    expect(feed.getByRole('button', { name: 'games.guess_my_drawing.game.acceptGuess' })).toBeTruthy()

    fireEvent.click(feed.getAllByRole('button', { name: 'blockedPlayers.show' })[0])
    expect(feed.getAllByText(/meanie|slott/)).toHaveLength(1)
  })
})
