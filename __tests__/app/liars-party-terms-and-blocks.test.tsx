// @ts-nocheck
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import LiarsPartyLobbyPage from '@/app/lobby/[code]/liars-party-page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { installSignedRealtime } from '@/__tests__/fixtures/signed-realtime'

installSignedRealtime()

const mockChannel: any = {
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

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
  }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn(), errorFrom: jest.fn(), success: jest.fn(), info: jest.fn() },
}))

jest.mock('@/lib/fetch-with-guest', () => ({ fetchWithGuest: jest.fn() }))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('@/lib/lobby-create-metrics', () => ({ finalizePendingLobbyCreateMetric: jest.fn() }))

jest.mock('@/lib/analytics', () => ({ trackMoveSubmitApplied: jest.fn() }))

jest.mock('@/lib/sound-engine', () => ({
  ...jest.requireActual('@/lib/sound-engine'),
  playCue: jest.fn(() => true),
}))

jest.mock('@/components/LoadingSpinner', () => ({
  __esModule: true,
  default: () => <div data-testid="loading-spinner" />,
}))

jest.mock('@/lib/lobby-realtime-topic-client', () => ({
  fetchLobbyTopic: jest.fn(async (code: string) => `lobby:${code}:test-secret`),
}))

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => ({
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn().mockResolvedValue({}),
  })),
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

/** A live claim phase with user-2 holding the floor; the shape of GET /api/lobby/[code]. */
function buildPlayingResponse() {
  const players = [
    { id: 'player-1', userId: 'user-1', user: { username: 'Alice' } },
    { id: 'player-2', userId: 'user-2', user: { username: 'Bob' } },
    { id: 'player-3', userId: 'user-3', user: { username: 'Carol' } },
    { id: 'player-4', userId: 'user-4', user: { username: 'Dave' } },
  ]
  return {
    lobby: { id: 'lobby-1', code: 'ABCD', gameType: 'liars_party', creatorId: 'user-1', name: 'Test Lobby', isActive: true, turnTimer: 60 },
    activeGame: {
      id: 'game-1',
      status: 'playing',
      state: {
        status: 'playing',
        currentPlayerIndex: 0,
        players: players.map((player) => ({ id: player.userId, isActive: true })),
        lastMoveAt: Date.now(),
        data: {
          phase: 'claim',
          currentRound: 1,
          maxRounds: 10,
          eliminationThreshold: 2,
          claimantOrder: ['user-2', 'user-1', 'user-3', 'user-4'],
          currentClaimantId: 'user-2',
          currentClaimantIndex: 0,
          activePlayerIds: ['user-1', 'user-2', 'user-3', 'user-4'],
          eliminatedPlayerIds: [],
          eliminatedAtRound: {},
          claim: null,
          challengeVotes: [],
          submittedPlayerIds: [],
          currentRoundResolved: false,
          roundResults: [],
          scores: {},
          strikes: {},
          winnerId: null,
          ranking: [],
          completionReason: null,
          finishedAt: null,
          isMvpScaffold: true,
        },
      },
      players,
    },
  }
}

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

const TERMS_REQUIRED = { error: 'Accept the Terms of Use first', code: 'TERMS_REQUIRED' }

/** The desktop tree; the page renders three and CSS shows one. */
function desktop() {
  return within(document.querySelector('.ttt-desktop-layout') as HTMLElement)
}

function phaseRegion() {
  return within(document.querySelector('.ttt-desktop-layout .liars-phase') as HTMLElement)
}

describe("Liar's Party: the terms before a claim (#1482)", () => {
  const mockFetch = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  let moves: Array<Record<string, unknown>>

  function serve(response: ReturnType<typeof buildPlayingResponse>, { chatStatus = 200 } = {}) {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/game/game-1/state') {
        moves.push(JSON.parse(String(init?.body)).move)
        return json(403, TERMS_REQUIRED)
      }
      if (url === '/api/user/accept-terms') return json(200, { ok: true })
      if (url === '/api/lobby/ABCD/chat') return chatStatus === 200 ? json(200, {}) : json(chatStatus, TERMS_REQUIRED)
      return json(200, response)
    })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockBlockedIds = new Set()
    moves = []
  })

  it('puts the consent panel in place of the claim form after a TERMS_REQUIRED refusal, and keeps the typed claim', async () => {
    const response = buildPlayingResponse()
    response.activeGame.state.data.currentClaimantId = 'user-1'
    serve(response)

    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen-desktop')).toBeTruthy())

    fireEvent.change(phaseRegion().getByPlaceholderText('liarsParty.claimPlaceholder'), { target: { value: 'I once met a penguin' } })
    fireEvent.click(phaseRegion().getByRole('button', { name: /liarsParty\.bluff/ }))
    fireEvent.click(phaseRegion().getByRole('button', { name: 'liarsParty.submitClaim' }))

    await waitFor(() => expect(phaseRegion().getByRole('button', { name: 'chat.termsAcceptPlay' })).toBeTruthy())
    expect(moves.map((move) => move.type)).toEqual(['submit-claim'])
    expect(phaseRegion().queryByPlaceholderText('liarsParty.claimPlaceholder')).toBeNull()
    expect(phaseRegion().queryByRole('button', { name: 'liarsParty.submitClaim' })).toBeNull()

    fireEvent.click(phaseRegion().getByRole('button', { name: 'chat.termsAcceptPlay' }))

    await waitFor(() => expect(phaseRegion().getByPlaceholderText('liarsParty.claimPlaceholder')).toBeTruthy())
    expect(mockFetch).toHaveBeenCalledWith('/api/user/accept-terms', expect.objectContaining({ method: 'POST' }))
    expect((phaseRegion().getByPlaceholderText('liarsParty.claimPlaceholder') as HTMLTextAreaElement).value).toBe('I once met a penguin')
    expect(phaseRegion().getByRole('button', { name: /liarsParty\.bluff/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('asks for the terms up front once the shared chat knows they are not accepted', async () => {
    const response = buildPlayingResponse()
    response.activeGame.state.data.currentClaimantId = 'user-1'
    serve(response, { chatStatus: 403 })

    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen-desktop')).toBeTruthy())
    expect(phaseRegion().getByPlaceholderText('liarsParty.claimPlaceholder')).toBeTruthy()

    const chatInput = desktop().getByPlaceholderText('chat.placeholder')
    fireEvent.change(chatInput, { target: { value: 'hello table' } })
    fireEvent.submit(chatInput.closest('form') as HTMLFormElement)

    await waitFor(() => expect(phaseRegion().getByRole('button', { name: 'chat.termsAcceptPlay' })).toBeTruthy())
    expect(phaseRegion().queryByPlaceholderText('liarsParty.claimPlaceholder')).toBeNull()
    expect(moves).toEqual([])
  })
})

describe("Liar's Party: a claim from a blocked player folds (#1482)", () => {
  const mockFetch = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

  beforeEach(() => {
    jest.clearAllMocks()
    mockBlockedIds = new Set(['user-2'])
  })

  it('folds the claim under vote and the claims in the round history, and keeps the vote playable', async () => {
    const response = buildPlayingResponse()
    Object.assign(response.activeGame.state.data, {
      phase: 'challenge',
      currentRound: 3,
      claim: { playerId: 'user-2', text: 'I once met a penguin', isBluff: true, submittedAt: Date.now() },
      roundResults: [
        { round: 1, claimantId: 'user-2', claimText: 'I have never lost at chess', wasBluff: true, bluffCaught: true, voterScoreDeltas: {}, claimantScoreDelta: -2, eliminatedPlayerIds: [] },
        { round: 2, claimantId: 'user-3', claimText: 'I can juggle five balls', wasBluff: false, bluffCaught: false, voterScoreDeltas: {}, claimantScoreDelta: 2, eliminatedPlayerIds: [] },
      ],
    })
    mockFetch.mockResolvedValue(json(200, response))

    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-challenge-screen-desktop')).toBeTruthy())

    const tree = document.querySelector('.ttt-desktop-layout') as HTMLElement
    expect(tree.textContent).not.toContain('I once met a penguin')
    expect(tree.textContent).not.toContain('I have never lost at chess')
    expect(tree.innerHTML).not.toContain('I have never lost at chess')
    expect(within(desktop().getByTestId('liars-claim-text')).getByText('blockedPlayers.hiddenText')).toBeTruthy()
    expect(within(desktop().getByTestId('liars-round-history')).getAllByText('blockedPlayers.hiddenText')).toHaveLength(1)
    expect(within(desktop().getByTestId('liars-round-history')).getByText('“I can juggle five balls”')).toBeTruthy()
    // Only the text folds: the claimant is still named and the vote can still be cast.
    expect(desktop().getByTestId('liars-claim-by').textContent).toBe('liarsParty.claimedBy:{"name":"Bob"}')
    expect(desktop().getByTestId('liars-vote-buttons')).toBeTruthy()

    fireEvent.click(within(desktop().getByTestId('liars-claim-text')).getByRole('button', { name: 'blockedPlayers.show' }))
    expect(desktop().getByTestId('liars-claim-text').textContent).toContain('I once met a penguin')
  })

  it('folds a blocked claimant\'s claim on the reveal screen', async () => {
    const response = buildPlayingResponse()
    Object.assign(response.activeGame.state.data, {
      phase: 'reveal',
      claim: { playerId: 'user-2', text: 'I once met a penguin', isBluff: true, submittedAt: Date.now() },
      challengeVotes: [{ playerId: 'user-1', decision: 'challenge', submittedAt: Date.now() }],
    })
    mockFetch.mockResolvedValue(json(200, response))

    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-reveal-screen-desktop')).toBeTruthy())

    const tree = document.querySelector('.ttt-desktop-layout') as HTMLElement
    expect(tree.textContent).not.toContain('I once met a penguin')
    expect(phaseRegion().getByText('blockedPlayers.hiddenText')).toBeTruthy()
    expect(desktop().getByTestId('liars-verdict')).toBeTruthy()
  })
})
