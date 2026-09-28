import { readFileSync } from 'node:fs'
import path from 'node:path'

import { getCatalogGames } from '@/lib/game-catalog'
import { getGameMetadata } from '@/lib/game-registry'
import { SpyGame, SpyGamePhase, sanitizeSpyStateForBroadcast, type SpyGameData } from '@/lib/games/spy-game'
import { getFallbackSpyLocations } from '@/lib/spy-locations'
import en from '@/locales/en'

// lib/spy-locations imports the Prisma client for its database read; the
// fallback list this file checks never touches it.
jest.mock('@/lib/db', () => ({ prisma: {} }))

/**
 * #1243, the #973 pattern: /games/spy states numbers and rules, and each one is
 * recomputed here from the catalog, the registry, the engine and the routes, so
 * a change there fails this file instead of leaving the page describing a game
 * that no longer exists.
 */

const detail = en.games.spy.detail
const entry = getCatalogGames().find((game) => game.gameType === 'guess_the_spy')!
const config = entry.lobbyCreateConfig!
const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5']
const root = process.cwd()
const source = (file: string) => readFileSync(path.join(root, file), 'utf8')

/** '+300' → 300, '−10' (U+2212) → -10. */
function points(value: string): number {
  return Number(value.replace('−', '-').replace('+', ''))
}

function round(playerCount = 4) {
  const engine = new SpyGame('spy-facts')
  for (const id of PLAYERS.slice(0, playerCount)) engine.addPlayer({ id, name: id })
  expect(engine.startGame()).toBe(true)
  engine.initializeRound(getFallbackSpyLocations())
  return engine
}

const data = (engine: SpyGame) => engine.getState().data as SpyGameData
const move = (engine: SpyGame, playerId: string, type: string, payload: Record<string, unknown> = {}) =>
  engine.makeMove({ playerId, type, data: payload, timestamp: new Date() })

function allReady(engine: SpyGame) {
  for (const player of engine.getPlayers()) move(engine, player.id, 'player-ready')
  expect(data(engine).phase).toBe(SpyGamePhase.QUESTIONING)
}

/** One question and its answer, from whoever holds the turn to the next seat. */
function askAndAnswer(engine: SpyGame) {
  const asker = data(engine).currentQuestionerId!
  const ids = engine.getPlayers().map((p) => p.id)
  const target = ids[(ids.indexOf(asker) + 1) % ids.length]
  expect(move(engine, asker, 'ask-question', { targetId: target, question: 'Busy today?' })).toBe(true)
  expect(move(engine, target, 'answer-question', { answer: 'Always.' })).toBe(true)
}

/** Everyone votes; `pick` chooses each voter's target. */
function vote(engine: SpyGame, pick: (voter: string, spy: string, others: string[]) => string) {
  const spy = data(engine).spyPlayerId
  const ids = engine.getPlayers().map((p) => p.id)
  for (const voter of ids) {
    const others = ids.filter((id) => id !== voter)
    expect(move(engine, voter, 'vote', { targetId: pick(voter, spy, others) })).toBe(true)
  }
}

describe('the Guess the Spy table against the catalog and the registry (#1243)', () => {
  it('seats 3 to 10: 3 to 8 on the create form, 6 by default, 10 from the settings panel', () => {
    const meta = getGameMetadata('guess_the_spy')!
    expect([meta.minPlayers, meta.maxPlayers]).toEqual([3, 10])
    expect(config.allowedPlayers).toEqual([3, 4, 5, 6, 7, 8])
    expect(config.defaultMaxPlayers).toBe(6)
    expect(source('app/lobby/[code]/components/LobbySettingsPanel.tsx')).toContain('const maxByGameType = Math.min(10, gameMeta?.maxPlayers ?? 10)')
    // The settings route refuses every change once the game is playing.
    expect(source('app/api/lobby/[code]/route.ts')).toContain("'Lobby settings cannot be changed after game start'")
    expect(detail.modes.tableSize.desc).toBe('3 to 8 seats on the create form, 6 by default, up to 10 before the start.')
  })

  it('has no bots, as the page says', () => {
    expect(getGameMetadata('guess_the_spy')!.supportsBots).toBe(false)
    expect(detail.multiplayer.botsAndSolo.desc).toMatch(/^No solo mode or bots/)
  })

  it('plays three rounds on fixed clocks the lobby cannot change', () => {
    const initial = new SpyGame('clocks').getState().data as SpyGameData
    expect([initial.totalRounds, initial.questionTimeLimit, initial.votingTimeLimit]).toEqual([3, 300, 60])
    expect(config.turnTimer).toBeUndefined()
    expect(source('app/api/game/[gameId]/spy-init/route.ts')).not.toMatch(/turnTimer|questionTimeLimit|votingTimeLimit/)
    expect(detail.modes.fixedClocks.desc).toBe('Three rounds and a five-minute question clock; the 60-second vote countdown is a guide, and the vote closes once everyone has voted.')
  })

  it('draws from 24 locations in seven categories, each with a role for every non-spy seat', () => {
    const locations = getFallbackSpyLocations()
    expect(locations).toHaveLength(24)
    expect(new Set(locations.map((l) => l.category)).size).toBe(7)
    expect(Math.min(...locations.map((l) => l.roles.length))).toBeGreaterThanOrEqual(9)
    for (const name of ['Airport', 'Casino', 'Hospital', 'Museum']) expect(locations.map((l) => l.name)).toContain(name)
    expect(detail.faq.whichLocations.a).toMatch(/^Any of 24 places, from airport and casino to hospital and museum/)
  })
})

describe('the Guess the Spy rules against the engine (#1243)', () => {
  it('gives every non-spy the location and a role of their own, and the spy the whole list', () => {
    const engine = round(5)
    const spy = data(engine).spyPlayerId
    const roles = PLAYERS.filter((id) => id !== spy).map((id) => engine.getRoleInfoForPlayer(id))
    expect(new Set(roles.map((r) => r.locationRole)).size).toBe(4)
    expect(roles.every((r) => r.location === data(engine).location)).toBe(true)
    const spyView = engine.getRoleInfoForPlayer(spy)
    expect(spyView.location).toBeUndefined()
    expect(spyView.possibleLocations).toHaveLength(24)
    expect(spyView.possibleCategories).toHaveLength(7)
    expect(detail.rules.spyMayGuess).toMatch(/^While the questions run, the spy may guess among all 24 places/)
  })

  it('opens the vote by itself once the answers reach twice the number of players', () => {
    const engine = round(4)
    allReady(engine)
    for (let i = 0; i < 7; i++) askAndAnswer(engine)
    expect(data(engine).phase).toBe(SpyGamePhase.QUESTIONING)
    askAndAnswer(engine)
    expect(data(engine).phase).toBe(SpyGamePhase.VOTING)
    expect(detail.rules.whenVotingOpens).toMatch(/after twice as many answers as players/)
    expect(detail.strategy.countToTheDeadline.desc).toMatch(/With five players, guess before the tenth answer/)
  })

  it('checks the five-minute clock only when an answer or a skip comes in', () => {
    const engine = round(3)
    allReady(engine)
    data(engine).phaseStartTime = Date.now() - 301_000
    // Nothing moves the phase on while nobody acts.
    expect(engine.getPhaseInfo().timeRemaining).toBe(0)
    expect(data(engine).phase).toBe(SpyGamePhase.QUESTIONING)
    expect(move(engine, data(engine).currentQuestionerId!, 'skip-turn')).toBe(true)
    expect(data(engine).phase).toBe(SpyGamePhase.VOTING)
    expect(detail.rules.whenVotingOpens).toMatch(/at the first answer or skip after five minutes/)
  })

  it('lets only the host end the questions early', () => {
    expect(source('app/api/game/[gameId]/spy-action/route.ts')).toContain("action === 'start-voting' && game.lobby.creatorId !== userId")
    expect(detail.faq.whoStartsVote.a).toMatch(/^Only the host/)
  })

  it('takes the spy\'s guess only while the questions run, and ends the round either way', () => {
    const engine = round(4)
    allReady(engine)
    const spy = data(engine).spyPlayerId
    const wrong = data(engine).allLocationNames.find((name) => name !== data(engine).location)!
    expect(move(engine, spy, 'spy-guess-location', { location: wrong })).toBe(true)
    expect(data(engine).phase).toBe(SpyGamePhase.RESULTS)

    const late = round(4)
    allReady(late)
    expect(move(late, 'p1', 'start-voting')).toBe(true)
    expect(move(late, data(late).spyPlayerId, 'spy-guess-location', { location: data(late).location })).toBe(false)
  })

  it('keeps the vote open past its 60-second countdown until the last vote is in', () => {
    const engine = round(3)
    allReady(engine)
    move(engine, 'p1', 'start-voting')
    data(engine).phaseStartTime = Date.now() - 120_000
    expect(move(engine, 'p1', 'vote', { targetId: 'p2' })).toBe(true)
    expect(engine.getPhaseInfo().timeRemaining).toBe(0)
    expect(data(engine).phase).toBe(SpyGamePhase.VOTING)
  })

  it('lets only the host call the vote early, as step 4 now says', () => {
    expect(en.games.spy.detail.step4Desc).toMatch(/^The host can call a vote during the questions\./)
  })

  it('scores the vote only once every player has voted, and never lets anyone vote for themselves', () => {
    const engine = round(3)
    allReady(engine)
    move(engine, 'p1', 'start-voting')
    expect(move(engine, 'p1', 'vote', { targetId: 'p1' })).toBe(false)
    expect(move(engine, 'p1', 'vote', { targetId: 'p2' })).toBe(true)
    expect(move(engine, 'p2', 'vote', { targetId: 'p1' })).toBe(true)
    expect(data(engine).phase).toBe(SpyGamePhase.VOTING)
    expect(move(engine, 'p3', 'vote', { targetId: 'p1' })).toBe(true)
    expect(data(engine).phase).toBe(SpyGamePhase.RESULTS)
    expect(detail.rules.howTheVoteEnds).toMatch(/^Once every player in the game has voted, a single leader is voted out; a tie votes out nobody/)
  })

  it('names the overall winner by total points after three rounds, and a shared top as a draw', () => {
    const engine = round(3)
    for (let r = 1; r <= 3; r++) {
      if (r > 1) engine.initializeRound(getFallbackSpyLocations())
      allReady(engine)
      move(engine, 'p1', 'start-voting')
      vote(engine, (_voter, spy, others) => (others.includes(spy) ? spy : others[0]))
    }
    expect(engine.getState().status).toBe('finished')
    const scores = data(engine).scores
    const top = Math.max(...Object.values(scores))
    const leaders = Object.keys(scores).filter((id) => scores[id] === top)
    expect(engine.getState().winner).toBe(leaders.length === 1 ? leaders[0] : undefined)
    expect(detail.faq.howWinnerDecided.a).toBe('By total points after three rounds; scores carry over, and a shared top total is a draw.')
  })
})

describe('the Guess the Spy scorecard against the engine (#1243)', () => {
  const voteRows = detail.scoring.vote.rows
  const guessRows = detail.scoring.guess.rows

  it('pays each non-spy 100 when the spy is voted out, plus 50 per vote on the spy', () => {
    const engine = round(4)
    allReady(engine)
    move(engine, 'p1', 'start-voting')
    const spy = data(engine).spyPlayerId
    vote(engine, (_voter, s, others) => (others.includes(s) ? s : others[0]))
    const civilian = PLAYERS.slice(0, 4).find((id) => id !== spy)!
    expect(data(engine).scores[civilian]).toBe(points(voteRows.spyCaught.value) + points(voteRows.voteOnSpy.value))
    // The spy cannot vote for themselves, so their vote always costs 10.
    expect(data(engine).scores[spy]).toBe(points(voteRows.voteOnOther.value))
    expect(voteRows.voteOnOther.rule).toBe("To that voter; the spy's own vote always.")
  })

  it('pays the spy 300 when a tie leaves nobody revealed', () => {
    const engine = round(4)
    allReady(engine)
    move(engine, 'p1', 'start-voting')
    const spy = data(engine).spyPlayerId
    const [a, b] = PLAYERS.slice(0, 4).filter((id) => id !== spy)
    // Two votes each on two innocents: a tie at the top.
    vote(engine, (voter) => (voter === a || voter === spy ? b : a))
    expect(data(engine).scores[spy]).toBe(points(voteRows.spyEscapes.value) + points(voteRows.voteOnOther.value))
    expect(voteRows.spyEscapes.rule).toBe('To the spy, ties included.')
    expect(detail.mistakes.splittingTheVote.desc).toBe('A tied top votes out nobody and pays the spy 300.')
  })

  it('pays a right guess 500 to the spy and a wrong one 100 to everyone else, with no vote points', () => {
    const right = round(4)
    allReady(right)
    const spy = data(right).spyPlayerId
    expect(move(right, spy, 'spy-guess-location', { location: data(right).location })).toBe(true)
    expect(data(right).scores[spy]).toBe(points(guessRows.rightPlace.value))

    const wrong = round(4)
    allReady(wrong)
    const spy2 = data(wrong).spyPlayerId
    const miss = data(wrong).allLocationNames.find((name) => name !== data(wrong).location)!
    expect(move(wrong, spy2, 'spy-guess-location', { location: miss })).toBe(true)
    for (const id of PLAYERS.slice(0, 4)) {
      expect(data(wrong).scores[id]).toBe(id === spy2 ? 0 : points(guessRows.wrongPlace.value))
    }
  })
})

describe('the Guess the Spy secrets against the broadcast sanitizer (#1243)', () => {
  it('keeps the spy, the roles and the location out of the shared state until the results', () => {
    const engine = round(4)
    allReady(engine)
    const hidden = sanitizeSpyStateForBroadcast(engine.getState()).data as Partial<SpyGameData>
    expect(hidden.spyPlayerId).toBeUndefined()
    expect(hidden.playerRoles).toBeUndefined()
    expect(hidden.location).toBeUndefined()
    // #1262: the category narrowed 24 places to a handful.
    expect(hidden.locationCategory).toBeUndefined()

    move(engine, data(engine).spyPlayerId, 'spy-guess-location', { location: data(engine).location })
    const revealed = sanitizeSpyStateForBroadcast(engine.getState()).data as Partial<SpyGameData>
    expect(revealed.spyPlayerId).toBe(data(engine).spyPlayerId)
    expect(detail.faq.canOthersSeeSpy.a).toMatch(/^Not before the results/)
    expect(detail.multiplayer.secretsStayPrivate.desc).toMatch(/Only your browser gets your role/)
  })

  it('answers the role request only for a player in the game, and only with that player\'s own role', () => {
    const route = source('app/api/game/[gameId]/spy-role/route.ts')
    expect(route).toContain("{ error: 'Player not in this game' }")
    expect(route).toContain('spyGame.getRoleInfoForPlayer(userId)')
  })

  it('keeps spectators, replays and premium themes behind Premium, as the free answer says', () => {
    const lobby = source('app/api/lobby/route.ts')
    expect(lobby).toContain("'Premium required to enable spectators'")
    expect(lobby).toContain("'Premium required for custom lobby themes'")
    expect(source('app/api/game/[gameId]/replay/route.ts')).toContain("'Premium required to access replays'")
    expect(detail.faq.isItFree.a).toMatch(/Only letting spectators in \(the host\), replays \(the viewer\) and premium lobby themes need Premium/)
  })
})
