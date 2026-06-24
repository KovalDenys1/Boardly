import { act, renderHook } from '@testing-library/react'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { useGameActions } from '@/app/lobby/[code]/hooks/useGameActions'
import type { RollHistoryEntry } from '@/components/RollHistory'

jest.mock('@/lib/client-logger', () => ({
  clientLogger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn(), success: jest.fn(), errorFrom: jest.fn(), custom: jest.fn() },
}))

jest.mock('@/lib/sounds', () => ({ sounds: { play: jest.fn() } }))

jest.mock('@/lib/auth-headers', () => ({ getAuthHeaders: jest.fn(() => ({})) }))

jest.mock('@/lib/restore-game-engine-client', () => ({
  restoreGameEngineClient: jest.fn(),
}))

jest.mock('@/lib/celebrations', () => ({
  detectPatternOnRoll: jest.fn(() => null),
  detectCelebration: jest.fn(() => null),
}))

jest.mock('@/lib/yahtzee-notifications', () => ({
  showYahtzeeCategoryToast: jest.fn(),
}))

jest.mock('@/lib/analytics', () => ({
  trackPlayerAction: jest.fn(),
  trackGameCompleted: jest.fn(),
  trackMoveSubmitApplied: jest.fn(),
}))

import { restoreGameEngineClient } from '@/lib/restore-game-engine-client'
import { showToast } from '@/lib/i18n-toast'
import { showYahtzeeCategoryToast } from '@/lib/yahtzee-notifications'

const mockRestoreGameEngineClient = restoreGameEngineClient as jest.MockedFunction<typeof restoreGameEngineClient>

const makeGame = () => ({
  id: 'game-123',
  createdAt: new Date().toISOString(),
  players: [{ userId: 'player-1', name: 'Alice', score: 0, user: { bot: null } }],
})

const makeEngine = () => {
  const engine = new YahtzeeGame('game-123')
  engine.addPlayer({ id: 'player-1', name: 'Alice' })
  engine.startGame()
  return engine
}

const makeRestoreEngine = () => {
  const engine = new YahtzeeGame('game-123')
  engine.addPlayer({ id: 'player-1', name: 'Alice' })
  engine.startGame()
  jest.spyOn(engine, 'getRollsLeft').mockReturnValue(2)
  jest.spyOn(engine, 'getDice').mockReturnValue([1, 2, 3, 4, 5])
  jest.spyOn(engine, 'getHeld').mockReturnValue([false, false, false, false, false])
  jest.spyOn(engine, 'getCurrentPlayer').mockReturnValue({ id: 'player-1', name: 'Alice' })
  jest.spyOn(engine, 'getRound').mockReturnValue(1)
  jest.spyOn(engine, 'getScorecard').mockReturnValue({} as any)
  jest.spyOn(engine, 'isGameFinished').mockReturnValue(false)
  return engine
}

const SERVER_TS = 'server-ts-1234'
// IMPORTANT: data.game.state arrives as an already-parsed object here, NOT a
// JSON string - the whole response went through a single res.json() round
// trip. A previous version of this mock used JSON.stringify(...), which let
// a real bug slip through undetected: useGameActions blindly called
// JSON.parse(data.game.state), which throws on an object and silently fell
// back to a random id, breaking the deterministic dedup match against
// LobbyPageClient's broadcast handler (which gets the object/string check
// right). Keep this mock shaped like the real API response.
const makeOkRollResponse = () => ({
  ok: true,
  status: 200,
  json: async () => ({
    game: { state: { data: { lastRoll: { timestamp: SERVER_TS } } } },
    serverBroadcasted: true,
  }),
})

const makeProps = (overrides: Partial<Parameters<typeof useGameActions>[0]> = {}) => ({
  game: makeGame() as any,
  gameEngine: makeEngine() as any,
  setGameEngine: jest.fn(),
  isGuest: false,
  guestId: null,
  guestName: null,
  guestToken: null,
  userId: 'player-1',
  username: 'Alice',
  isMyTurn: true,
  code: 'ABCD12',
  setRollHistory: jest.fn(),
  setCelebrationEvent: jest.fn(),
  setTimerActive: jest.fn(),
  celebrate: jest.fn(),
  fireworks: jest.fn(),
  reconcileWithServerSnapshot: jest.fn().mockResolvedValue(undefined),
  ...overrides,
})

describe('useGameActions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  describe('handleRollDice', () => {
    it('200 response → setGameEngine called and roll history entry appended', async () => {
      const restoredEngine = makeRestoreEngine()
      mockRestoreGameEngineClient.mockResolvedValue(restoredEngine as any)
      ;(global.fetch as jest.Mock).mockResolvedValue(makeOkRollResponse())

      const setGameEngine = jest.fn()
      const setRollHistory = jest.fn()
      const props = makeProps({ setGameEngine, setRollHistory })

      const { result } = renderHook(() => useGameActions(props))
      await act(async () => { await result.current.handleRollDice() })

      expect(setGameEngine).toHaveBeenCalledWith(restoredEngine)
      expect(setRollHistory).toHaveBeenCalled()

      const updater = setRollHistory.mock.calls[0][0] as (prev: RollHistoryEntry[]) => RollHistoryEntry[]
      const newHistory = updater([])
      expect(newHistory).toHaveLength(1)
      expect(newHistory[0].rollNumber).toBe(1)
      expect(newHistory[0].dice).toEqual([1, 2, 3, 4, 5])
    })

    it('isMyTurn: false → fetch not called, returns null', async () => {
      const props = makeProps({ isMyTurn: false })
      const { result } = renderHook(() => useGameActions(props))

      let returnValue: any
      await act(async () => { returnValue = await result.current.handleRollDice() })

      expect(global.fetch).not.toHaveBeenCalled()
      expect(returnValue).toBeNull()
    })

    it('server 500 → reconcileWithServerSnapshot called, error toast shown', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error' }),
      })
      const reconcileWithServerSnapshot = jest.fn().mockResolvedValue(undefined)
      const props = makeProps({ reconcileWithServerSnapshot })

      const { result } = renderHook(() => useGameActions(props))
      await act(async () => { await result.current.handleRollDice() })

      expect(reconcileWithServerSnapshot).toHaveBeenCalled()
      expect(showToast.errorFrom).toHaveBeenCalled()
    })
  })

  describe('handleScore', () => {
    it('200 response → setGameEngine called and category toast shown', async () => {
      const restoredEngine = makeRestoreEngine()
      jest.spyOn(restoredEngine, 'getScorecard').mockReturnValue({ ones: 3 } as any)
      mockRestoreGameEngineClient.mockResolvedValue(restoredEngine as any)

      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          game: { state: {} },
          serverBroadcasted: true,
        }),
      })

      // Mock prototype so the optimistic engine created inside handleScore also returns true
      const makeMovespy = jest.spyOn(YahtzeeGame.prototype, 'makeMove').mockReturnValue(true)

      const setGameEngine = jest.fn()
      const gameEngine = makeEngine()
      jest.spyOn(gameEngine, 'getScorecard').mockReturnValue({} as any)
      jest.spyOn(gameEngine, 'getDice').mockReturnValue([1, 1, 1, 1, 1])
      jest.spyOn(gameEngine, 'getHeld').mockReturnValue([false, false, false, false, false])

      const props = makeProps({ setGameEngine, gameEngine: gameEngine as any })

      const { result } = renderHook(() => useGameActions(props))
      await act(async () => { await result.current.handleScore('ones') })

      makeMovespy.mockRestore()

      expect(setGameEngine).toHaveBeenCalledWith(restoredEngine)
      expect(showYahtzeeCategoryToast).toHaveBeenCalled()
    })

    it('category already filled → fetch not called, returns null', async () => {
      const gameEngine = makeEngine()
      jest.spyOn(gameEngine, 'getScorecard').mockReturnValue({ ones: 3 } as any)

      const props = makeProps({ gameEngine: gameEngine as any })
      const { result } = renderHook(() => useGameActions(props))

      let returnValue: any
      await act(async () => { returnValue = await result.current.handleScore('ones') })

      expect(global.fetch).not.toHaveBeenCalled()
      expect(returnValue).toBeNull()
    })
  })

  describe('roll history dedup', () => {
    it('same entry id appended twice → array stays length 1', async () => {
      const restoredEngine = makeRestoreEngine()
      mockRestoreGameEngineClient.mockResolvedValue(restoredEngine as any)
      ;(global.fetch as jest.Mock).mockResolvedValue(makeOkRollResponse())

      const setRollHistory = jest.fn()
      const props = makeProps({ setRollHistory })

      const { result } = renderHook(() => useGameActions(props))
      await act(async () => { await result.current.handleRollDice() })

      const updater = setRollHistory.mock.calls[0][0] as (prev: RollHistoryEntry[]) => RollHistoryEntry[]
      const firstInsert = updater([])
      const secondInsert = updater(firstInsert)

      expect(firstInsert).toHaveLength(1)
      expect(secondInsert).toBe(firstInsert) // dedup: returns same reference
    })

    it('id is deterministic (matches LobbyPageClient broadcast handler id), not random', async () => {
      // Regression test: data.game.state arrives as an object, not a JSON
      // string. If handleRollDice ever goes back to blindly JSON.parse-ing
      // it, that throws, the id silently falls back to a random
      // `${Date.now()}_${Math.random()}` value, and this same roll's entry
      // from the HTTP response and from the realtime broadcast (which
      // computes `${playerId}-${timestamp}` directly) stop matching - the
      // exact bug that caused a player's own first roll to render twice in
      // the Recent Activity panel every time they let a turn time out.
      const restoredEngine = makeRestoreEngine()
      mockRestoreGameEngineClient.mockResolvedValue(restoredEngine as any)
      ;(global.fetch as jest.Mock).mockResolvedValue(makeOkRollResponse())

      const setRollHistory = jest.fn()
      const props = makeProps({ setRollHistory, userId: 'player-1', guestId: null })

      const { result } = renderHook(() => useGameActions(props))
      await act(async () => { await result.current.handleRollDice() })

      const updater = setRollHistory.mock.calls[0][0] as (prev: RollHistoryEntry[]) => RollHistoryEntry[]
      const [entry] = updater([])

      // Must match the broadcast handler's `${lastRoll.playerId}-${lastRoll.timestamp}`
      // construction exactly - playerId here is userId for an authenticated player.
      expect(entry.id).toBe(`player-1-${SERVER_TS}`)
    })
  })
})
