import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NotificationsMenu } from '@/components/Header/NotificationsMenu'

const mockPush = jest.fn()
const mockPathname = '/'
const mockFetch = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => mockPathname,
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, options?: string | Record<string, unknown>) => {
      const dictionary: Record<string, string> = {
        'profile.playerFallback': 'Player',
        'header.notificationDefaultGame': 'game',
        'header.notifications': 'Notifications',
        'header.openNotifications': 'Open notifications',
        'header.notificationsUnread': '{{count}} unread',
        'header.notificationsEmpty': 'No notifications yet',
        'header.markAllRead': 'Mark all as read',
        'header.notificationsItems.default': 'Open notification',
        'header.notificationsItems.friendRequest': '{{name}} sent you a friend request',
        'header.notificationsItems.friendAccepted': '{{name}} accepted your friend request',
        'header.notificationsItems.gameInvite': '{{name}} invited you to play {{game}}',
        'header.notificationsItems.rematchInvite': '{{name}} invited you to a {{game}} rematch',
        'header.notificationsItems.turnReminder': 'It is your turn in {{game}}',
        'common.close': 'Close',
        'common.loading': 'Loading...',
      }

      let value = dictionary[key] ?? key
      if (typeof options === 'object' && options) {
        for (const [name, replacement] of Object.entries(options)) {
          value = value.replace(`{{${name}}}`, String(replacement))
        }
      }
      return value
    },
  }),
}))

function mockJsonResponse(payload: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  })
}

describe('NotificationsMenu', () => {
  const originalFetch = global.fetch

  beforeAll(() => {
    global.fetch = mockFetch as unknown as typeof fetch
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input)

      if (url.includes('/api/notifications/read')) {
        return mockJsonResponse({ success: true, count: 1 })
      }

      if (url.includes('/api/notifications')) {
        return mockJsonResponse({
          notifications: [
            {
              id: 'notification-1',
              type: 'friend_request',
              createdAt: '2026-03-11T10:00:00.000Z',
              readAt: null,
              payload: {
                senderName: 'Alice',
                href: '/profile?tab=friends',
              },
            },
          ],
          unreadCount: 1,
        })
      }

      return mockJsonResponse({}, 404)
    })
  })

  it('renders unread notifications and marks an item as read before navigating', async () => {
    render(<NotificationsMenu />)

    await waitFor(() => {
      expect(screen.getByTitle('1 unread')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Open notifications' }))

    const requestItem = await screen.findByRole('button', {
      name: /Alice sent you a friend request/i,
    })

    fireEvent.click(requestItem)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/notifications/read',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ ids: ['notification-1'] }),
        })
      )
    })

    expect(mockPush).toHaveBeenCalledWith('/profile?tab=friends')
  })
})
