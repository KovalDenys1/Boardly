import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PlayVsBotButton from '@/app/(site)/games/components/PlayVsBotButton'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'
import { trackGameStarted } from '@/lib/analytics'

const pushMock = jest.fn()
const replaceMock = jest.fn()
const setGuestModeMock = jest.fn()
const completeOnboardingMock = jest.fn()

// Mutable so a test can put the session in `loading`, which is where the
// reported bug lived: NextAuth reports it for the first moments after mount.
let sessionStatus: 'loading' | 'unauthenticated' | 'authenticated' = 'unauthenticated'
let guestState = { isGuest: false }

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    error: jest.fn(),
  },
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: sessionStatus }),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => '/games/yahtzee',
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: guestState.isGuest,
    setGuestMode: setGuestModeMock,
  }),
}))

jest.mock('@/lib/fetch-with-guest', () => ({
  ...jest.requireActual('@/lib/fetch-with-guest'),
  fetchWithGuest: jest.fn(),
}))

jest.mock('@/lib/analytics', () => ({
  trackGameStarted: jest.fn(),
}))

jest.mock('@/contexts/OnboardingContext', () => ({
  useOnboarding: () => ({ completeOnboarding: completeOnboardingMock }),
}))

describe('PlayVsBotButton — fresh guest flow', () => {
  beforeEach(() => {
    sessionStatus = 'unauthenticated'
    guestState = { isGuest: false }
    pushMock.mockClear()
    setGuestModeMock.mockReset().mockResolvedValue(undefined)
    ;(fetchWithGuest as jest.Mock).mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ lobbyCode: 'ABCD' }),
    })
  })

  it('opens a guest-name prompt instead of redirecting to /auth/login when unauthenticated', async () => {
    render(<PlayVsBotButton gameType="yahtzee" />)

    fireEvent.click(screen.getByText('quickPlay.playVsBot', { exact: false }))
    fireEvent.click(screen.getByText('lobby.create.difficultyEasy'))

    expect(await screen.findByText('guest.playAsGuest')).toBeTruthy()
    expect(pushMock).not.toHaveBeenCalledWith('/auth/login')
  })

  it('starts a quick-play game as the chosen difficulty once a guest name is submitted', async () => {
    render(<PlayVsBotButton gameType="yahtzee" />)

    fireEvent.click(screen.getByText('quickPlay.playVsBot', { exact: false }))
    fireEvent.click(screen.getByText('lobby.create.difficultyEasy'))

    const input = await screen.findByPlaceholderText('guest.namePlaceholder')
    fireEvent.change(input, { target: { value: 'NewVisitor' } })
    fireEvent.click(screen.getByText('guest.playAsGuest'))

    await waitFor(() => expect(setGuestModeMock).toHaveBeenCalledWith('NewVisitor'))
    await waitFor(() => expect(fetchWithGuest).toHaveBeenCalledWith(
      '/api/quick-play',
      expect.objectContaining({
        body: JSON.stringify({ gameType: 'yahtzee', difficulty: 'easy', forceSolo: true }),
      })
    ))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/ABCD'))
  })
})

describe('PlayVsBotButton — the gate cannot be outrun', () => {
  beforeEach(() => {
    sessionStatus = 'unauthenticated'
    guestState = { isGuest: false }
    pushMock.mockClear()
    setGuestModeMock.mockReset().mockResolvedValue(undefined)
    ;(fetchWithGuest as jest.Mock).mockReset().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ lobbyCode: 'ABCD' }),
    })
  })

  it('offers the gate rather than posting when the session has not resolved yet', async () => {
    // Reported on production 2026-09-13: a click in this window skipped the
    // check, posted with no credentials and surfaced the server's raw
    // "Unauthorized" on a page that promises you can play without an account.
    sessionStatus = 'loading'
    render(<PlayVsBotButton gameType="tic_tac_toe" />)

    fireEvent.click(screen.getByText('quickPlay.playVsBot', { exact: false }))
    await act(async () => {
      fireEvent.click(screen.getByText('lobby.create.difficultyMedium'))
    })

    expect(fetchWithGuest).not.toHaveBeenCalled()
    expect(await screen.findByText('guest.playAsGuest')).toBeTruthy()
  })

  it('offers the gate when the server rejects the credentials it was given', async () => {
    // No client check can predict this: a guest token expires while `isGuest`
    // is still true locally. Same answer as a fresh visitor, never a toast.
    guestState = { isGuest: true }
    ;(fetchWithGuest as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    })
    render(<PlayVsBotButton gameType="tic_tac_toe" />)

    fireEvent.click(screen.getByText('quickPlay.playVsBot', { exact: false }))
    await act(async () => {
      fireEvent.click(screen.getByText('lobby.create.difficultyMedium'))
    })

    expect(fetchWithGuest).toHaveBeenCalled()
    expect(await screen.findByText('guest.playAsGuest')).toBeTruthy()
    expect(pushMock).not.toHaveBeenCalled()
  })

  describe('a lobby still open elsewhere (#1344)', () => {
    const conflict = {
      ok: false,
      status: 409,
      json: async () => ({ error: 'You already have a game open', code: 'LOBBY_ALREADY_OPEN', lobbyCode: 'OLD1' }),
    }

    async function pickEasy() {
      fireEvent.click(screen.getByText('quickPlay.playVsBot', { exact: false }))
      await act(async () => {
        fireEvent.click(screen.getByText('lobby.create.difficultyEasy'))
      })
    }

    beforeEach(() => {
      guestState = { isGuest: true }
    })

    it('asks instead of routing back to the old lobby unannounced', async () => {
      ;(fetchWithGuest as jest.Mock).mockResolvedValueOnce(conflict)
      render(<PlayVsBotButton gameType="checkers" />)
      await pickEasy()

      expect(await screen.findByRole('alertdialog')).toBeTruthy()
      expect(screen.getByText('quickPlay.openLobbyTitle')).toBeTruthy()
      expect(pushMock).not.toHaveBeenCalled()
    })

    it('leaves the old lobby and starts the new bot game', async () => {
      ;(fetchWithGuest as jest.Mock)
        .mockResolvedValueOnce(conflict)
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ lobbyCode: 'NEW1' }) })
      render(<PlayVsBotButton gameType="checkers" />)
      await pickEasy()

      await act(async () => {
        fireEvent.click(await screen.findByText('quickPlay.openLobbyLeaveAndPlay'))
      })

      await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/NEW1'))
      const calls = (fetchWithGuest as jest.Mock).mock.calls
      expect(calls[1][0]).toBe('/api/lobby/OLD1/leave')
      expect(calls[1][1]).toEqual(expect.objectContaining({ method: 'POST' }))
      expect(calls[2][0]).toBe('/api/quick-play')
      expect(JSON.parse(calls[2][1].body)).toEqual(expect.objectContaining({ gameType: 'checkers', difficulty: 'easy' }))
    })

    it('moves focus into the dialog, traps Tab and returns focus to the trigger on Escape', async () => {
      ;(fetchWithGuest as jest.Mock).mockResolvedValueOnce(conflict)
      render(<PlayVsBotButton gameType="checkers" />)
      await pickEasy()

      const leave = await screen.findByText('quickPlay.openLobbyLeaveAndPlay')
      const goBack = screen.getByText('quickPlay.openLobbyGoBack')
      await waitFor(() => expect(document.activeElement).toBe(leave))
      goBack.focus()
      fireEvent.keyDown(goBack, { key: 'Tab' })
      expect(document.activeElement).toBe(leave)
      fireEvent.keyDown(leave, { key: 'Tab', shiftKey: true })
      expect(document.activeElement).toBe(goBack)

      fireEvent.keyDown(document, { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
      expect(document.activeElement).toBe(screen.getByText('quickPlay.playVsBot', { exact: false }).closest('button'))
    })

    it('closes the dialog when the trigger reopens the difficulty menu', async () => {
      ;(fetchWithGuest as jest.Mock).mockResolvedValueOnce(conflict)
      render(<PlayVsBotButton gameType="checkers" />)
      await pickEasy()
      await screen.findByRole('alertdialog')

      fireEvent.click(screen.getByText('quickPlay.playVsBot', { exact: false }))
      expect(screen.queryByRole('alertdialog')).toBeNull()
      expect(screen.getByRole('menu')).toBeTruthy()
    })

    it('goes back to the old lobby when the player chooses it', async () => {
      ;(fetchWithGuest as jest.Mock).mockResolvedValueOnce(conflict)
      render(<PlayVsBotButton gameType="checkers" />)
      await pickEasy()

      fireEvent.click(await screen.findByText('quickPlay.openLobbyGoBack'))
      expect(pushMock).toHaveBeenCalledWith('/lobby/OLD1')
      expect(fetchWithGuest).toHaveBeenCalledTimes(1)
    })
  })
})

describe('PlayVsBotButton – a clip visitor arrives with ?play=bot (#1541)', () => {
  const CLIP_URL = '/games/connect-four?utm_source=tiktok.com&utm_medium=social&utm_campaign=connect-four-trap&play=bot'
  // The guest-session route's own rule (app/api/auth/guest-session/route.ts).
  const SERVER_GUEST_NAME = /^[\w\s-]{2,20}$/u

  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
  const fail = (status: number, body: unknown = { error: 'nope' }) => ({ ok: false, status, json: async () => body })
  const started = ok({
    game: {
      id: 'game-1',
      status: 'playing',
      players: [{ user: { bot: null } }, { user: { bot: { difficulty: 'medium' } } }],
    },
  })

  let quickPlayAnswer: unknown
  let gameCreateAnswer: unknown
  let onboardingStatus: { needsOnboarding: boolean; needsAgeConfirmation: boolean }
  const realFetch = global.fetch

  const calledUrls = () => (fetchWithGuest as jest.Mock).mock.calls.map(([url]) => url)
  const bodyOf = (url: string) => {
    const call = (fetchWithGuest as jest.Mock).mock.calls.find(([called]) => called === url)
    return call ? JSON.parse(call[1].body) : undefined
  }
  const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

  beforeEach(() => {
    sessionStatus = 'unauthenticated'
    guestState = { isGuest: false }
    window.localStorage.clear()
    window.history.replaceState(null, '', CLIP_URL)
    pushMock.mockClear()
    replaceMock.mockClear()
    ;(showToast.error as jest.Mock).mockClear()
    ;(trackGameStarted as jest.Mock).mockClear()
    setGuestModeMock.mockReset().mockResolvedValue(undefined)
    quickPlayAnswer = ok({ lobbyCode: 'C4BOT', lobbyId: 'lobby-c4', isNew: true })
    gameCreateAnswer = started
    completeOnboardingMock.mockReset().mockResolvedValue(undefined)
    onboardingStatus = { needsOnboarding: false, needsAgeConfirmation: false }
    global.fetch = jest.fn(async (url: string) =>
      url === '/api/onboarding/status' ? ok(onboardingStatus) : fail(404),
    ) as unknown as typeof fetch
    ;(fetchWithGuest as jest.Mock).mockReset().mockImplementation(async (url: string) => {
      if (url === '/api/quick-play') return quickPlayAnswer
      if (url === '/api/game/create') return gameCreateAnswer
      return ok({ success: true })
    })
  })

  afterAll(() => {
    window.history.replaceState(null, '', '/')
    global.fetch = realFetch
  })

  it('starts a Medium bot game for a visitor with no session, with no dialog', async () => {
    render(<PlayVsBotButton gameType="connect_four" />)

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/C4BOT'))
    expect(setGuestModeMock).toHaveBeenCalledTimes(1)
    expect(setGuestModeMock.mock.calls[0][0]).toMatch(SERVER_GUEST_NAME)
    expect(bodyOf('/api/quick-play')).toEqual({ gameType: 'connect_four', difficulty: 'medium', forceSolo: true })
    expect(screen.queryByText('guest.playAsGuest')).toBeNull()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('starts the game itself, so the visitor lands on the board rather than in the waiting room', async () => {
    render(<PlayVsBotButton gameType="connect_four" />)

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/C4BOT'))
    expect(calledUrls()).toEqual(['/api/quick-play', '/api/game/create'])
    expect(bodyOf('/api/game/create')).toEqual({ gameType: 'connect_four', lobbyId: 'lobby-c4' })
    expect(trackGameStarted).toHaveBeenCalledWith(
      expect.objectContaining({ lobbyCode: 'C4BOT', gameType: 'connect_four', playerCount: 2, hasBot: true, botCount: 1 }),
    )
  })

  it('takes play=bot off the address in place, so Back or a reload cannot start a second game', async () => {
    const entries = window.history.length
    render(<PlayVsBotButton gameType="connect_four" />)

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/C4BOT'))
    expect(window.location.pathname).toBe('/games/connect-four')
    const params = new URLSearchParams(window.location.search)
    expect(params.has('play')).toBe(false)
    expect(params.get('utm_campaign')).toBe('connect-four-trap')
    expect(window.history.length).toBe(entries)
  })

  it('hands Next a null history state, so its router re-reads the address without play=bot', async () => {
    window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: {} }, '', CLIP_URL)
    const replaceState = jest.spyOn(window.history, 'replaceState')
    render(<PlayVsBotButton gameType="connect_four" />)

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/C4BOT'))
    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/games/connect-four?utm_source=tiktok.com&utm_medium=social&utm_campaign=connect-four-trap',
    )
    replaceState.mockRestore()
  })

  it('reuses the guest the visitor already has, under their own name', async () => {
    guestState = { isGuest: true }
    window.localStorage.setItem('boardly_guest_token', 'stored-token')
    window.localStorage.setItem('boardly_guest_name', 'Ola')
    render(<PlayVsBotButton gameType="connect_four" />)

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/C4BOT'))
    expect(setGuestModeMock.mock.calls).toEqual([['Ola']])
  })

  it('reuses a stored guest even before the guest context has read it', async () => {
    window.localStorage.setItem('boardly_guest_token', 'stored-token')
    window.localStorage.setItem('boardly_guest_name', 'Ola')
    render(<PlayVsBotButton gameType="connect_four" />)

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/C4BOT'))
    expect(setGuestModeMock.mock.calls).toEqual([['Ola']])
  })

  it('refreshes a returning guest whose 12-hour token has expired, then starts the game', async () => {
    window.localStorage.setItem('boardly_guest_token', 'expired-token')
    window.localStorage.setItem('boardly_guest_name', 'Ola')
    setGuestModeMock.mockImplementation(async () => {
      window.localStorage.setItem('boardly_guest_token', 'fresh-token')
    })
    ;(fetchWithGuest as jest.Mock).mockImplementation(async (url: string) => {
      if (window.localStorage.getItem('boardly_guest_token') !== 'fresh-token') return fail(401, { error: 'Unauthorized' })
      if (url === '/api/quick-play') return quickPlayAnswer
      if (url === '/api/game/create') return gameCreateAnswer
      return ok({ success: true })
    })
    render(<PlayVsBotButton gameType="connect_four" />)

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/C4BOT'))
    expect(setGuestModeMock.mock.calls).toEqual([['Ola']])
    expect(calledUrls()).toEqual(['/api/quick-play', '/api/game/create'])
  })

  it('still starts with the stored token when that refresh fails', async () => {
    window.localStorage.setItem('boardly_guest_token', 'stored-token')
    window.localStorage.setItem('boardly_guest_name', 'Ola')
    setGuestModeMock.mockRejectedValue(Object.assign(new Error('Too many requests'), { statusCode: 429 }))
    render(<PlayVsBotButton gameType="connect_four" />)

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/C4BOT'))
  })

  it('plays a signed-in visitor as themselves', async () => {
    sessionStatus = 'authenticated'
    render(<PlayVsBotButton gameType="connect_four" />)

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/C4BOT'))
    expect(setGuestModeMock).not.toHaveBeenCalled()
  })

  it('treats the flag as the quick start, so the welcome sheet never opens over the page on the way', async () => {
    render(<PlayVsBotButton gameType="connect_four" />)

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/C4BOT'))
    expect(completeOnboardingMock).toHaveBeenCalledTimes(1)
    expect(completeOnboardingMock.mock.invocationCallOrder[0]).toBeLessThan(setGuestModeMock.mock.invocationCallOrder[0])
  })

  it('leaves a signed-in account that still owes its age and Terms step on the page, as today', async () => {
    sessionStatus = 'authenticated'
    onboardingStatus = { needsOnboarding: true, needsAgeConfirmation: true }
    render(<PlayVsBotButton gameType="connect_four" />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/onboarding/status', expect.anything()))
    await settle()
    expect(fetchWithGuest).not.toHaveBeenCalled()
    expect(completeOnboardingMock).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
    expect(screen.getByText('quickPlay.playVsBot', { exact: false }).closest('button')).not.toBeDisabled()
  })

  it('does not start a signed-in game when it cannot tell whether that step is owed', async () => {
    sessionStatus = 'authenticated'
    global.fetch = jest.fn(async () => fail(500)) as unknown as typeof fetch
    render(<PlayVsBotButton gameType="connect_four" />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await settle()
    expect(fetchWithGuest).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('waits for the session to resolve before deciding who plays', async () => {
    sessionStatus = 'loading'
    const { rerender } = render(<PlayVsBotButton gameType="connect_four" />)
    await settle()
    expect(fetchWithGuest).not.toHaveBeenCalled()
    expect(setGuestModeMock).not.toHaveBeenCalled()

    sessionStatus = 'authenticated'
    rerender(<PlayVsBotButton gameType="connect_four" />)
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/C4BOT'))
    expect(setGuestModeMock).not.toHaveBeenCalled()
  })

  it('starts one game only, under StrictMode and across re-renders', async () => {
    const { rerender } = render(<StrictMode><PlayVsBotButton gameType="connect_four" /></StrictMode>)
    await waitFor(() => expect(pushMock).toHaveBeenCalled())
    rerender(<StrictMode><PlayVsBotButton gameType="connect_four" /></StrictMode>)
    await settle()

    expect(setGuestModeMock).toHaveBeenCalledTimes(1)
    expect(calledUrls().filter((url) => url === '/api/quick-play')).toHaveLength(1)
    expect(pushMock).toHaveBeenCalledTimes(1)
  })

  it('does nothing without the flag', async () => {
    window.history.replaceState(null, '', '/games/connect-four?utm_source=tiktok.com')
    render(<PlayVsBotButton gameType="connect_four" />)
    await settle()

    expect(fetchWithGuest).not.toHaveBeenCalled()
    expect(setGuestModeMock).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('ignores the flag on a game without bots', async () => {
    render(<PlayVsBotButton gameType="guess_the_spy" />)
    await settle()

    expect(fetchWithGuest).not.toHaveBeenCalled()
    expect(setGuestModeMock).not.toHaveBeenCalled()
  })

  it('without the flag, a pick from the menu still lands in the waiting room as before', async () => {
    window.history.replaceState(null, '', '/games/connect-four')
    guestState = { isGuest: true }
    render(<PlayVsBotButton gameType="connect_four" />)

    fireEvent.click(screen.getByText('quickPlay.playVsBot', { exact: false }))
    await act(async () => {
      fireEvent.click(screen.getByText('lobby.create.difficultyHard'))
    })

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/C4BOT'))
    expect(calledUrls()).toEqual(['/api/quick-play'])
  })

  describe('when the automatic start fails, the page is left as it is today', () => {
    async function expectPlainPage() {
      await settle()
      const trigger = screen.getByText('quickPlay.playVsBot', { exact: false }).closest('button')!
      expect(trigger).not.toBeDisabled()
      expect(screen.queryByText('guest.playAsGuest')).toBeNull()
      expect(showToast.error).not.toHaveBeenCalled()
      expect(pushMock).not.toHaveBeenCalled()
    }

    it('when the guest cannot be created (rate limit, network)', async () => {
      setGuestModeMock.mockRejectedValue(Object.assign(new Error('Too many requests'), { statusCode: 429 }))
      render(<PlayVsBotButton gameType="connect_four" />)

      await waitFor(() => expect(setGuestModeMock).toHaveBeenCalled())
      await expectPlainPage()
      expect(fetchWithGuest).not.toHaveBeenCalled()
    })

    it('when quick play refuses', async () => {
      quickPlayAnswer = fail(429)
      render(<PlayVsBotButton gameType="connect_four" />)

      await waitFor(() => expect(calledUrls()).toContain('/api/quick-play'))
      await expectPlainPage()
    })

    it('when the network drops', async () => {
      ;(fetchWithGuest as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'))
      render(<PlayVsBotButton gameType="connect_four" />)

      await waitFor(() => expect(fetchWithGuest).toHaveBeenCalled())
      await expectPlainPage()
    })

    it('when the credentials are refused, without raising the guest dialog', async () => {
      guestState = { isGuest: true }
      quickPlayAnswer = fail(401, { error: 'Unauthorized' })
      render(<PlayVsBotButton gameType="connect_four" />)

      await waitFor(() => expect(calledUrls()).toContain('/api/quick-play'))
      await expectPlainPage()
    })
  })

  it('still goes to the new lobby when starting the game fails', async () => {
    gameCreateAnswer = fail(500)
    render(<PlayVsBotButton gameType="connect_four" />)

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/C4BOT'))
    expect(showToast.error).not.toHaveBeenCalled()
  })

  it('asks about a lobby that is still open, and starts the new game once the player leaves it', async () => {
    guestState = { isGuest: true }
    quickPlayAnswer = fail(409, { error: 'You already have a game open', code: 'LOBBY_ALREADY_OPEN', lobbyCode: 'OLD1' })
    render(<PlayVsBotButton gameType="connect_four" />)

    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    expect(pushMock).not.toHaveBeenCalled()

    quickPlayAnswer = ok({ lobbyCode: 'NEW1', lobbyId: 'lobby-new1', isNew: true })
    await act(async () => {
      fireEvent.click(screen.getByText('quickPlay.openLobbyLeaveAndPlay'))
    })

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/NEW1'))
    expect(calledUrls()).toEqual(['/api/quick-play', '/api/lobby/OLD1/leave', '/api/quick-play', '/api/game/create'])
    expect(bodyOf('/api/game/create')).toEqual({ gameType: 'connect_four', lobbyId: 'lobby-new1' })
  })
})
