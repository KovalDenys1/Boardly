import fs from 'fs'
import path from 'path'
import { getCatalogGames, getGameMetadata } from '@/lib/game-catalog'
import {
  SketchAndGuessGame,
  buildSketchWordHint,
  isSketchAndGuessDrawerMuted,
  isSketchAndGuessSolverMuted,
  type SketchAndGuessGameData,
} from '@/lib/games/sketch-and-guess-game'
import {
  SKETCH_GUESS_MIN_INTERVAL_MS,
  SKETCH_MAX_GUESSES_PER_ROUND,
  SKETCH_PHASE_SECONDS,
} from '@/lib/games/sketch-and-guess-phases'
import { SKETCH_WORDS, getSketchWord, matchSketchGuess } from '@/lib/games/sketch-and-guess-words'
import en from '@/locales/en'

/**
 * #1239, the #973 pattern: /games/sketch-and-guess states numbers and rules,
 * and each one is recomputed here from the engine, its phase clocks, the word
 * bank, the catalog and the routes, so a change there fails this file instead
 * of leaving the page describing a game that no longer exists.
 */

/** Every English string under a locale node, flattened. */
function strings(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (!node || typeof node !== 'object') return []
  return Object.values(node as Record<string, unknown>).flatMap(strings)
}

const sketch = en.games.guess_my_drawing
const detail = sketch.detail
const copy = [...strings(detail), ...strings(sketch.seo)]
const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')
const T0 = Date.UTC(2026, 8, 28, 12, 0, 0)
const at = (ms: number) => new Date(T0 + ms)

function startedGame(seats = 3) {
  const engine = new SketchAndGuessGame('sketch-facts')
  for (let i = 0; i < seats; i += 1) {
    engine.addPlayer({ id: `p${i + 1}`, name: `P${i + 1}`, score: 0, isActive: true })
  }
  expect(engine.startGame()).toBe(true)
  return engine
}

const data = (engine: SketchAndGuessGame) => engine.getState().data as SketchAndGuessGameData
const round = (engine: SketchAndGuessGame) => data(engine).rounds.find((r) => r.round === data(engine).currentRound)!

/** The drawer picks their first offered word at T0; returns its English form. */
function chooseWord(engine: SketchAndGuessGame) {
  const drawer = data(engine).currentDrawerId
  const word = round(engine).wordChoices[0]
  expect(engine.makeMove({ playerId: drawer, type: 'choose-word', data: { wordId: word.id }, timestamp: at(0) })).toBe(true)
  return word.en[0]
}

function guess(engine: SketchAndGuessGame, playerId: string, text: string, ms: number) {
  return engine.makeMove({ playerId, type: 'submit-guess', data: { guess: text }, timestamp: at(ms) })
}

describe('Sketch & Guess seats and bots against the catalog and registry (#1239)', () => {
  const entry = getCatalogGames().find((game) => game.gameType === 'sketch_and_guess')!

  it('seats three to ten, six by default, and has no bots', () => {
    expect(entry.lobbyCreateConfig!.allowedPlayers).toEqual([3, 4, 5, 6, 7, 8, 9, 10])
    expect(entry.lobbyCreateConfig!.defaultMaxPlayers).toBe(6)
    const meta = getGameMetadata('sketch_and_guess')!
    expect(meta.minPlayers).toBe(3)
    expect(meta.maxPlayers).toBe(10)
    expect(meta.supportsBots).toBe(false)
    expect(detail.modes.roomSize.title).toMatch(/Three to ten/)
    expect(detail.modes.roomSize.desc).toMatch(/create form start with six seats; Quick Play rooms open with all ten/)
    // Quick Play opens a room at the engine's own ceiling.
    expect(source('app/api/quick-play/route.ts')).toMatch(/const maxPlayers = engine\.getConfig\(\)\.maxPlayers/)
    expect(detail.faq.playAloneOrBot.a).toMatch(/^No\. It needs three people/)
  })

  it('offers no round or clock setting in the create form', () => {
    expect(entry.lobbyCreateConfig).not.toHaveProperty('rounds')
    expect(entry.lobbyCreateConfig).not.toHaveProperty('turnTimer')
  })
})

describe('Sketch & Guess rounds and drawers against the engine (#1239)', () => {
  it('plays three rounds with drawers in joining order, so only three seats draw', () => {
    const engine = startedGame(5)
    expect(data(engine).totalRounds).toBe(3)
    // Run every phase out on the clock until the game ends.
    engine.applyTimeoutFallback(undefined, Date.now() + 60 * 60 * 1000)
    expect(engine.getState().status).toBe('finished')
    expect(data(engine).rounds.map((r) => r.drawerId)).toEqual(['p1', 'p2', 'p3'])
    expect(detail.rules.drawOrder).toMatch(/first three players to join draw rounds one, two and three/)
    expect(detail.faq.everyoneDraws.a).toMatch(/only the first three to join draw/)
    for (const text of copy) expect(text).not.toMatch(/everybody draws|everyone draws/i)
  })

  it('never repeats a word within a game, and auto-picks one of the three on timeout', () => {
    const engine = startedGame(3)
    const offered = round(engine).wordChoices.map((w) => w.id)
    engine.applyTimeoutFallback(undefined, (data(engine).phaseStartedAt ?? Date.now()) + SKETCH_PHASE_SECONDS.choosing * 1000)
    expect(data(engine).phase).toBe('drawing')
    expect(round(engine).wordAutoPicked).toBe(true)
    expect(offered).toContain(round(engine).word!.id)
    engine.applyTimeoutFallback(undefined, Date.now() + 60 * 60 * 1000)
    const ids = data(engine).rounds.map((r) => r.word!.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(detail.rules.wordChoice).toMatch(/after 15 seconds\. A word that has been drawn is never offered again that game/)
  })

  it('quotes the phase clocks the engine enforces', () => {
    expect(SKETCH_PHASE_SECONDS).toEqual({ choosing: 15, drawing: 80, reveal: 8 })
    expect(detail.modes.phaseClocks.desc).toMatch(/^15 seconds to choose, 80 to draw, 8 to reveal\./)
    expect(detail.step2Desc).toMatch(/one of three words within 15 seconds.*up to 80 seconds/)
    // The lobby's turn timer is accepted and ignored (see applyTimeoutFallback).
    expect(source('lib/games/sketch-and-guess-game.ts')).toMatch(/applyTimeoutFallback\(_turnTimerSeconds\?: number/)
  })

  it('caps guesses at 40 a round, 0.8 s apart', () => {
    expect(SKETCH_MAX_GUESSES_PER_ROUND).toBe(40)
    expect(SKETCH_GUESS_MIN_INTERVAL_MS).toBe(800)
    expect(detail.step3Desc).toMatch(/up to 40 times/)
  })
})

describe('Sketch & Guess scoring against the engine (#1239)', () => {
  it('pays 50 plus up to 50 for speed, 20 to the first in, 40 to the drawer per guesser', () => {
    const engine = startedGame(3)
    const word = chooseWord(engine)
    expect(guess(engine, 'p2', word, 0)).toBe(true) // the whole clock left
    expect(guess(engine, 'p3', word, (SKETCH_PHASE_SECONDS.drawing * 1000) / 2)).toBe(true) // half of it
    const scores = data(engine).scores
    expect(scores.p2).toBe(50 + 50 + 20)
    expect(scores.p3).toBe(50 + 25)
    expect(scores.p1).toBe(2 * 40)
    // Live, before any reveal (#1082): the page says points land as each guess does.
    expect(data(engine).phase).toBe('reveal')
    expect(round(engine).isScored).toBe(false)
    expect(detail.step4Desc).toMatch(/points landed with each guess.*after round three the game ends/)
    const tsx = source('app/games/sketch-and-guess/SketchAndGuessDetailContent.tsx')
    expect(tsx).toMatch(/value: '50'/)
    expect(tsx).toMatch(/value: '\+20'/)
    expect(tsx).toMatch(/value: '\+40'/)
    expect(detail.scoring.guessing.speedBonus.value).toBe('up to +50')
    expect(detail.scoring.drawing.perCorrectGuesser.rule).toMatch(/Late answers pay as much as early ones/)
  })

  it('charges 20 for a blank canvas and never goes below zero', () => {
    const engine = startedGame(3)
    chooseWord(engine)
    const drawer = data(engine).currentDrawerId
    const blank = JSON.stringify({ type: 'drawing', version: 1, strokes: [] })
    expect(engine.makeMove({ playerId: drawer, type: 'submit-drawing', data: { content: blank }, timestamp: at(1000) })).toBe(true)
    expect(data(engine).scoreBreakdown[drawer].autoSubmissionPenalty).toBe(20)
    expect(data(engine).scores[drawer]).toBe(0)
    expect(source('app/games/sketch-and-guess/SketchAndGuessDetailContent.tsx')).toMatch(/value: '−20'/)
    expect(detail.scoring.drawing.note).toMatch(/No total drops below zero/)
    expect(detail.mistakes.leavingTheCanvasEmpty.desc).toMatch(/20 points/)
  })

  it('lets the host accept a miss, which pays a drawing host nothing', () => {
    const engine = startedGame(3)
    chooseWord(engine)
    const drawer = data(engine).currentDrawerId
    engine.authorizeHost(drawer)
    expect(guess(engine, 'p2', 'definitely not it', 0)).toBe(true)
    const miss = round(engine).guesses[0]
    expect(engine.makeMove({ playerId: drawer, type: 'accept-guess', data: { guessId: miss.id }, timestamp: at(500) })).toBe(true)
    expect(data(engine).scores.p2).toBe(50 + 50 + 20)
    expect(data(engine).scores[drawer]).toBe(0)
    expect(detail.faq.hostAcceptsGuess.a).toMatch(/host can accept another player's miss/)
    expect(detail.scoring.drawing.ownRuling.rule).toMatch(/pays them nothing/)
  })
})

describe('Sketch & Guess guessing against the word bank (#1239)', () => {
  const castle = getSketchWord('castle')!

  it('accepts any of the four languages, capitals and plurals; one typo is only close', () => {
    for (const word of SKETCH_WORDS) {
      for (const lang of ['en', 'no', 'ru', 'uk'] as const) expect(word[lang].length).toBeGreaterThan(0)
    }
    expect(matchSketchGuess('CASTLE', castle)).toBe('correct')
    expect(matchSketchGuess('castles', castle)).toBe('correct')
    expect(matchSketchGuess('замок', castle)).toBe('correct')
    expect(matchSketchGuess('slott', castle)).toBe('correct')
    expect(matchSketchGuess('castel', castle)).toBe('close')
    // Close is one edit from any accepted form, so a neighbouring word can be close too.
    expect(matchSketchGuess('house', getSketchWord('horse')!)).toBe('close')
    expect(detail.strategy.trustSoClose.desc).toMatch(/sometimes a neighbouring word/)
    // Only combining marks are stripped: é folds to e, ø stays its own letter.
    expect(matchSketchGuess('slött', castle)).toBe('correct')
    expect(detail.rules.matching).toMatch(/ø, æ and й are letters of their own/)
    expect(matchSketchGuess('oy', getSketchWord('island')!)).not.toBe('correct')
    expect(detail.faq.guessLanguages.a).toMatch(/^English, Norwegian, Russian and Ukrainian/)
    expect(detail.rules.matching).toMatch(/Plurals and synonyms often count/)
  })

  it('uncovers a letter at half time on words of three letters or more, none on two', () => {
    const halfway = T0 + (SKETCH_PHASE_SECONDS.drawing * 1000) / 2
    const shown = (w: typeof castle, lang: string, now: number) =>
      buildSketchWordHint(w, lang, T0, now, 1).cells.filter((c) => c !== null).length
    expect(shown(castle, 'en', T0)).toBe(0)
    expect(shown(castle, 'en', halfway)).toBe(1)
    const cat = getSketchWord('cat')!
    expect(shown(cat, 'en', halfway)).toBe(1)
    const island = getSketchWord('island')!
    expect(shown(island, 'no', T0 + SKETCH_PHASE_SECONDS.drawing * 1000)).toBe(0) // 'øy'
    expect(detail.rules.wordHint).toMatch(/words of three letters or more get a letter uncovered at half time/)
  })

  it('locks the chat of the drawer and of a solver until the reveal', () => {
    const engine = startedGame(3)
    const word = chooseWord(engine)
    const state = () => engine.getState()
    const drawer = data(engine).currentDrawerId
    expect(isSketchAndGuessDrawerMuted({ gameStatus: 'playing', state: state(), userId: drawer })).toBe(true)
    guess(engine, 'p2', word, 0)
    expect(isSketchAndGuessSolverMuted({ gameStatus: 'playing', state: state(), userId: 'p2' })).toBe(true)
    expect(isSketchAndGuessSolverMuted({ gameStatus: 'playing', state: state(), userId: 'p3' })).toBe(false)
    guess(engine, 'p3', word, 1000) // the last guesser: the round goes to the reveal
    expect(data(engine).phase).toBe('reveal')
    expect(isSketchAndGuessDrawerMuted({ gameStatus: 'playing', state: state(), userId: drawer })).toBe(false)
    expect(detail.rules.chatLock).toMatch(/Until the reveal, the drawer and anyone who has guessed the word cannot post in chat/)
  })
})

describe('Sketch & Guess product answers against the routes (#1239)', () => {
  it('names spectators as the Premium extra, and no seat perk: the game stops at ten', () => {
    expect(source('app/api/lobby/route.ts')).toMatch(/Premium required to enable spectators/)
    expect(getGameMetadata('sketch_and_guess')!.maxPlayers).toBe(10)
    for (const text of copy) expect(text).not.toMatch(/more (seats|players)|over ten|beyond ten/i)
    expect(detail.faq.isItFree.a).toMatch(/Premium only adds extras such as spectators/)
  })

  it('ends a game that drops below three players and has no drawer-leaves rule', () => {
    expect(source('lib/lobby-leave.ts')).toMatch(/if \(remainingPlayers < minPlayersRequired\)/)
    expect(getGameMetadata('sketch_and_guess')).not.toHaveProperty('abandonWhenRoleLeaves')
    expect(detail.faq.playerLeaves.a).toMatch(/Below three, the game ends/)
  })
})
