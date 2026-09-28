import fs from 'fs'
import path from 'path'
import { Move } from '@/lib/game-engine'
import { getCatalogGames } from '@/lib/game-catalog'
import { BOT_DIFFICULTIES, getBotDisplayName } from '@/lib/bot-profiles'
import {
  BOARD_SIZE,
  CheckersCell,
  CheckersGame,
  CheckersGameData,
  DRAW_PLY_LIMIT,
  Side,
  Square,
  createInitialBoard,
  generateTurns,
  getJumpsFrom,
  getLegalSteps,
  isDarkSquare,
} from '@/lib/games/checkers-game'
import { CHECKERS_HARD_TIME_BUDGET_MS } from '@/lib/bots/checkers/checkers-bot'
import en from '@/locales/en'

/**
 * #1241, the #973 pattern: /games/checkers states the exact variant, the clock
 * and the bots, and each claim is recomputed here from the engine, the bot, the
 * catalog and the routes, so a change there fails this file instead of leaving
 * the page describing a game that no longer exists.
 */

const ck = en.games.checkers
const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

const step = (playerId: string, from: Square, to: Square): Move => ({
  playerId,
  type: 'step',
  data: { from, to },
  timestamp: new Date(),
})

const dataOf = (g: CheckersGame) => g.getState().data as CheckersGameData

function startedGame() {
  const g = new CheckersGame('ck-facts')
  g.addPlayer({ id: 'dark', name: 'Dark' })
  g.addPlayer({ id: 'light', name: 'Light' })
  g.startGame()
  return g
}

function emptyBoard(): CheckersCell[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array<CheckersCell>(BOARD_SIZE).fill(0))
}

function boardWith(pieces: Array<[number, number, CheckersCell]>) {
  const board = emptyBoard()
  for (const [r, c, v] of pieces) board[r][c] = v
  return board
}

/** A started game with a custom position, Dark (side 1) to move. */
function gameWith(pieces: Array<[number, number, CheckersCell]>, extra: Partial<CheckersGameData> = {}) {
  const g = startedGame()
  const state = g.getState()
  g.restoreState({
    ...state,
    currentPlayerIndex: 0,
    data: { ...(state.data as CheckersGameData), board: boardWith(pieces), currentSide: 1 as Side, ...extra },
  })
  return g
}

describe('the checkers variant against the engine (#1241)', () => {
  it('sets up twelve men a side on the 32 dark squares of an 8×8 board, Dark first', () => {
    const board = createInitialBoard()
    expect(BOARD_SIZE).toBe(8)
    const dark = board.flatMap((row, r) => row.map((_, c) => isDarkSquare(r, c))).filter(Boolean)
    expect(dark).toHaveLength(32)
    expect(board.flat().filter((cell) => cell === 1)).toHaveLength(12)
    expect(board.flat().filter((cell) => cell === 2)).toHaveLength(12)
    expect(dataOf(startedGame()).currentSide).toBe(1)
    expect(ck.detail.rules.board).toMatch(/Twelve men a side on the 32 dark squares of an 8×8 board\. Dark moves first/)
  })

  it('lets a man capture forward only', () => {
    // A Dark man with a Light man diagonally behind it and the square beyond empty.
    const board = boardWith([[4, 3, 1], [5, 4, 2]])
    expect(getJumpsFrom(board, 4, 3)).toHaveLength(0)
    expect(ck.detail.rules.menMove).toMatch(/captures forward only/)
  })

  it('makes capturing compulsory but lets the player pick any capture, not only the longest', () => {
    // A single capture from (5,0) and a double from (7,4); a quiet man at (5,6) too.
    const pieces: Array<[number, number, CheckersCell]> = [
      [5, 0, 1], [4, 1, 2],
      [7, 4, 1], [6, 5, 2], [4, 5, 2],
      [2, 7, 1],
      [0, 7, 2],
    ]
    const turns = generateTurns(boardWith(pieces), 1)
    expect(turns.every((turn) => turn.captures > 0)).toBe(true)
    expect(turns.map((turn) => turn.captures).sort()).toEqual([1, 2])

    const g = gameWith(pieces)
    expect(g.validateMove(step('dark', [2, 7], [1, 6]))).toBe(false)
    expect(g.validateMove(step('dark', [5, 0], [3, 2]))).toBe(true)
    expect(ck.detail.rules.forcedCapture).toMatch(/compulsory, but you may pick any capture, not only the longest/)
  })

  it('keeps the same piece jumping until the chain is done, lifting captures at the end', () => {
    const g = gameWith([[7, 4, 1], [6, 5, 2], [4, 5, 2], [5, 0, 1], [0, 7, 2]])
    expect(g.makeMove(step('dark', [7, 4], [5, 6]))).toBe(true)
    expect(dataOf(g).chainFrom).toEqual([5, 6])
    expect(g.getState().currentPlayerIndex).toBe(0)
    // The jumped man is still on the board mid-chain, and no other piece may move.
    expect(dataOf(g).board[6][5]).toBe(2)
    expect(g.validateMove(step('dark', [5, 0], [4, 1]))).toBe(false)
    expect(g.makeMove(step('dark', [5, 6], [3, 4]))).toBe(true)
    expect(dataOf(g).board[6][5]).toBe(0)
    expect(dataOf(g).board[4][5]).toBe(0)
    expect(g.getState().currentPlayerIndex).toBe(1)
    expect(ck.detail.rules.multiJump).toMatch(/must keep jumping while it can; jumped pieces come off when the move ends/)
  })

  it('ends the move on crowning even when the new king could jump again', () => {
    // Dark jumps (1,2) onto (0,3); a king there could take (1,4) next.
    const g = gameWith([[2, 1, 1], [1, 2, 2], [1, 4, 2], [6, 1, 1]])
    expect(g.makeMove(step('dark', [2, 1], [0, 3]))).toBe(true)
    expect(dataOf(g).board[0][3]).toBe(3)
    expect(dataOf(g).chainFrom).toBeNull()
    expect(g.getState().currentPlayerIndex).toBe(1)
    expect(ck.detail.rules.crowning).toMatch(/becomes a king, which ends the move/)
    expect(ck.detail.strategy.crowningStopsTheChain.desc).toMatch(/crowned mid-capture stops there/)
  })

  it('moves a king one square in any direction, never along the whole diagonal', () => {
    const steps = getLegalSteps(boardWith([[4, 3, 3], [0, 7, 2]]), 1)
    expect(steps.map((s) => s.to).sort()).toEqual([[3, 2], [3, 4], [5, 2], [5, 4]])
    expect(ck.detail.rules.kings).toMatch(/one square diagonally in any direction; it does not fly/)
  })

  it('awards the game to the side whose opponent has no legal move', () => {
    // A Light man boxed in on (6,1): its squares ahead are Dark men with no square behind them.
    const g = gameWith([[6, 1, 2], [7, 0, 1], [7, 2, 1], [5, 0, 1], [5, 2, 1]])
    expect(g.makeMove(step('dark', [5, 2], [4, 3]))).toBe(true)
    expect(g.getState().status).toBe('finished')
    expect(dataOf(g).winner).toBe(1)
    expect(dataOf(g).endReason).toBe('no-moves')
    expect(ck.detail.rules.endAndDraw).toMatch(/You win when your opponent cannot move/)
  })

  it('draws after forty moves each with no capture and no man moving', () => {
    expect(DRAW_PLY_LIMIT).toBe(80)
    const g = gameWith([[4, 3, 3], [0, 1, 4]], { quietPlies: DRAW_PLY_LIMIT - 1 })
    expect(g.makeMove(step('dark', [4, 3], [5, 4]))).toBe(true)
    expect(dataOf(g).winner).toBe('draw')
    expect(dataOf(g).endReason).toBe('draw-rule')
    expect(ck.detail.rules.endAndDraw).toMatch(/Forty moves each with no capture and no man moving is a draw/)
    expect(ck.detail.faq.undoOrDraw.a).toMatch(/forty moves each/)
  })

  it('has no undo and no draw offer, as the FAQ says', () => {
    const g = startedGame()
    for (const type of ['undo', 'request-undo', 'request-draw', 'offer-draw', 'draw']) {
      expect(g.validateMove({ playerId: 'dark', type, data: {}, timestamp: new Date() })).toBe(false)
    }
    expect(ck.detail.faq.undoOrDraw.a).toMatch(/^No, every move stands/)
  })

  it('gives the game to the opponent when the clock runs out, and keeps the tally', () => {
    const g = startedGame()
    expect(g.makeMove({ playerId: 'dark', type: 'timeout-forfeit', data: {}, timestamp: new Date() })).toBe(true)
    expect(dataOf(g).winner).toBe(2)
    expect(g.getState().players[1].score).toBe(1)
    expect(ck.detail.faq.timerRunsOut.a).toMatch(/^You lose the game/)
  })

  it('restarts with Dark in the same seat, scores kept, on Play Again', () => {
    const g = startedGame()
    g.makeMove({ playerId: 'dark', type: 'timeout-forfeit', data: {}, timestamp: new Date() })
    expect(g.makeMove({ playerId: 'dark', type: 'next-round', data: {}, timestamp: new Date() })).toBe(true)
    expect(g.getState().status).toBe('playing')
    expect(g.getState().currentPlayerIndex).toBe(0)
    expect(dataOf(g).currentSide).toBe(1)
    expect(g.getState().players[1].score).toBe(1)
    expect(ck.detail.faq.whoMovesFirst.a).toMatch(/Play Again does not swap colours/)
    expect(ck.detail.modes.rematches.desc).toMatch(/Wins add up; draws add nothing/)
  })
})

describe('who does what outside the engine (#1241)', () => {
  it('lets only the host press Play Again', () => {
    expect(source('app/lobby/[code]/checkers-page.tsx')).toMatch(
      /if \(lobby\.creatorId !== userId\) \{ showToast\.info\('game\.ui\.waitingForHost'\); return \}/
    )
    expect(ck.detail.modes.rematches.desc).toMatch(/The host's Play Again/)
  })

  it('seats people before bots, so a human against a bot always plays Dark', () => {
    expect(source('app/api/game/create/route.ts')).toMatch(/return aIsBot - bIsBot \/\/ Non-bots first, bots last/)
    expect(ck.detail.faq.whoMovesFirst.a).toMatch(/Against a bot you always play Dark/)
    expect(ck.detail.multiplayer.botsAndSolo.desc).toMatch(/you play Dark/)
  })

  // The forfeit is posted by the timed-out player's own page; a closed tab ends in
  // abandonment with no winner. The page must not advertise that way out (#1246 class).
  it('says a timeout loses and never explains how to dodge it', () => {
    expect(ck.detail.faq.timerRunsOut.a).toMatch(/^You lose the game/)
    for (const text of [ck.detail.faq.timerRunsOut.a, ck.detail.multiplayer.turnTimer.desc]) {
      expect(text).not.toMatch(/close the tab|abandon|30 seconds/i)
    }
  })
})

describe('the checkers clock against the catalog and the routes (#1241)', () => {
  it('quotes the default, the waiting-room range and the Play vs Bot clock', () => {
    const config = getCatalogGames().find((game) => game.gameType === 'checkers')!.lobbyCreateConfig!
    expect(config.turnTimer!.default).toBe(60)
    expect(source('app/api/lobby/route.ts')).toMatch(/turnTimer: z\.number\(\)\.int\(\)\.min\(30\)\.max\(180\)\.default\(60\)/)
    expect(source('app/lobby/[code]/components/LobbySettingsPanel.tsx')).toMatch(/\[30, 60, 90, 120, 150, 180\]/)
    expect(source('app/api/quick-play/route.ts')).toMatch(/QUICK_PLAY_TURN_TIMER_SECONDS = 45\b/)
    expect(config.turnTimer!.options).toEqual([30, 60, 90, 120])
    expect(ck.detail.modes.moveClock.desc).toMatch(/60 seconds a move by default\. The host picks 30 to 120 when creating the lobby, or 30 to 180 in 30-second steps in the lobby settings before the start\. Play vs Bot gives 45/)
  })
})

describe('the checkers bots against lib/bots/checkers (#1241)', () => {
  const { desc } = ck.detail.modes.botLevels

  it('names each level the way the lobby does', () => {
    for (const difficulty of BOT_DIFFICULTIES) expect(desc).toContain(getBotDisplayName('checkers', difficulty))
  })

  it('describes what each level actually does', () => {
    const bot = source('lib/bots/checkers/checkers-bot.ts')
    expect(bot).toMatch(/if \(this\.config\.difficulty === 'easy'\) chosen = this\.pickRandom\(candidates\)/)
    // Medium scores every reply the opponent has, and marks a reply that leaves it without a move.
    expect(bot).toMatch(/const replies = generateTurns\(candidate\.board, opponent\)/)
    expect(bot).toMatch(/if \(lossInOne\) score -= WIN_SCORE \/ 2/)
    expect(CHECKERS_HARD_TIME_BUDGET_MS).toBeLessThanOrEqual(1000)
    expect(desc).toMatch(/Checkers Rookie moves at random/)
    expect(desc).toMatch(/avoids moves that let you win at once/)
    expect(desc).toMatch(/for up to about a second/)
  })
})

describe('the checkers FAQ (#1241)', () => {
  it('ships seven product questions from the catalog', () => {
    const seo = getCatalogGames().find((game) => game.gameType === 'checkers')!.seo!
    expect(seo.faq).toHaveLength(7)
  })

  it('offers no other rule set, as the FAQ says', () => {
    const config = getCatalogGames().find((game) => game.gameType === 'checkers')!.lobbyCreateConfig!
    expect(Object.keys(config).sort()).toEqual(['allowedPlayers', 'defaultMaxPlayers', 'gradient', 'turnTimer'])
    expect(ck.detail.faq.whichRules.a).toMatch(/Russian, Brazilian and international rules are not offered/)
  })
})
