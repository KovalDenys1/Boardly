import fs from 'fs'
import path from 'path'
import { Move } from '@/lib/game-engine'
import { getCatalogGames } from '@/lib/game-catalog'
import { BOT_DIFFICULTIES, getBotDisplayName } from '@/lib/bot-profiles'
import { resolveBotTarget } from '@/lib/quick-play'
import { getGameMetadata } from '@/lib/game-registry'
import { HEARTBEAT_STALE_THRESHOLD_MS } from '@/lib/lobby-presence'
import {
  LudoGame,
  LudoGameData,
  LUDO_FINISH,
  LUDO_LAST_TRACK_STEP,
  LUDO_YARD,
  absoluteSquare,
  tokensForMode,
} from '@/lib/games/ludo-game'
import { LudoBot } from '@/lib/bots/ludo/ludo-bot'
import en from '@/locales/en'

/**
 * #1242, the #973 pattern: /games/ludo states Boardly's house rules, its modes,
 * clock and bots, and each claim is recomputed here from the engine, the bot,
 * the catalog and the routes, so a change there fails this file instead of
 * leaving the page describing a game that no longer exists.
 */

function strings(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (!node || typeof node !== 'object') return []
  return Object.values(node as Record<string, unknown>).flatMap(strings)
}

const ludo = en.games.ludo
const copy = [...strings(ludo.detail), ...strings(ludo.seo), ...strings(ludo.rules)]
const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

const P1 = 'p1' // red, start offset 0
const P2 = 'p2' // yellow, start offset 26
const P3 = 'p3'

const move = (playerId: string, type: string, data: Record<string, unknown> = {}): Move => ({
  playerId,
  type,
  data,
  timestamp: new Date(),
})

const dataOf = (game: LudoGame): LudoGameData => game.getState().data as LudoGameData

/** Feed the server die (crypto first, Math.random as its fallback) from a queue. */
function queueRolls(...values: number[]) {
  const queue = [...values]
  const next = () => {
    const value = queue.shift()
    if (value === undefined) throw new Error('ludo facts: ran out of queued rolls')
    return value
  }
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto
  if (cryptoApi?.getRandomValues) {
    jest
      .spyOn(cryptoApi as { getRandomValues: (a: Uint32Array) => Uint32Array }, 'getRandomValues')
      .mockImplementation((array: Uint32Array) => {
        array[0] = next() - 1
        return array
      })
  }
  jest.spyOn(Math, 'random').mockImplementation(() => (next() - 1) / 6 + 0.01)
}

function newGame(players = [P1, P2], mode?: 'quick' | 'classic'): LudoGame {
  const game = new LudoGame('ludo-facts', { maxPlayers: 4, minPlayers: 2, ...(mode ? { rules: { mode } } : {}) })
  for (const id of players) game.addPlayer({ id, name: id.toUpperCase() })
  expect(game.startGame()).toBe(true)
  return game
}

function place(game: LudoGame, tokens: Record<string, number[]>) {
  const state = game.getState()
  const data = state.data as LudoGameData
  for (const [playerId, positions] of Object.entries(tokens)) data.tokens[playerId] = [...positions]
  game.restoreState(state)
}

/** Yellow's relative position that sits on absolute track square `square`. */
const yellowOn = (square: number) => (square - 26 + 52) % 52

const current = (game: LudoGame) => game.getCurrentPlayer()?.id

afterEach(() => jest.restoreAllMocks())

describe('Ludo house rules against lib/games/ludo-game.ts (#1242)', () => {
  it('brings a token out only on a 6, onto its start square', () => {
    const game = newGame()
    expect(game.getMoveOptionsFor(P1, 5)).toEqual([])
    expect(game.getMoveOptionsFor(P1, 6).map((o) => o.to)).toEqual([0, 0])
    expect(ludo.rules.sixToLeave).toMatch(/Roll a 6 to bring a token out of the yard onto your start square/)
  })

  it('gives a 6 another roll even when it cannot be used, and three 6s end the turn', () => {
    const game = newGame()
    place(game, { [P1]: [54, LUDO_FINISH] })
    queueRolls(6, 6, 6)
    expect(game.makeMove(move(P1, 'roll'))).toBe(true)
    expect(current(game)).toBe(P1)
    expect(game.makeMove(move(P1, 'roll'))).toBe(true)
    expect(current(game)).toBe(P1)
    expect(game.makeMove(move(P1, 'roll'))).toBe(true)
    expect(current(game)).toBe(P2)
    expect(ludo.detail.rules.extraRollOnlyOnSix).toMatch(/A 6 you cannot use still earns the extra roll/)
    expect(ludo.rules.sixRollsAgain).toMatch(/Three 6s in a row lose the turn/)
  })

  it('gives no extra roll for a capture', () => {
    const game = newGame()
    place(game, { [P1]: [3, LUDO_YARD], [P2]: [yellowOn(5), LUDO_YARD] })
    queueRolls(2)
    game.makeMove(move(P1, 'roll'))
    expect(dataOf(game).tokens[P2][0]).toBe(LUDO_YARD)
    expect(current(game)).toBe(P2)
    expect(ludo.detail.rules.extraRollOnlyOnSix).toMatch(/a capture or a token reaching home earns none/)
  })

  it('has no blocks: a pair of rival tokens is captured together', () => {
    const game = newGame()
    place(game, { [P1]: [3, LUDO_YARD], [P2]: [yellowOn(5), yellowOn(5)] })
    const [option] = game.getMoveOptionsFor(P1, 2)
    expect(option.captures).toHaveLength(2)
    expect(ludo.detail.rules.noBlocks).toMatch(/landing on a pair of rival tokens sends both back unless the square is safe/)
  })

  it('captures nobody on a start or star square', () => {
    const game = newGame()
    place(game, { [P1]: [6, LUDO_YARD], [P2]: [yellowOn(8), LUDO_YARD] })
    expect(game.getMoveOptionsFor(P1, 2)[0].captures).toEqual([])
    expect(ludo.rules.safeSquares).toMatch(/Start squares and star squares are safe/)
  })

  it('turns into the home column after 50 squares and needs the exact roll to finish', () => {
    expect(LUDO_LAST_TRACK_STEP).toBe(50)
    expect(absoluteSquare('red', 50)).not.toBeNull()
    expect(absoluteSquare('red', 51)).toBeNull()
    const game = newGame()
    place(game, { [P1]: [54, LUDO_FINISH] })
    expect(game.getMoveOptionsFor(P1, 3)).toEqual([])
    expect(game.getMoveOptionsFor(P1, 2).map((o) => o.to)).toEqual([LUDO_FINISH])
    expect(ludo.detail.rules.homeColumn).toMatch(/After 50 squares of track/)
  })

  it('plays the only possible move without asking', () => {
    const game = newGame()
    place(game, { [P1]: [10, LUDO_YARD] })
    queueRolls(3)
    game.makeMove(move(P1, 'roll'))
    expect(dataOf(game).tokens[P1][0]).toBe(13)
    expect(ludo.detail.step3Desc).toMatch(/If only one move is possible, it is played for you/)
  })

  it('ends the game the moment one player has every token home, and ranks the rest by progress', () => {
    const game = newGame([P1, P2, P3])
    place(game, { [P1]: [55, LUDO_FINISH], [P2]: [4, LUDO_YARD], [P3]: [30, 2] })
    queueRolls(1)
    game.makeMove(move(P1, 'roll'))
    expect(game.getState().status).toBe('finished')
    expect(dataOf(game).ranking).toEqual([P1, P3, P2])
    expect(ludo.detail.step4Desc).toMatch(/The game ends the moment someone does/)
  })

  it('seats two players in opposite corners and leaves one corner empty for three', () => {
    expect(dataOf(newGame()).seats.map((s) => s.color)).toEqual(['red', 'yellow'])
    expect(dataOf(newGame([P1, P2, P3])).seats.map((s) => s.color)).toEqual(['red', 'green', 'yellow'])
    expect(ludo.detail.faq.howManyPlayers.a).toMatch(/Two players start in opposite corners and three leave one corner empty/)
  })

  it('rolls on the server, ignoring any number a client sends', () => {
    const game = newGame()
    place(game, { [P1]: [10, LUDO_YARD] })
    queueRolls(2)
    game.makeMove(move(P1, 'roll', { value: 6 }))
    expect(dataOf(game).lastRoll?.value).toBe(2)
    expect(ludo.detail.faq.pickYourOwnRoll.a).toMatch(/ignores any number a browser sends/)
  })

  it('never claims captures send a token home', () => {
    const description = getCatalogGames().find((g) => g.id === 'ludo')!.seo!.description
    expect(description).not.toMatch(/send rivals home/)
    expect(description).toMatch(/back to the yard/)
    for (const text of copy) expect(text).not.toMatch(/every roll is listed/)
  })
})

describe('Ludo timeouts (#1242)', () => {
  it('prefers a token reaching home, then a capture, then the furthest token', () => {
    const home = newGame()
    place(home, { [P1]: [10, 53] })
    queueRolls(3)
    home.makeMove(move(P1, 'timeout'))
    expect(dataOf(home).tokens[P1]).toEqual([10, LUDO_FINISH])

    const capture = newGame()
    place(capture, { [P1]: [20, 3], [P2]: [yellowOn(5), LUDO_YARD] })
    queueRolls(2)
    capture.makeMove(move(P1, 'timeout'))
    expect(dataOf(capture).tokens[P1]).toEqual([20, 5])
    expect(ludo.detail.faq.timerRunsOut.a).toMatch(/a token that reaches home, else one that captures, else the one furthest along/)
  })

  it('grants no extra roll for a 6 rolled on timeout', () => {
    const game = newGame()
    place(game, { [P1]: [10, 20] })
    queueRolls(6)
    game.makeMove(move(P1, 'timeout'))
    expect(dataOf(game).tokens[P1]).toEqual([10, 26])
    expect(current(game)).toBe(P2)
    expect(ludo.detail.faq.timerRunsOut.a).toMatch(/A 6 rolled this way earns no extra roll/)
  })

  it('is sent by the player\'s own open page, so the page says "while your game is open"', () => {
    const page = source('app/lobby/[code]/ludo-page.tsx')
    expect(page).toMatch(/\{ playerId: userId, type: 'timeout', data: \{\}, timestamp: new Date\(\) \}/)
    expect(ludo.rules.timer).toMatch(/If it runs out while your game is open/)
  })

  it('removes a silent player after 30 seconds, on a lobby read', () => {
    expect(HEARTBEAT_STALE_THRESHOLD_MS).toBe(30_000)
    expect(source('app/api/lobby/[code]/route.ts')).toMatch(/sweepStalePlayers/)
    expect(ludo.detail.multiplayer.turnTimer.desc).toMatch(/removes anyone silent for 30 seconds/)
  })
})

describe('Ludo modes, clock and seats against the catalog and routes (#1242)', () => {
  const config = getCatalogGames().find((g) => g.id === 'ludo')!.lobbyCreateConfig!

  it('plays quick with two tokens and classic with four, quick by default', () => {
    expect(tokensForMode('quick')).toBe(2)
    expect(tokensForMode('classic')).toBe(4)
    expect(config.gameModes).toEqual({ options: ['quick', 'classic'], default: 'quick' })
    // Quick Play and Play vs Bot pass no rules for Ludo, so the engine default applies.
    expect(source('app/api/quick-play/route.ts')).toMatch(/\(gameType as string\) === 'yahtzee' \? \{ rules: \{ mode: 'short' \} \} : undefined/)
    expect(dataOf(newGame()).mode).toBe('quick')
    expect(ludo.detail.modes.quickOrClassic.desc).toMatch(/rooms opened by Quick Play or Play vs Bot use quick/)
  })

  it('keeps the mode through Play again and offers no way to change it later', () => {
    expect(source('app/api/game/create/route.ts')).toMatch(/ludo: \['quick', 'classic'\]/)
    expect(source('app/lobby/[code]/components/LobbySettingsPanel.tsx')).toMatch(
      /type EditableSettingKey = 'maxPlayers' \| 'turnTimer' \| 'allowSpectators' \| 'theme' \| 'gameType'/
    )
    expect(ludo.detail.faq.changeMode.a).toMatch(/The mode is set when the lobby is created, and Play again keeps it/)
  })

  it('quotes the create default, the host range and the Play vs Bot clock', () => {
    expect(config.turnTimer).toEqual({ options: [30, 60, 90, 120], default: 30 })
    expect(source('app/api/lobby/[code]/route.ts')).toMatch(/turnTimer: z\.number\(\)\.int\(\)\.min\(30\)\.max\(180\)\.optional\(\)/)
    expect(source('app/lobby/[code]/components/LobbySettingsPanel.tsx')).toMatch(/\[30, 60, 90, 120, 150, 180\]/)
    expect(source('app/api/quick-play/route.ts')).toMatch(/QUICK_PLAY_TURN_TIMER_SECONDS = 45\b/)
    expect(ludo.detail.modes.turnClock.desc).toMatch(
      /New lobbies default to 30 seconds, with 60, 90 or 120 on offer; before the start the host can pick 30 to 180\. Play vs Bot uses 45\./
    )
  })

  it('seats one bot for Play vs Bot and four seats in a Quick Play room', () => {
    const meta = getGameMetadata('ludo')
    expect(resolveBotTarget(meta.minPlayers, true) - 1).toBe(1)
    expect(new LudoGame('qp').getConfig().maxPlayers).toBe(4)
    expect(ludo.detail.multiplayer.botsAndSolo.desc).toMatch(/Play vs Bot opens a room with one bot already seated/)
    expect(ludo.detail.faq.howManyPlayers.a).toMatch(/Rooms opened by Quick Play have four seats/)
  })

  it('opens the in-game chat only once two people are seated', () => {
    expect(source('app/lobby/[code]/ludo-page.tsx')).toMatch(/const showChat = hasMultipleHumans \|\| isSpectator/)
    expect(ludo.detail.multiplayer.withFriends.desc).toMatch(/Once two people are seated, a chat opens/)
  })
})

describe('Ludo bots against lib/bots/ludo and lib/bot-profiles.ts (#1242)', () => {
  it('names each level the way the lobby does', () => {
    for (const difficulty of BOT_DIFFICULTIES) {
      expect(ludo.detail.modes.botLevels.desc).toContain(getBotDisplayName('ludo', difficulty))
    }
  })

  it('has the easy bot pick any legal token at random', () => {
    const game = newGame()
    const bot = new LudoBot(game, 'easy', P1)
    const options = game.getMoveOptionsFor(P1, 6)
    jest.spyOn(Math, 'random').mockReturnValue(0)
    expect(bot.chooseOption(P1, options).token).toBe(0)
    jest.spyOn(Math, 'random').mockReturnValue(0.99)
    expect(bot.chooseOption(P1, options).token).toBe(1)
    expect(ludo.detail.modes.botLevels.desc).toMatch(/Token Rookie picks any legal token at random/)
  })

  it('has the medium bot prefer a capture over leaving the yard, and leaving over heading home', () => {
    const game = newGame()
    place(game, { [P1]: [LUDO_YARD, 3], [P2]: [yellowOn(9), LUDO_YARD] })
    const medium = new LudoBot(game, 'medium', P1)
    expect(medium.chooseOption(P1, game.getMoveOptionsFor(P1, 6)).token).toBe(1)

    const second = newGame()
    place(second, { [P1]: [LUDO_YARD, 48] })
    expect(new LudoBot(second, 'medium', P1).chooseOption(P1, second.getMoveOptionsFor(P1, 6)).token).toBe(0)
    expect(ludo.detail.modes.botLevels.desc).toMatch(/Token Tactician prefers a capture, then leaving the yard, then heading home/)
  })

  it('has the hard bot count rivals one to six squares behind its landing square', () => {
    expect(source('lib/bots/ludo/ludo-bot.ts')).toMatch(/if \(distance < 1 \|\| distance > 6\) return false/)
    expect(ludo.detail.modes.botLevels.desc).toMatch(/Ludo Grandmaster scores every move, counting rivals up to six squares behind where it lands/)
  })
})
