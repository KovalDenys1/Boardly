// @ts-nocheck
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import LiarsPartyLobbyPage from '@/app/lobby/[code]/liars-party-page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'
import { clientLogger } from '@/lib/client-logger'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockPrefetch = jest.fn()

const broadcastHandlers: Record<string, (data: { payload: unknown }) => void> = {}
const mockChannel: any = {
  on: jest.fn((type: string, filter: { event?: string }, handler: (data: unknown) => void) => {
    if (type === 'broadcast' && filter.event) {
      broadcastHandlers[filter.event] = handler as any
    }
    return mockChannel
  }),
  subscribe: jest.fn(() => mockChannel),
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    prefetch: mockPrefetch,
  }),
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1' } },
    status: 'authenticated',
  }),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    guestToken: null,
    guestId: null,
    guestName: null,
  }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`
      return key
    },
  }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    error: jest.fn(),
    errorFrom: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
  },
}))

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('@/lib/lobby-create-metrics', () => ({
  finalizePendingLobbyCreateMetric: jest.fn(),
}))

jest.mock('@/lib/analytics', () => ({
  trackMoveSubmitApplied: jest.fn(),
}))

jest.mock('@/components/LoadingSpinner', () => ({
  __esModule: true,
  default: () => <div data-testid="loading-spinner" />,
}))

jest.mock('@/components/ReactionOverlay', () => ({
  __esModule: true,
  ReactionOverlay: () => null,
}))

// The realtime topic carries a per-lobby secret and is fetched from the server
// (#845). Supabase itself is mocked below, so the name only has to be stable.
jest.mock('@/lib/lobby-realtime-topic-client', () => ({
  fetchLobbyTopic: jest.fn(async (code: string) => `lobby:${code}:test-secret`),
}))

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => ({
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn().mockResolvedValue({}),
  })),
}))

function buildLobbyResponse() {
  return {
    lobby: {
      id: 'lobby-1',
      code: 'ABCD',
      gameType: 'liars_party',
      creatorId: 'user-1',
      name: 'Test Lobby',
      isActive: true,
      turnTimer: 60,
    },
    activeGame: {
      id: 'game-1',
      status: 'waiting',
      state: {
        status: 'waiting',
        currentPlayerIndex: 0,
        players: [],
        lastMoveAt: null,
        data: {
          phase: 'claim',
          currentRound: 1,
          maxRounds: 10,
          eliminationThreshold: 2,
          claimantOrder: [],
          currentClaimantId: '',
          currentClaimantIndex: 0,
          activePlayerIds: [],
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
      // Shaped like the real GET /api/lobby/[code] response: Prisma `players`
      // rows have no `name` column, so the display name is only ever on the
      // joined user. The fixture used to add a `name` of its own, which is why
      // every screen could read `p.name` and still look right in this suite
      // while a real game showed blanks and raw guest ids.
      players: [
        { id: 'player-1', userId: 'user-1', user: { username: 'Alice' } },
        { id: 'player-2', userId: 'user-2', user: { username: 'Bob' } },
        { id: 'player-3', userId: 'user-3', user: { username: 'Carol' } },
        { id: 'player-4', userId: 'user-4', user: { username: 'Dave' } },
      ],
    },
  }
}

/** A live round, clock still running, with user-1 waiting on user-2's claim. */
function buildPlayingResponse() {
  const response = buildLobbyResponse()

  response.activeGame.status = 'playing'
  response.activeGame.state.status = 'playing'
  response.activeGame.state.players = response.activeGame.players.map((player) => ({
    id: player.userId,
    name: player.name,
    isActive: true,
  }))
  response.activeGame.state.lastMoveAt = Date.now()
  Object.assign(response.activeGame.state.data, {
    claimantOrder: ['user-2', 'user-1', 'user-3', 'user-4'],
    currentClaimantId: 'user-2',
    activePlayerIds: ['user-1', 'user-2', 'user-3', 'user-4'],
  })

  return response
}

/**
 * Since #1041 the page renders three layout trees at once and CSS picks one, so
 * every query has to name a tree or it matches two or three nodes. Queries go
 * through this: the desktop tree, which is the only one that shows the phase,
 * the players panel and the chat at the same time.
 */
function desktop() {
  const tree = document.querySelector('.ttt-desktop-layout')
  if (!tree) throw new Error('no .ttt-desktop-layout on the page')
  return within(tree as HTMLElement)
}

/**
 * The phone-landscape tree (#1041). It is the one tree with a two-column split:
 * the phase in `.game-landscape-board`, and the header, the status banner, the
 * tab strip and one panel in `.game-landscape-side`. Nothing in this suite
 * reached it before #1041's review, which is how a landscape-only CSS defect
 * got through a green run.
 */
function landscape() {
  const tree = document.querySelector('.game-landscape-layout')
  if (!tree) throw new Error('no .game-landscape-layout on the page')
  return within(tree as HTMLElement)
}

function landscapeTree(): HTMLElement {
  const tree = document.querySelector('.game-landscape-layout')
  if (!tree) throw new Error('no .game-landscape-layout on the page')
  return tree as HTMLElement
}

/**
 * The phase card's scrolling region, the one `.liars-phase` in the desktop
 * tree. The layout DoD's first rule is that no in-game screen has an empty
 * region – so what is inside it is the assertion, not the card's own test id,
 * which is present whether or not the phase rendered anything at all. That is
 * exactly how the blank claim screen got through review the first time.
 */
function contentRegion(): HTMLElement {
  const region = document.querySelector('.ttt-desktop-layout .liars-phase')
  if (!region) throw new Error('no .liars-phase region in the desktop tree')
  return region as HTMLElement
}

/** A live round whose clock ran out `staleSeconds` ago and that nobody has answered. */
function buildStalledPlayingResponse(staleSeconds: number) {
  const response = buildLobbyResponse()
  const statePlayers = response.activeGame.players.map((player) => ({
    id: player.userId,
    name: player.name,
    isActive: true,
  }))

  response.activeGame.status = 'playing'
  response.activeGame.state.status = 'playing'
  response.activeGame.state.players = statePlayers
  response.activeGame.state.lastMoveAt = Date.now() - staleSeconds * 1000
  Object.assign(response.activeGame.state.data, {
    claimantOrder: ['user-2', 'user-1', 'user-3', 'user-4'],
    currentClaimantId: 'user-2',
    activePlayerIds: ['user-1', 'user-2', 'user-3', 'user-4'],
  })

  return response
}

/**
 * A reveal phase exactly as the engine leaves it: the claim is in, everyone has
 * voted, the phase is `reveal` – and `roundResults` is still empty, because the
 * engine resolves the round inside `advanceAfterReveal`, on the way out of this
 * screen. `bluffCaught` is false here (one challenger out of three is not the
 * strict majority rule 3 needs) while `isBluff` is true, which is the case that
 * separates "did the table catch it" from "was the voter right".
 */
function buildRevealResponse() {
  const response = buildPlayingResponse()
  Object.assign(response.activeGame.state.data, {
    phase: 'reveal',
    claim: { playerId: 'user-2', text: 'I have never lost at chess', isBluff: true, submittedAt: Date.now() },
    challengeVotes: [
      { playerId: 'user-1', decision: 'challenge', submittedAt: Date.now() },
      { playerId: 'user-3', decision: 'believe', submittedAt: Date.now() },
      { playerId: 'user-4', decision: 'believe', submittedAt: Date.now() },
    ],
    roundResults: [],
    currentRoundResolved: false,
  })
  return response
}

/**
 * Round 2's reveal, with round 1 already resolved and sitting in
 * `roundResults`. This is the fixture the round-1 one cannot be: with an empty
 * `roundResults`, reading `find(r => r.round === currentRound)` and reading
 * `roundResults[roundResults.length - 1]` both come out `undefined`, so the
 * suite could not tell the fix from the bug it replaced. Here they differ:
 * round 2's claim is the truth and all three voters believed it (so every row
 * is correct and no points have moved yet), while round 1 was a caught bluff
 * that cost the same three voters 3 points each. Read the wrong entry and this
 * screen marks all three wrong and prints round 1's -3 beside their names.
 */
function buildSecondRoundRevealResponse() {
  const response = buildPlayingResponse()
  Object.assign(response.activeGame.state.data, {
    phase: 'reveal',
    currentRound: 2,
    currentRoundResolved: false,
    claim: { playerId: 'user-2', text: 'I really did run a marathon', isBluff: false, submittedAt: Date.now() },
    challengeVotes: [
      { playerId: 'user-1', decision: 'believe', submittedAt: Date.now() },
      { playerId: 'user-3', decision: 'believe', submittedAt: Date.now() },
      { playerId: 'user-4', decision: 'believe', submittedAt: Date.now() },
    ],
    roundResults: [
      {
        round: 1,
        claimantId: 'user-1',
        claimText: 'I have never lost at chess',
        wasBluff: true,
        bluffCaught: true,
        voterScoreDeltas: { 'user-1': -3, 'user-3': -3, 'user-4': -3 },
        claimantScoreDelta: -2,
        eliminatedPlayerIds: [],
      },
    ],
  })
  return response
}

/**
 * A finished game. `activePlayerIds` is down to the one survivor, because that
 * is what "last player standing" means to the engine – which is exactly why the
 * players panel cannot read it once the game is over.
 */
function buildFinishedResponse() {
  const response = buildPlayingResponse()
  response.activeGame.status = 'finished'
  response.activeGame.state.status = 'finished'
  Object.assign(response.activeGame.state.data, {
    phase: 'reveal',
    activePlayerIds: ['user-3'],
    eliminatedPlayerIds: ['user-1', 'user-2', 'user-4'],
    eliminatedAtRound: { 'user-1': 3, 'user-2': 5, 'user-4': 6 },
    scores: { 'user-1': 10, 'user-2': 4, 'user-3': 31, 'user-4': 7 },
    strikes: { 'user-1': 2, 'user-2': 2, 'user-3': 1, 'user-4': 2 },
    winnerId: 'user-3',
    ranking: ['user-3', 'user-1', 'user-4', 'user-2'],
    completionReason: 'last-player-standing',
    finishedAt: Date.now(),
  })
  return response
}

describe('LiarsPartyLobbyPage', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  const toast = showToast as jest.Mocked<typeof showToast>
  const logger = clientLogger as jest.Mocked<typeof clientLogger>

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => buildLobbyResponse(),
    } as Response)
  })

  it('renders the waiting room', async () => {
    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-waiting-room')).toBeTruthy())
  })

  it('redirects away when a game-abandoned broadcast is received', async () => {
    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-waiting-room')).toBeTruthy())

    act(() => {
      broadcastHandlers['game-abandoned']?.({
        payload: { gameId: 'game-1', reason: 'insufficient_players' },
      })
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'lobby.gameAbandoned',
        undefined,
        undefined,
        { id: 'liars-party-lifecycle-redirect' }
      )
      expect(mockReplace).toHaveBeenCalledWith('/games')
    })
  })

  it('redirects when a player-left broadcast drops a live game below the minimum player count', async () => {
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => buildPlayingResponse(),
    } as Response)

    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())

    act(() => {
      broadcastHandlers['player-left']?.({
        payload: { userId: 'user-4', username: 'Dave', remainingPlayers: 3 },
      })
    })

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('toast.playerLeft', undefined, { player: 'Dave' })
      expect(mockReplace).toHaveBeenCalledWith('/games')
    })
  })

  it('keeps the waiting room open when a player-left drops it below four (#1038)', async () => {
    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-waiting-room')).toBeTruthy())

    act(() => {
      broadcastHandlers['player-left']?.({
        payload: { userId: 'user-4', username: 'Dave', remainingPlayers: 3 },
      })
    })

    // Three people waiting for a fourth is how this game always starts, so
    // nobody is thrown out to /games and nothing calls the match abandoned.
    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('toast.playerLeft', undefined, { player: 'Dave' })
    })
    expect(mockReplace).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(screen.getByTestId('liars-party-waiting-room')).toBeTruthy()
  })

  it('frees the seat through the leave API before navigating away (#1038)', async () => {
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => buildPlayingResponse(),
    } as Response)

    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())

    fireEvent.click(desktop().getByRole('button', { name: 'game.ui.leave' }))
    fireEvent.click(await screen.findByRole('button', { name: 'common.confirm' }))

    // keepalive is the half that makes this work at all: the request has to
    // outlive the navigation that follows it on the very next line.
    await waitFor(() => {
      expect(mockFetchWithGuest).toHaveBeenCalledWith(
        '/api/lobby/ABCD/leave',
        expect.objectContaining({ method: 'POST', keepalive: true })
      )
    })
    expect(mockReplace).toHaveBeenCalledWith('/games')
  })

  it('does not tell the player who is leaving that the game was abandoned (#1038)', async () => {
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => buildPlayingResponse(),
    } as Response)

    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())

    fireEvent.click(desktop().getByRole('button', { name: 'game.ui.leave' }))
    fireEvent.click(await screen.findByRole('button', { name: 'common.confirm' }))

    // Leaving a four-player table takes the match under its minimum, so the
    // server abandons it and broadcasts that back to the person who left.
    act(() => {
      broadcastHandlers['game-abandoned']?.({
        payload: { gameId: 'game-1', reason: 'insufficient_players' },
      })
    })

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/games'))
    expect(toast.error).not.toHaveBeenCalled()
  })

  // The claim phase is what every player but one is looking at for most of the
  // game, and it used to render literally nothing for them: `ClaimScreen`
  // returned null off its claimant branch, so the region under the banner was
  // empty for three of four players and for every spectator, at every viewport.
  describe('the claim phase fills its content region for everyone (#1040)', () => {
    it('shows the table to a player who is not the claimant', async () => {
      mockFetchWithGuest.mockResolvedValue({
        ok: true,
        json: async () => buildPlayingResponse(),
      } as Response)

      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())

      // user-1 is a voter this round; user-2 holds the floor.
      expect(contentRegion().textContent?.trim()).not.toBe('')
      expect(desktop().getByTestId('liars-standings')).toBeTruthy()
      for (const name of ['Alice', 'Bob', 'Carol', 'Dave']) {
        expect(desktop().getAllByText(name).length).toBeGreaterThan(0)
      }
    })

    it('shows the claim form to the claimant', async () => {
      const response = buildPlayingResponse()
      response.activeGame.state.data.currentClaimantId = 'user-1'
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => response } as Response)

      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())

      expect(desktop().getByPlaceholderText('liarsParty.claimPlaceholder')).toBeTruthy()
      // The claimant gets the table as the second column too: one 560px form
      // alone in an 1100px region is the DoD's floating-card case.
      expect(desktop().getByTestId('liars-standings')).toBeTruthy()
    })

    it('shows the table to a spectator', async () => {
      mockFetchWithGuest.mockResolvedValue({
        ok: true,
        json: async () => buildPlayingResponse(),
      } as Response)

      render(<LiarsPartyLobbyPage code="ABCD" isSpectator />)
      await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())

      expect(contentRegion().textContent?.trim()).not.toBe('')
      expect(desktop().getByTestId('liars-standings')).toBeTruthy()
    })

    it('names players from the joined user, never a raw id', async () => {
      mockFetchWithGuest.mockResolvedValue({
        ok: true,
        json: async () => buildPlayingResponse(),
      } as Response)

      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())

      const region = (document.querySelector('.ttt-desktop-layout') as HTMLElement).textContent ?? ''
      expect(region).toContain('Bob')
      // The ids are what leaked through when the page read a `name` the API
      // never sends – `user-2` in this fixture, `guest-89b9ec22-…` in a real game.
      for (const id of ['user-1', 'user-2', 'user-3', 'user-4']) {
        expect(region).not.toContain(id)
      }
    })

    it('shows the table under the banner to an eliminated player', async () => {
      const response = buildPlayingResponse()
      Object.assign(response.activeGame.state.data, {
        activePlayerIds: ['user-2', 'user-3', 'user-4'],
        eliminatedPlayerIds: ['user-1'],
        eliminatedAtRound: { 'user-1': 1 },
      })
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => response } as Response)

      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() =>
        expect(screen.getByTestId('liars-party-eliminated-claim-screen')).toBeTruthy()
      )

      expect(desktop().getByTestId('eliminated-banner')).toBeTruthy()
      expect(desktop().getByTestId('liars-standings')).toBeTruthy()
    })
  })

  // The reveal screen read `roundResults[length - 1]`, which the engine has not
  // written yet while this phase is on screen (lib/games/liars-party-game.ts:479).
  describe('the reveal screen reads the round it is revealing (#1040)', () => {
    it('shows the vote breakdown and the scores during reveal, not just the verdict', async () => {
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => buildRevealResponse() } as Response)

      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('liars-party-reveal-screen')).toBeTruthy())

      expect(desktop().getByTestId('liars-vote-breakdown')).toBeTruthy()
      expect(desktop().getByTestId('liars-standings')).toBeTruthy()
      const region = contentRegion().textContent ?? ''
      expect(region).toContain('I have never lost at chess')
      expect(region).toContain('liarsParty.wasBluff')
    })

    it('marks a challenger on a bluff correct even when the table did not catch it', async () => {
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => buildRevealResponse() } as Response)

      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(desktop().getByTestId('liars-vote-breakdown')).toBeTruthy())

      // One row per voter; the tick/cross is the icon in each row. Alice
      // challenged a claim that was a bluff, so the engine pays her – the row
      // has to agree with the engine, not with the strict-majority verdict.
      const rows = [...desktop().getByTestId('liars-vote-breakdown').querySelectorAll('.space-y-2 > div')]
      expect(rows).toHaveLength(3)
      const iconOf = (row: Element) => row.querySelector('svg')?.getAttribute('data-icon')
      expect(rows.map((r) => (r.textContent ?? '').split('liarsParty')[0].trim())).toEqual(['Alice', 'Carol', 'Dave'])
      expect(iconOf(rows[0])).toBe('check')
      expect(iconOf(rows[1])).toBe('close')
      expect(iconOf(rows[2])).toBe('close')
    })
    it('reads round 2 off round 2, not off the last entry in roundResults', async () => {
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => buildSecondRoundRevealResponse() } as Response)

      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(desktop().getByTestId('liars-vote-breakdown')).toBeTruthy())

      const breakdown = desktop().getByTestId('liars-vote-breakdown')
      const rows = [...breakdown.querySelectorAll('.space-y-2 > div')]
      expect(rows).toHaveLength(3)
      const iconOf = (row: Element) => row.querySelector('svg')?.getAttribute('data-icon')
      // Round 2's claim was the truth and all three believed it.
      expect(rows.map(iconOf)).toEqual(['check', 'check', 'check'])
      // Round 1's deltas belong to round 1. Nothing has been scored yet here,
      // so the rows carry no points at all.
      expect(breakdown.textContent).not.toContain('-3')
      // And the verdict line is this round's, not the previous round's.
      expect(contentRegion().textContent ?? '').toContain('liarsParty.wasTruth')
    })

  })

  // #1041: the page had no GameScoreboardHeader, no GameResultOverlay, no
  // GameTabs and no chat. CLAUDE.md calls each of those, hand-rolled, a review
  // blocker, and a social deduction game without a chat is missing the half the
  // bluffing happens in.
  describe('the shared chrome is composed, not re-implemented (#1041)', () => {
    const renderPlaying = async () => {
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => buildPlayingResponse() } as Response)
      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())
    }

    it('renders the kit header, the kit chat and the kit tab strip', async () => {
      await renderPlaying()

      const tree = document.querySelector('.ttt-desktop-layout') as HTMLElement
      expect(tree.querySelector('.game-scoreboard-header')).toBeTruthy()
      expect(tree.querySelector('.game-chat-panel')).toBeTruthy()
      expect(tree.querySelector('.game-room-card')).toBeTruthy()
      // The tab strip is the mobile tree's, and chat is one of its tabs.
      const mobile = document.querySelector('.ttt-mobile-layout') as HTMLElement
      expect(mobile.querySelector('.game-tabs')).toBeTruthy()
      expect(within(mobile).getByRole('button', { name: 'game.ui.tabChat' })).toBeTruthy()
    })

    it('does not repeat the round in the status banner', async () => {
      await renderPlaying()

      // GameStatusBanner's `meta` rides on the title's nowrap/ellipsis line.
      // "Round 1 / 10" overflowed it by 71px at 320x720 and 51px at 844x390 in
      // a live round, so `overflow: hidden` cut the round off and truncated the
      // title with it. The counter in the header carries the round already.
      const banner = document.querySelector('.ttt-desktop-layout .ttt-center-col')!.firstElementChild as HTMLElement
      expect(banner.textContent).toContain('liarsParty.isClaimingFor')
      expect(banner.textContent).not.toContain('liarsParty.round')

      const counter = document.querySelector('.ttt-desktop-layout .liars-counter__value') as HTMLElement
      expect(counter.textContent).toBe('1/10')
      expect(desktop().getByText('game.ui.round')).toBeTruthy()
    })

    it('leaves exactly one way out per layout tree', async () => {
      await renderPlaying()

      // GameRoomCard already carries GameLeaveButton, so passing `trailing` to
      // GameScoreboardHeader as well would put two Leave buttons side by side
      // in the same header row – which is what the ticket warned about.
      expect(desktop().getAllByRole('button', { name: 'game.ui.leave' })).toHaveLength(1)
    })

    it('sends a chat message through the lobby chat endpoint', async () => {
      await renderPlaying()

      const input = desktop().getByPlaceholderText('chat.placeholder')
      fireEvent.change(input, { target: { value: 'I do not believe a word of that' } })
      fireEvent.submit(input.closest('form') as HTMLFormElement)

      await waitFor(() =>
        expect(mockFetchWithGuest).toHaveBeenCalledWith(
          '/api/lobby/ABCD/chat',
          expect.objectContaining({ method: 'POST' })
        )
      )
    })

    it('puts the result overlay over the phase card when the game is finished', async () => {
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => buildFinishedResponse() } as Response)
      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('liars-party-game-over-screen')).toBeTruthy())

      // Over the board, not beside it: the overlay mounts inside the phase
      // card, which is the only element it is positioned against.
      const card = document.querySelector('.ttt-desktop-layout .liars-phase-card') as HTMLElement
      expect(within(card).getByRole('button', { name: 'game.ui.viewBoard' })).toBeTruthy()
      expect(within(card).getByRole('button', { name: 'lobby.game.playAgain' })).toBeTruthy()
    })

    it('lists the whole final ranking in the players panel, not the one survivor', async () => {
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => buildFinishedResponse() } as Response)
      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('liars-party-game-over-screen')).toBeTruthy())

      // `activePlayerIds` is ['user-3'] here. Reading it printed a one-row
      // "Total Scores" beside the result overlay, at the moment the table most
      // wants to compare numbers.
      const panel = desktop().getByTestId('liars-standings')
      for (const name of ['Alice', 'Bob', 'Carol', 'Dave']) {
        expect(within(panel).getByText(name)).toBeTruthy()
      }
    })

    it('keeps the round-advancing button out of the scrolling region', async () => {
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => buildRevealResponse() } as Response)
      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('liars-party-reveal-screen')).toBeTruthy())

      // Measured at 390: below a verdict, a vote breakdown and the history,
      // Next Round scrolled out of reach on the one screen whose whole purpose
      // is that click.
      const button = desktop().getByRole('button', { name: 'liarsParty.nextRound' })
      expect(button.closest('.liars-phase')).toBeNull()
      expect(button.closest('.liars-phase-action')).toBeTruthy()
    })
  })

  // The phone-landscape tree is the one this branch built, and it had no
  // assertion of any kind: the review deleted all 830 characters of it and the
  // suite still reported 20 passed. Its own defect – the header card pushed
  // Leave out of the top row at 844x390 – lived in the one tree nothing looked
  // at. These fix the first half of that: the tree, and the shared controls in
  // it. The geometry itself is a stylesheet contract (jsdom resolves no media
  // queries and lays nothing out), and lives in phone-landscape-layout.test.ts.
  describe('the phone-landscape tree (#1041)', () => {
    const renderPlaying = async () => {
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => buildPlayingResponse() } as Response)
      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())
    }

    it('splits the phase into the board column and the chrome into the side column', async () => {
      await renderPlaying()

      const tree = landscapeTree()
      const board = tree.querySelector('.game-landscape-board')
      const side = tree.querySelector('.game-landscape-side')
      expect(board).toBeTruthy()
      expect(side).toBeTruthy()

      // The phase belongs to the board column and carries this tree's own id,
      // because all three trees are in the DOM at once.
      expect(within(board as HTMLElement).getByTestId('liars-party-claim-screen-landscape')).toBeTruthy()
      expect((board as HTMLElement).querySelector('.game-scoreboard-header')).toBeNull()

      // The side column is the header, the status line, the tab strip and one
      // panel, in that order – it is what the landscape CSS sizes.
      expect((side as HTMLElement).querySelector('.liars-header-card .game-scoreboard-header')).toBeTruthy()
      // GameStatusBanner carries no class of its own (it is styled inline), so
      // the assertion is the line it renders: whose turn it is, once.
      expect(within(side as HTMLElement).getByText(/liarsParty\.isClaimingFor/)).toBeTruthy()
      expect((side as HTMLElement).querySelector('.game-tabs')).toBeTruthy()
      expect((side as HTMLElement).querySelector('.liars-panel')).toBeTruthy()
    })

    it('keeps Leave in the top row beside the header, once', async () => {
      await renderPlaying()

      // Layout DoD item 2: Leave top-right of the header row. In this tree it
      // is the compact GameRoomCard sharing a `.ttt-top-row` with the header
      // card, and that shared row is what sizes both – which is why a rule
      // that took the header out of the row's sizing could push Leave past its
      // right edge without the document scrolling at all.
      const leaveButtons = landscape().getAllByRole('button', { name: 'game.ui.leave' })
      expect(leaveButtons).toHaveLength(1)

      const row = leaveButtons[0].closest('.ttt-top-row')
      expect(row).toBeTruthy()
      expect(row!.parentElement).toHaveClass('game-landscape-side')
      expect(row!.querySelector('.liars-header-card')).toBeTruthy()
      expect(row!.firstElementChild).toHaveClass('liars-header-card')
      expect(leaveButtons[0].closest('.game-room-card--compact')).toBeTruthy()
    })

    it('offers Players and Chat only – the phase already owns the board column', async () => {
      await renderPlaying()

      const strip = landscapeTree().querySelector('.game-tabs') as HTMLElement
      expect([...strip.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
        'game.ui.tabPlayers',
        'game.ui.tabChat',
      ])
      // The mobile tree does carry a Game tab, because there the phase is a tab.
      const mobileStrip = document.querySelector('.ttt-mobile-layout .game-tabs') as HTMLElement
      expect([...mobileStrip.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
        'liarsParty.tabGame',
        'game.ui.tabPlayers',
        'game.ui.tabChat',
      ])
    })

    it('swaps the side panel between the standings and the chat', async () => {
      await renderPlaying()

      const side = () => landscapeTree().querySelector('.game-landscape-side') as HTMLElement
      expect(within(side()).getByTestId('liars-standings')).toBeTruthy()
      expect(side().querySelector('.game-chat-panel')).toBeNull()

      fireEvent.click(within(side()).getByRole('button', { name: 'game.ui.tabChat' }))

      await waitFor(() => expect(side().querySelector('.game-chat-panel')).toBeTruthy())
      expect(within(side()).queryByTestId('liars-standings')).toBeNull()
      // The phase does not move with the tab: it is the other column.
      expect(within(landscapeTree()).getByTestId('liars-party-claim-screen-landscape')).toBeTruthy()

      fireEvent.click(within(side()).getByRole('button', { name: 'game.ui.tabPlayers' }))
      await waitFor(() => expect(within(side()).getByTestId('liars-standings')).toBeTruthy())
    })

    it('puts the result overlay over the landscape board too', async () => {
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => buildFinishedResponse() } as Response)
      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('liars-party-game-over-screen')).toBeTruthy())

      const card = landscapeTree().querySelector('.liars-phase-card') as HTMLElement
      expect(within(card).getByRole('button', { name: 'lobby.game.playAgain' })).toBeTruthy()
      // And the standings still list everyone, not the one survivor.
      const panel = landscape().getByTestId('liars-standings')
      for (const name of ['Alice', 'Bob', 'Carol', 'Dave']) {
        expect(within(panel).getByText(name)).toBeTruthy()
      }
    })
  })

  it('asks the server when the round clock has run out and nobody has acted (#999)', async () => {
    const response = buildStalledPlayingResponse(120)
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response)

    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())

    // The lobby GET is the whole fix: it runs applyTimeoutFallback and
    // sweepStalePlayers, and nothing else on this page asks for one.
    await waitFor(
      () =>
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('asking the server'),
          { code: 'ABCD' }
        ),
      { timeout: 3000 }
    )
  })

})
