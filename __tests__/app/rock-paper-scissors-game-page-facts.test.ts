import fs from 'fs'
import path from 'path'
import { getCatalogGames } from '@/lib/game-catalog'
import { BOT_DIFFICULTIES, getBotDisplayName } from '@/lib/bot-profiles'
import {
  RockPaperScissorsGame,
  sanitizeRpsStateForBroadcast,
  type RockPaperScissorsGameData,
  type RPSChoice,
} from '@/lib/games/rock-paper-scissors-game'
import { RockPaperScissorsBot } from '@/lib/bots/rock-paper-scissors/rock-paper-scissors-bot'
import en from '@/locales/en'

/**
 * #1238, the #973 pattern: /games/rock-paper-scissors states numbers and rules,
 * and each one is recomputed here from the engine, the bot, the bot profiles
 * and the routes that set the round clock, so a change there fails this file
 * instead of leaving the page describing a game that no longer exists.
 */

/** Every English string under a locale node, flattened. */
function strings(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (!node || typeof node !== 'object') return []
  return Object.values(node as Record<string, unknown>).flatMap(strings)
}

const rps = en.games.rock_paper_scissors
const copy = [...strings(rps.detail), ...strings(rps.seo)]
const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

function startedGame() {
  const engine = new RockPaperScissorsGame('rps-facts')
  engine.addPlayer({ id: 'a', name: 'A', score: 0, isActive: true })
  engine.addPlayer({ id: 'b', name: 'B', score: 0, isActive: true })
  engine.startGame()
  return engine
}

function pick(engine: RockPaperScissorsGame, playerId: string, choice: RPSChoice) {
  return engine.makeMove({ playerId, type: 'submit-choice', data: { choice }, timestamp: new Date() })
}

function round(engine: RockPaperScissorsGame, a: RPSChoice, b: RPSChoice) {
  expect(pick(engine, 'a', a)).toBe(true)
  expect(pick(engine, 'b', b)).toBe(true)
}

const data = (engine: RockPaperScissorsGame) => engine.getState().data as RockPaperScissorsGameData

describe('the RPS match format against the engine (#1238)', () => {
  it('is a best of three with no length setting, as the page says', () => {
    expect(data(startedGame()).mode).toBe('best-of-3')
    // Nothing outside the engine ever switches a game to best-of-5, and the
    // create form offers no length choice for this game.
    const config = getCatalogGames().find((game) => game.gameType === 'rock_paper_scissors')!.lobbyCreateConfig!
    expect(config).not.toHaveProperty('rounds')
    expect(rps.detail.modes.matchLength.desc).toMatch(/two round wins/)
    for (const text of copy) expect(text).not.toMatch(/best of five|best-of-5|best of 5/i)
  })

  it('replays draws without counting them, and ends at two round wins', () => {
    const engine = startedGame()
    round(engine, 'rock', 'rock')
    round(engine, 'paper', 'paper')
    expect(data(engine).scores).toEqual({ a: 0, b: 0 })
    round(engine, 'rock', 'scissors')
    expect(engine.getState().status).toBe('playing')
    round(engine, 'paper', 'rock')
    expect(engine.getState().status).toBe('finished')
    expect(data(engine).gameWinner).toBe('a')
    expect(data(engine).rounds).toHaveLength(4)
  })

  it('locks a pick in for the round', () => {
    const engine = startedGame()
    expect(pick(engine, 'a', 'rock')).toBe(true)
    expect(pick(engine, 'a', 'paper')).toBe(false)
    expect(rps.detail.step2Desc).toMatch(/One tap locks it in/)
  })

  it('hides a pending pick from everyone but its owner', () => {
    const engine = startedGame()
    pick(engine, 'a', 'scissors')
    const state = engine.getState()
    expect((sanitizeRpsStateForBroadcast(state, 'b').data as RockPaperScissorsGameData).playerChoices.a).toBeNull()
    expect((sanitizeRpsStateForBroadcast(state, 'a').data as RockPaperScissorsGameData).playerChoices.a).toBe('scissors')
    expect(rps.detail.rules.pickStaysHidden).toMatch(/only that you locked in/)
  })
})

describe('the RPS bots against lib/bots and lib/bot-profiles.ts (#1238)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('names each level the way the lobby does', () => {
    for (const difficulty of BOT_DIFFICULTIES) {
      expect(rps.detail.modes.botLevels.desc).toContain(getBotDisplayName('rock_paper_scissors', difficulty))
    }
  })

  it('reads only finished rounds, never the pick still waiting', async () => {
    const engine = startedGame()
    round(engine, 'rock', 'scissors') // a has thrown rock once
    pick(engine, 'a', 'scissors') // pending, not yet revealed
    const hard = new RockPaperScissorsBot(engine, 'hard', 'b')
    // Hard counters the most-played finished move (rock) even though the
    // pending scissors would beat that counter.
    expect((await hard.makeDecision()).choice).toBe('paper')
    expect(rps.detail.faq.botSeesPick.a).toMatch(/only finished rounds/)
  })

  it('has medium counter the read seven times in ten, as the page says', async () => {
    const engine = startedGame()
    round(engine, 'rock', 'scissors')
    const medium = new RockPaperScissorsBot(engine, 'medium', 'b')
    jest.spyOn(Math, 'random').mockReturnValue(0.69)
    expect((await medium.makeDecision()).choice).toBe('paper')
    jest.spyOn(Math, 'random').mockReturnValue(0.7)
    // Above the threshold it falls back to a random pick (index 2 of three).
    expect((await medium.makeDecision()).choice).toBe('scissors')
    expect(rps.detail.modes.botLevels.desc).toMatch(/about seven rounds in ten/)
  })
})

describe('the RPS round clock against the routes (#1238)', () => {
  it('quotes the lobby default, the host range and the Play vs Bot value', () => {
    expect(source('app/api/lobby/route.ts')).toMatch(/turnTimer: z\.number\(\)\.int\(\)\.min\(30\)\.max\(180\)\.default\(60\)/)
    expect(source('app/api/quick-play/route.ts')).toMatch(/QUICK_PLAY_TURN_TIMER_SECONDS = 45\b/)
    expect(source('app/lobby/[code]/components/LobbySettingsPanel.tsx')).toMatch(/\[30, 60, 90, 120, 150, 180\]/)
    expect(rps.detail.modes.roundClock.desc).toMatch(/60 seconds a round by default; the host can choose 30 to 180\. Play vs Bot uses 45\./)
  })

  it('submits a random pick at timeout rather than forfeiting the round', () => {
    expect(source('app/lobby/[code]/rock-paper-scissors-page.tsx')).toMatch(/submitChoice\(randomChoice, \{ isAutoAction: true \}\)/)
    expect(rps.detail.rules.timeoutRandomPick).toMatch(/a random move is locked in for you/)
  })
})
