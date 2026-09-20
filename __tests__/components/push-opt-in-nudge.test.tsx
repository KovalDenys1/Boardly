/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import PushOptInNudge from '@/components/PushOptInNudge'

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

  it('dismissal persists across a remount and holds for 30 days', async () => {
    const { unmount } = await renderNudge()

    act(() => {
      screen.getByText('game.ui.pushAskDismiss').click()
    })

    expect(screen.queryByText('game.ui.pushAskHeadline')).toBeNull()
    expect(mockTrackPushPrompt).toHaveBeenCalledWith('dismissed', 'after_game', 'yahtzee')
    expect(Number(localStorage.getItem(DISMISS_KEY))).toBeGreaterThan(0)

    unmount()
    await renderNudge()
    expect(screen.queryByText('game.ui.pushAskHeadline')).toBeNull()

    // 31 days later the ask is allowed back.
    localStorage.setItem(DISMISS_KEY, String(Date.now() - 31 * 24 * 60 * 60 * 1000))
    await renderNudge()
    expect(screen.queryByText('game.ui.pushAskHeadline')).not.toBeNull()
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
