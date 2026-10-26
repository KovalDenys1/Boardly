import { act, renderHook } from '@testing-library/react'
import { useLobbyActions } from '@/app/(site)/lobby/[code]/hooks/useLobbyActions'
import { createFreshnessWatermark, takePlayerLeftFrame } from '@/lib/game-state-freshness'

jest.mock('@/lib/client-logger', () => ({ clientLogger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('@/lib/i18n-toast', () => ({ showToast: { error: jest.fn(), success: jest.fn(), errorFrom: jest.fn(), custom: jest.fn(), loading: jest.fn(), dismiss: jest.fn() } }))
jest.mock('@/lib/auth-headers', () => ({ getAuthHeaders: jest.fn(() => ({})) }))
jest.mock('@/lib/restore-game-engine-client', () => ({ restoreGameEngineClient: jest.fn(async () => ({})) }))
jest.mock('@/lib/lobby-create-metrics', () => ({ finalizePendingLobbyCreateMetric: jest.fn() }))
jest.mock('@/lib/lobby-player-requirements', () => ({ getLobbyPlayerRequirements: jest.fn(() => ({ gameType: 'yahtzee', minPlayersRequired: 1, desiredPlayerCount: 1, supportsBots: false })) }))
jest.mock('@/lib/analytics', () => ({ trackAuth: jest.fn(), trackFunnelStep: jest.fn(), trackLobbyJoined: jest.fn(), trackGameStarted: jest.fn(), trackStartAloneAutoBotResult: jest.fn() }))
jest.mock('@/i18n', () => ({ __esModule: true, default: { t: jest.fn((k: string) => k) } }))

const waiting = (creatorId: string, ids: string[]) => ({
  lobby: { id: 'lobby-1', code: 'ABCD12', gameType: 'yahtzee', creatorId },
  activeGame: { id: 'game-w', status: 'waiting', players: ids.map((userId) => ({ userId, leftAt: null, user: { bot: null } })), state: JSON.stringify({ id: 'w', lastMoveAt: 1_000 }) },
})
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const refused = () => ({ ok: false, status: 429, json: async () => ({ error: 'Too many game actions. Please slow down.' }) })

function harness() {
  const resolvers: Array<(value: unknown) => void> = []
  ;(global.fetch as jest.Mock).mockImplementation(() => new Promise((resolve) => { resolvers.push(resolve) }))
  const screen: { lobby: any } = { lobby: null }
  const setLobby = jest.fn((next: any) => { screen.lobby = typeof next === 'function' ? next(screen.lobby) : next })
  const setError = jest.fn()
  const freshnessRef = { current: createFreshnessWatermark() }
  const props = {
    code: 'ABCD12', lobby: null as any, game: null as any, freshnessRef,
    setGame: jest.fn(), setLobby, setGameEngine: jest.fn(), setTimerActive: jest.fn(), setTimeLeft: jest.fn(), setRollHistory: jest.fn(),
    setCelebrationEvent: jest.fn(), setChatMessages: jest.fn(), isGuest: false, guestId: null, guestName: null, guestToken: null,
    userId: 'V', username: 'Vera', setGuestMode: jest.fn(), setError, setLoading: jest.fn(), setStartingGame: jest.fn(),
    selectedBotDifficulty: 'medium' as const,
  }
  const { result } = renderHook(() => useLobbyActions(props as any))
  // LobbyPageClient.onPlayerLeft: the frame's host first, then a read of its own.
  const onPlayerLeft = (frame: { userId: string; nextCreatorId?: string; leftAt: string }) => {
    const next = takePlayerLeftFrame(freshnessRef.current, frame)
    if (next) setLobby((prev: any) => (prev ? { ...prev, creatorId: next } : prev))
    return result.current.loadLobby({ fresh: true, trusted: false })
  }
  return { resolvers, screen, setError, freshnessRef, result, onPlayerLeft }
}

// #1528 review: a player who left a waiting room, came back and inherits the host is shown as host at once.
// The frames carry the server's leave time, so a frame is judged against when each player left.
describe('useLobbyActions – a player who rejoined inherits the host (#1528)', () => {
  beforeEach(() => { global.fetch = jest.fn() as any })

  for (const leaveReadFails of [false, true]) {
    it(`shows the rejoined player as host before the join read lands (${leaveReadFails ? 'leave read refused' : 'leave read lands'})`, async () => {
      const h = harness()
      await act(async () => {
        const first = h.result.current.loadLobby()
        h.resolvers[0](ok(waiting('H', ['H', 'A', 'V'])))
        await first
      })
      expect(h.screen.lobby.creatorId).toBe('H')
      await act(async () => {
        const leaveA = h.onPlayerLeft({ userId: 'A', leftAt: '2026-10-26T20:00:01.000Z' })
        h.resolvers[1](ok(waiting('H', ['H', 'V'])))
        await leaveA
      })
      let joinedRead: Promise<void>
      let leaveH: Promise<void>
      await act(async () => {
        joinedRead = h.result.current.loadLobby() // onPlayerJoined
        leaveH = h.onPlayerLeft({ userId: 'H', nextCreatorId: 'A', leftAt: '2026-10-26T20:00:03.000Z' })
      })
      expect(h.screen.lobby.creatorId).toBe('A')
      await act(async () => {
        h.resolvers[2](ok(waiting('H', ['H', 'V', 'A']))) // answered after A joined, before H left
        await joinedRead!
        h.resolvers[3](leaveReadFails ? refused() : ok(waiting('A', ['V', 'A'])))
        await leaveH!
      })
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(4)
      expect(h.screen.lobby.creatorId).toBe('A')
    })
  }
})
