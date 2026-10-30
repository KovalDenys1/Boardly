import { act, renderHook, waitFor } from '@testing-library/react'
import { rematchRefusalToastKey, resetRematchSignals, useRematchSignal } from '@/hooks/useRematchSignal'

const handlers: Record<string, (payload: unknown) => void> = {}
jest.mock('@/lib/lobby-channel-registry', () => ({
  acquireLobbyChannel: jest.fn((_topic: string, sub: { events: Record<string, (p: unknown) => void> }) => {
    Object.assign(handlers, sub.events)
    return { channel: {}, release: jest.fn() }
  }),
  openLobbyTopic: jest.fn((code: string) => `lobby:${code}:secret`),
}))
const mockFetch = jest.fn()
jest.mock('@/lib/fetch-with-guest', () => ({ fetchWithGuest: (...args: unknown[]) => mockFetch(...args) }))
jest.mock('@/lib/i18n-toast', () => ({ showToast: { error: jest.fn(), info: jest.fn() } }))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { showToast: mockToast } = require('@/lib/i18n-toast')

const reply = (ok: boolean, body: unknown, status = ok ? 200 : 400) => ({ ok, status, json: async () => body })

describe('useRematchSignal', () => {
  beforeEach(() => {
    resetRematchSignals()
    jest.clearAllMocks()
  })

  it('keeps the ask sent and the host\'s notice across View board, and lets go of the channel on unmount', async () => {
    mockFetch.mockResolvedValue(reply(true, { notifiedCount: 1 }))
    const first = renderHook(() => useRematchSignal('AB12', 'game-1'))
    await waitFor(() => expect(handlers['rematch-request']).toBeDefined())
    await act(async () => { await first.result.current.ask() })
    act(() => handlers['rematch-request']({ requestedByName: 'Ada' }))
    first.unmount()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { acquireLobbyChannel } = require('@/lib/lobby-channel-registry')
    expect(acquireLobbyChannel.mock.results[0].value.release).toHaveBeenCalled()

    const again = renderHook(() => useRematchSignal('AB12', 'game-1'))
    expect(again.result.current.askState).toBe('sent')
    expect(again.result.current.requestedBy).toBe('Ada')
  })

  it('starts over for the next finish', async () => {
    mockFetch.mockResolvedValue(reply(true, { notifiedCount: 1 }))
    const { result, rerender } = renderHook(({ key }) => useRematchSignal('AB12', key), { initialProps: { key: 'game-1' } })
    await act(async () => { await result.current.ask() })
    rerender({ key: 'game-2' })
    await waitFor(() => expect(result.current.askState).toBe('idle'))
  })

  it('says a refused ask is going too fast in the generic words, not lobby creation\'s', async () => {
    mockFetch.mockResolvedValue(reply(false, { error: 'Too many requests. Please slow down.', retryAfter: 60 }, 429))
    const { result } = renderHook(() => useRematchSignal('AB12', 'game-1'))
    await act(async () => { await result.current.ask() })
    expect(result.current.askState).toBe('idle')
    expect(mockToast.error).toHaveBeenCalledWith('errors.tooManyRequests', undefined, undefined, { id: 'rematch-request' })
  })

  it('names a refused rematch the same way wherever it is asked for', () => {
    expect(rematchRefusalToastKey(429, { error: 'Too many requests. Please slow down.' })).toBe('errors.tooManyRequests')
    expect(rematchRefusalToastKey(403, { translationKey: 'toast.rematchNotParticipant' })).toBe('toast.rematchNotParticipant')
    expect(rematchRefusalToastKey(500, { error: 'Failed' })).toBe('toast.rematchRequestFailed')
    expect(rematchRefusalToastKey(502, null)).toBe('toast.rematchRequestFailed')
  })

  it('does not claim the host was asked when nobody was notified', async () => {
    mockFetch.mockResolvedValue(reply(true, { notifiedCount: 0 }))
    const { result } = renderHook(() => useRematchSignal('AB12', 'game-1'))
    await act(async () => { await result.current.ask() })
    expect(result.current.askState).toBe('idle')
    expect(mockToast.info).toHaveBeenCalledWith('toast.rematchNoPlayers', undefined, undefined, { id: 'rematch-request' })
  })
})
