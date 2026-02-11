import { notifySocket } from '@/lib/socket-url'

describe('notifySocket deduplication', () => {
  const fetchMock = jest.fn()

  beforeEach(() => {
    jest.useFakeTimers()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true })
    Object.defineProperty(global, 'fetch', {
      value: fetchMock,
      writable: true,
      configurable: true,
    })
    process.env.SOCKET_SERVER_URL = 'http://localhost:3001'
    delete process.env.NEXT_PUBLIC_SOCKET_URL
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('sends separate notifications for different state snapshots in the same room/event', async () => {
    const first = notifySocket(
      'lobby:ABC123',
      'game-update',
      {
        action: 'state-change',
        payload: {
          currentPlayerIndex: 0,
          lastMoveAt: 1000,
          updatedAt: '2026-02-11T10:00:00.000Z',
          data: { rollsLeft: 2 },
        },
      },
      25
    )

    const second = notifySocket(
      'lobby:ABC123',
      'game-update',
      {
        action: 'state-change',
        payload: {
          currentPlayerIndex: 1,
          lastMoveAt: 2000,
          updatedAt: '2026-02-11T10:00:01.000Z',
          data: { rollsLeft: 3 },
        },
      },
      25
    )

    jest.advanceTimersByTime(30)
    await Promise.all([first, second])

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('deduplicates identical state snapshots even when payload shape differs', async () => {
    const first = notifySocket(
      'lobby:ABC123',
      'game-update',
      {
        action: 'state-change',
        payload: {
          currentPlayerIndex: 0,
          lastMoveAt: 1000,
          updatedAt: '2026-02-11T10:00:00.000Z',
          data: { rollsLeft: 2 },
        },
      },
      25
    )

    const second = notifySocket(
      'lobby:ABC123',
      'game-update',
      {
        action: 'state-change',
        payload: {
          state: {
            currentPlayerIndex: 0,
            lastMoveAt: 1000,
            updatedAt: '2026-02-11T10:00:00.000Z',
            data: { rollsLeft: 2 },
          },
        },
      },
      25
    )

    jest.advanceTimersByTime(30)
    await Promise.all([first, second])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
