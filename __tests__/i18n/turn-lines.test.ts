import { readFileSync } from 'fs'
import { join } from 'path'
import en from '@/locales/en'
import ru from '@/locales/ru'
import no from '@/locales/no'
import uk from '@/locales/uk'
import de from '@/locales/de'
import es from '@/locales/es'

/**
 * #1566: the status line tells only the viewer who can act what to do. Every
 * `turn*` string is an instruction (an imperative in es, no, ru and uk), so a
 * line about another player, or one a spectator reads, has its own key: what
 * that player is doing, or what the table is doing.
 */

const LOCALES = { en, ru, no, uk, de, es } as const

const PAGES = 'app/(site)/lobby/[code]'

/** The instruction, the key shown to everyone else instead, and the screen that draws both. */
const PAIRS: Array<[instruction: string, description: string, source: string]> = [
  ['games.tictactoe.game.turnPlace', 'games.tictactoe.game.doingPlace', `${PAGES}/tic-tac-toe-page.tsx`],
  ['games.connect_four.game.turnDrop', 'games.connect_four.game.doingDrop', `${PAGES}/connect-four-page.tsx`],
  ['games.checkers.game.turnMove', 'games.checkers.game.doingMove', `${PAGES}/checkers-page.tsx`],
  ['games.ludo.game.turnRoll', 'games.ludo.game.doingRoll', `${PAGES}/ludo-page.tsx`],
  ['games.ludo.game.turnMoveToken', 'games.ludo.game.doingMoveToken', `${PAGES}/ludo-page.tsx`],
  ['games.memory.game.turnFlipTwo', 'games.memory.game.doingFlip', `${PAGES}/components/MemoryGameBoard.tsx`],
  ['games.rock_paper_scissors.turnPick', 'games.rock_paper_scissors.doingPick', `${PAGES}/rock-paper-scissors-page.tsx`],
  ['games.rock_paper_scissors.turnPick', 'games.rock_paper_scissors.bothChoosing', `${PAGES}/rock-paper-scissors-page.tsx`],
  ['yahtzee.ui.turnRollFirst', 'yahtzee.ui.doingRoll', `${PAGES}/LobbyPageClient.tsx`],
  ['yahtzee.ui.turnPickBox', 'yahtzee.ui.doingPickBox', `${PAGES}/LobbyPageClient.tsx`],
  ['spy.turnCheckRole', 'spy.playersCheckingRoles', `${PAGES}/components/SpyGameBoard.tsx`],
  ['spy.turnAsk', 'spy.doingAsk', `${PAGES}/components/SpyGameBoard.tsx`],
  ['spy.turnAnswer', 'spy.doingAnswer', `${PAGES}/components/SpyGameBoard.tsx`],
  ['spy.turnVote', 'spy.playersVoting', `${PAGES}/components/SpyGameBoard.tsx`],
  ['alias.turnDescribe', 'alias.doingDescribe', `${PAGES}/alias-page.tsx`],
  ['liarsParty.turnClaim', 'liarsParty.doingClaim', `${PAGES}/liars-party-page.tsx`],
  ['liarsParty.turnJudge', 'liarsParty.tableVoting', `${PAGES}/liars-party-page.tsx`],
  ['liarsParty.turnJudge', 'liarsParty.tableVotingOnYourClaim', `${PAGES}/liars-party-page.tsx`],
  ['games.guess_my_drawing.game.turnChoose', 'games.guess_my_drawing.game.doingChoose', `${PAGES}/sketch-and-guess-page.tsx`],
  ['games.guess_my_drawing.game.turnDraw', 'games.guess_my_drawing.game.doingDraw', `${PAGES}/sketch-and-guess-page.tsx`],
]

function lookup(tree: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree)
}

describe.each(Object.entries(LOCALES))('%s turn lines (#1566)', (_locale, tree) => {
  const instructions = new Set(PAIRS.map(([instruction]) => lookup(tree, instruction)))

  it.each(PAIRS)('%s has a separate line for everyone else, %s', (instruction, description) => {
    const told = lookup(tree, instruction)
    const shown = lookup(tree, description)
    expect(typeof told).toBe('string')
    expect(typeof shown).toBe('string')
    expect((shown as string).trim()).not.toBe('')
    expect(instructions.has(shown)).toBe(false)
  })
})

describe('each screen draws the line for everyone else (#1566)', () => {
  it.each(PAIRS)('%s and %s are both used in %s', (instruction, description, source) => {
    const code = readFileSync(join(process.cwd(), source), 'utf8')
    expect(code).toContain(`'${instruction}'`)
    expect(code).toContain(`'${description}'`)
  })
})
