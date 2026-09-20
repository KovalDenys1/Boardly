/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import PushOptInNudge, { __resetPushAskStateForTests } from '@/components/PushOptInNudge'

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const mockTrackPushPrompt = jest.fn()
jest.mock('@/lib/analytics', () => ({
  trackPushPrompt: (...args: unknown[]) => mockTrackPushPrompt(...args),
}))

const mockToastSuccess = jest.fn()
const mockToastError = jest.fn()
jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

const mockSubscribe = jest.fn()
const mockGetExisting = jest.fn()
jest.mock('@/lib/push-subscription', () => ({
  isPushConfigured: () => Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
  isPushSupported: () => 'Notification' in window && 'PushManager' in window,
  getExistingPushSubscription: () => mockGetExisting(),
  subscribeAndRegisterPush: () => mockSubscribe(),
}))

const DISMISS_KEY = 'boardly:push-ask-dismissed:v1'
const RETRY_KEY = 'boardly:push-ask-failed:v1'
const DAY_MS = 24 * 60 * 60 * 1000

function setPermission(permission: NotificationPermission) {
  ;(window as unknown as { Notification: unknown }).Notification = { permission }
}

/** Mounts the ask and lets the async "already subscribed?" check settle. */
async function renderNudge() {
  const utils = render(<PushOptInNudge source="after_game" gameType="yahtzee" />)
  await act(async () => {
    await Promise.resolve()
  })
  return utils
}

describe('PushOptInNudge (#984)', () => {
  const originalKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const originalNotification = (window as unknown as { Notification?: unknown }).Notification
  const originalPushManager = (window as unknown as { PushManager?: unknown }).PushManager

  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    __resetPushAskStateForTests()
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-vapid-public-key'
    ;(window as unknown as { PushManager: unknown }).PushManager = function PushManager() {}
    setPermission('default')
    mockGetExisting.mockResolvedValue(null)
    mockSubscribe.mockResolvedValue('registered')
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = originalKey
    ;(window as unknown as { Notification?: unknown }).Notification = originalNotification
    ;(window as unknown as { PushManager?: unknown }).PushManager = originalPushManager
    localStorage.clear()
  })

  it('asks when the build can actually subscribe, and reports it as shown', async () => {
    await renderNudge()

    expect(screen.queryByText('game.ui.pushAskHeadline')).not.toBeNull()
    expect(mockTrackPushPrompt).toHaveBeenCalledWith('shown', 'after_game', 'yahtzee')
  })

  it('stays hidden without the VAPID key - subscribing could only ever fail', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

    await renderNudge()

    expect(screen.queryByText('game.ui.pushAskHeadline')).toBeNull()
    expect(mockTrackPushPrompt).not.toHaveBeenCalled()
    // The one-shot browser prompt must not be spent on a build that cannot use it.
    expect(mockGetExisting).not.toHaveBeenCalled()
  })

  it('stays hidden where PushManager does not exist - iOS Safari outside an installed PWA', async () => {
    delete (window as unknown as { PushManager?: unknown }).PushManager

    await renderNudge()

    expect(screen.queryByText('game.ui.pushAskHeadline')).toBeNull()
    expect(mockTrackPushPrompt).not.toHaveBeenCalled()
  })

  it('stays hidden once permission is denied - the browser will not prompt again', async () => {
    setPermission('denied')

    await renderNudge()

    expect(screen.queryByText('game.ui.pushAskHeadline')).toBeNull()
    expect(mockTrackPushPrompt).not.toHaveBeenCalled()
  })

  it('stays hidden when this device already has a subscription', async () => {
    mockGetExisting.mockResolvedValue({ endpoint: 'https://example.com/push' })

    await renderNudge()

    expect(screen.queryByText('game.ui.pushAskHeadline')).toBeNull()
    expect(mockTrackPushPrompt).not.toHaveBeenCalled()
  })

  it('dismissal persists across a remount', async () => {
    const { unmount } = await renderNudge()

    act(() => {
      screen.getByText('game.ui.pushAskDismiss').click()
    })

    expect(screen.queryByText('game.ui.pushAskHeadline')).toBeNull()
    expect(mockTrackPushPrompt).toHaveBeenCalledWith('dismissed', 'after_game', 'yahtzee')
    expect(Number(localStorage.getItem(DISMISS_KEY))).toBeGreaterThan(0)

    unmount()
    __resetPushAskStateForTests()
    await renderNudge()
    expect(screen.queryByText('game.ui.pushAskHeadline')).toBeNull()
  })

  /**
   * The literals are the point. The first version of this test asserted only
   * hidden-right-after-dismiss and visible-at-31-days, which every window in (0, 31 days)
   * satisfies - a one-hour TTL passed it. 30 days is load bearing: a browser grants the
   * notification prompt once per origin and a refusal is permanent, so re-asking inside the
   * same session spends the one thing the design is protecting.
   */
  it.each([
    ['29 days after a dismissal, still inside the window', 29, true],
    ['31 days after a dismissal, the window has passed', 31, false],
  ])('%s', async (_name, daysAgo, expectHidden) => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() - daysAgo * DAY_MS))

    await renderNudge()

    if (expectHidden) {
      expect(screen.queryByText('game.ui.pushAskHeadline')).toBeNull()
      expect(mockTrackPushPrompt).not.toHaveBeenCalled()
    } else {
      expect(screen.queryByText('game.ui.pushAskHeadline')).not.toBeNull()
    }
  })

  it('accepting subscribes AND turns the preference on - the subscription alone delivers nothing', async () => {
    await renderNudge()

    await act(async () => {
      screen.getByText('game.ui.pushAskAccept').click()
    })

    expect(mockSubscribe).toHaveBeenCalledTimes(1)

    const fetchMock = global.fetch as unknown as jest.Mock
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/user/notification-preferences')
    expect(init.method).toBe('PUT')
    // NotificationPreferences.pushNotifications defaults to false and lib/push-send.ts
    // returns before reading subscriptions when it is - without this PUT the row is dead.
    expect(JSON.parse(init.body)).toEqual({ pushNotifications: true })

    expect(mockTrackPushPrompt).toHaveBeenCalledWith('accepted', 'after_game', 'yahtzee')
    expect(mockToastSuccess).toHaveBeenCalledWith('toast.pushEnabled')

    await waitFor(() => {
      expect(screen.queryByText('game.ui.pushAskHeadline')).toBeNull()
    })
  })

  it('does NOT say notifications are on when the preference write is refused', async () => {
    // The response was never read before the #984 review: a 401 or a 500 here left
    // pushNotifications false, lib/push-send.ts returns before reading subscriptions when it
    // is, and the player was told "Notifications on" anyway.
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch

    await renderNudge()

    await act(async () => {
      screen.getByText('game.ui.pushAskAccept').click()
    })

    expect(mockToastSuccess).not.toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalledWith('profile.settings.error')
    expect(mockTrackPushPrompt).not.toHaveBeenCalledWith('accepted', 'after_game', 'yahtzee')
    expect(mockTrackPushPrompt).toHaveBeenCalledWith('failed', 'after_game', 'yahtzee')
    // A failed attempt is not a refusal, so it takes the short window, not the 30-day one.
    expect(Number(localStorage.getItem(RETRY_KEY))).toBeGreaterThan(0)
    expect(localStorage.getItem(DISMISS_KEY)).toBeNull()
  })

  it('does not say notifications are on when the preference write throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch

    await renderNudge()

    await act(async () => {
      screen.getByText('game.ui.pushAskAccept').click()
    })

    expect(mockToastSuccess).not.toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalledWith('profile.settings.error')
  })

  it('stops asking for a day after an attempt that broke, and asks again after that', async () => {
    localStorage.setItem(RETRY_KEY, String(Date.now() - 23 * 60 * 60 * 1000))
    const { unmount } = await renderNudge()
    expect(screen.queryByText('game.ui.pushAskHeadline')).toBeNull()
    unmount()
    __resetPushAskStateForTests()

    // 25 hours on, the outage is somebody else's problem and the ask comes back. Without the
    // separate key a broken attempt would either re-ask at every single game end, or borrow
    // the 30-day dismissal window and silence a willing player for a month over one 429.
    localStorage.setItem(RETRY_KEY, String(Date.now() - 25 * 60 * 60 * 1000))
    await renderNudge()
    expect(screen.queryByText('game.ui.pushAskHeadline')).not.toBeNull()
  })

  /**
   * MemoryGameBoard.tsx renders its desktop (:743), phone-landscape (:788) and mobile-tab
   * (:826) boards in one tree and hides two with `display: none`. React mounts all three and
   * runs all three sets of effects, so this used to be three `push_prompt_shown` beacons per
   * finished Memory game and a dismissal that closed one box out of three.
   */
  it('reports one shown and closes every copy at once when several are mounted', async () => {
    render(
      <>
        <PushOptInNudge source="after_game" gameType="memory" />
        <PushOptInNudge source="after_game" gameType="memory" />
        <PushOptInNudge source="after_game" gameType="memory" />
      </>
    )
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.queryAllByText('game.ui.pushAskHeadline')).toHaveLength(3)
    const shown = mockTrackPushPrompt.mock.calls.filter((call) => call[0] === 'shown')
    expect(shown).toHaveLength(1)

    act(() => {
      screen.queryAllByText('game.ui.pushAskDismiss')[0].click()
    })

    expect(screen.queryAllByText('game.ui.pushAskHeadline')).toHaveLength(0)
    const dismissed = mockTrackPushPrompt.mock.calls.filter((call) => call[0] === 'dismissed')
    expect(dismissed).toHaveLength(1)
  })

  it('a browser-level refusal is recorded as denied and writes no preference', async () => {
    mockSubscribe.mockResolvedValue('denied')

    await renderNudge()

    await act(async () => {
      screen.getByText('game.ui.pushAskAccept').click()
    })

    expect(mockTrackPushPrompt).toHaveBeenCalledWith('denied', 'after_game', 'yahtzee')
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockToastSuccess).not.toHaveBeenCalled()
    expect(screen.queryByText('game.ui.pushAskHeadline')).toBeNull()
  })

  it('says so when the server cannot take a subscription at all', async () => {
    mockSubscribe.mockResolvedValue('unavailable')

    await renderNudge()

    await act(async () => {
      screen.getByText('game.ui.pushAskAccept').click()
    })

    expect(mockToastError).toHaveBeenCalledWith('profile.settings.notifications.pushUnavailable')
    expect(global.fetch).not.toHaveBeenCalled()
    // Nothing was subscribed, so there is nothing to cool off from - this build cannot ask
    // at all and the mount guard says so before the box is ever drawn.
    expect(localStorage.getItem(RETRY_KEY)).toBeNull()
  })

  it('offers a retry, not a "not available here", when the subscription POST is refused', async () => {
    mockSubscribe.mockResolvedValue('failed')

    await renderNudge()

    await act(async () => {
      screen.getByText('game.ui.pushAskAccept').click()
    })

    expect(mockToastError).toHaveBeenCalledWith('profile.settings.notifications.pushFailed')
    expect(mockToastSuccess).not.toHaveBeenCalled()
    expect(mockTrackPushPrompt).toHaveBeenCalledWith('failed', 'after_game', 'yahtzee')
    expect(Number(localStorage.getItem(RETRY_KEY))).toBeGreaterThan(0)
  })

  it('survives a private window, where reading localStorage throws', async () => {
    const getItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: The operation is insecure.')
    })

    await renderNudge()

    // safe-storage probes with a write, so a throwing setItem means no storage at all:
    // the ask must still render rather than take the end screen down with it.
    expect(screen.queryByText('game.ui.pushAskHeadline')).not.toBeNull()

    act(() => {
      screen.getByText('game.ui.pushAskDismiss').click()
    })
    expect(screen.queryByText('game.ui.pushAskHeadline')).toBeNull()

    getItem.mockRestore()
  })
})
