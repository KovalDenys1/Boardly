import { SpyGame, SpyGamePhase, type SpyGameData } from '@/lib/games/spy-game'
import { createFreshnessWatermark, decideFreshness } from '@/lib/game-state-freshness'

const IDS = ['user-1', 'user-2', 'user-3', 'user-4']
const LOCATIONS = [
  { name: 'Airport', category: 'Travel', roles: ['Pilot', 'Passenger', 'Guard', 'Mechanic'] },
  { name: 'Spa', category: 'Recreation', roles: ['Manager', 'Guest', 'Masseur', 'Cleaner'] },
]

function at(now: { value: number }) {
  return jest.spyOn(Date, 'now').mockImplementation(() => now.value)
}

function roundOneResults(now: { value: number }) {
  const game = new SpyGame('game-1')
  for (const id of IDS) game.addPlayer({ id, name: id })
  game.startGame()
  game.initializeRound(LOCATIONS)
  for (const id of IDS) {
    now.value += 1_000
    game.makeMove({ playerId: id, type: 'player-ready', data: {}, timestamp: new Date(now.value) })
  }
  now.value += 1_000
  game.makeMove({ playerId: 'user-1', type: 'start-voting', data: {}, timestamp: new Date(now.value) })
  for (const id of IDS) {
    now.value += 1_000
    const target = id === 'user-2' ? 'user-3' : 'user-2'
    game.makeMove({ playerId: id, type: 'vote', data: { targetId: target }, timestamp: new Date(now.value) })
  }
  return game
}

describe('Guess the Spy: the next round reaches every screen', () => {
  afterEach(() => jest.restoreAllMocks())

  it('stamps the dealt round, so a page showing the last results takes it', () => {
    const now = { value: 1_800_000_000_000 }
    at(now)
    const game = roundOneResults(now)
    expect((game.getState().data as SpyGameData).phase).toBe(SpyGamePhase.RESULTS)

    const watermark = createFreshnessWatermark()
    expect(decideFreshness(watermark, game.getState()).accept).toBe(true)

    now.value += 5_000
    game.initializeRound(LOCATIONS)
    const next = game.getState()
    const data = next.data as SpyGameData

    expect(data.phase).toBe(SpyGamePhase.ROLE_REVEAL)
    expect(data.currentRound).toBe(2)
    expect(next.lastMoveAt).toBe(now.value)
    expect(decideFreshness(watermark, next)).toEqual({ accept: true })
  })
})
