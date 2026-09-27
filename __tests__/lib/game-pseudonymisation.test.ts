// @ts-nocheck - prisma is a lightweight mock and the states are hand-built fixtures.
import { prisma } from '@/lib/db'
import {
  abandonedLobbiesWhere,
  collectPlayerNames,
  pseudonymiseGameState,
  pseudonymiseGames,
  pseudonymiseLobbies,
  pseudonymisableGamesWhere,
  seatLabel,
} from '@/lib/game-pseudonymisation'
import {
  LOBBY_CODE_LENGTH,
  RETIRED_LOBBY_CODE_PREFIX,
  generateLobbyCode,
  isRetiredLobbyCode,
} from '@/lib/lobby'
import { sanitizeStateForBroadcast } from '@/lib/broadcast-sanitize'
import { persistedGameStateSchema } from '@/lib/persisted-game-state'

jest.mock('@/lib/db', () => ({
  prisma: {
    games: { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    bots: { findMany: jest.fn() },
    gameStateSnapshots: { deleteMany: jest.fn() },
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
  },
}))

jest.mock('@/lib/feedback-discord', () => ({
  deleteFeedbackDiscordCopies: jest.fn(async () => ({ cleared: [], failed: [] })),
}))

const mockLogWarn = jest.fn()
jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({ info: jest.fn(), warn: (...args: unknown[]) => mockLogWarn(...args), error: jest.fn(), debug: jest.fn() }),
}))

const ANN = 'user-ann'
const BEN = 'guest-ben'
const BOT = 'bot-1'
const LEFT = 'guest-left'
const NO_BOTS = new Set<string>()

const base = (players, data, gameType) => ({
  id: 'g1',
  gameType,
  players,
  currentPlayerIndex: 0,
  status: 'finished',
  data,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:10:00.000Z',
})

const spyState = () =>
  base(
    [
      { id: ANN, name: 'Ann', score: 3 },
      { id: BEN, name: 'Ben', score: 1 },
      { id: BOT, name: 'Tempo Rookie', score: 0 },
    ],
    {
      phase: 'results',
      currentRound: 1,
      totalRounds: 1,
      location: 'Airport',
      locationCategory: 'travel',
      spyPlayerId: BEN,
      playerRoles: { [ANN]: 'Pilot', [BEN]: 'Spy', [BOT]: 'Guard' },
      votes: { [ANN]: BEN },
      questionHistory: [
        { askerId: ANN, askerName: 'Ann', targetId: BEN, targetName: 'Ben', question: 'Do you live in Oslo, Ben?', answer: 'Yes, Grünerløkka', timestamp: 1 },
        // Someone who left mid-game: no seat, no Players row, only the move log names them.
        { askerId: LEFT, askerName: 'Carl', targetId: ANN, targetName: 'Ann', question: 'Hi', answer: 'Hello', timestamp: 2 },
      ],
      scores: { [ANN]: 3, [BEN]: 1, [BOT]: 0 },
      allLocationNames: ['Airport', 'Bank'],
      phaseStartTime: 0,
      questionTimeLimit: 60,
      votingTimeLimit: 60,
      currentQuestionerId: null,
      currentTargetId: null,
      pendingQuestion: 'Where were you on Friday?',
      playersReady: [],
      winnerName: 'Ann',
    },
    'guess_the_spy'
  )

describe('pseudonymiseGameState (#1130)', () => {
  it('labels people by seat, keeps bots, ids and scores, and empties what they wrote', () => {
    const result = pseudonymiseGameState({
      gameType: 'guess_the_spy',
      state: spyState(),
      players: [{ userId: ANN, username: 'Ann' }, { userId: BOT, username: 'Tempo Rookie' }],
      botIds: new Set([BOT]),
    })
    const state = result.state

    expect(result.changed).toBe(true)
    expect(state.players).toEqual([
      { id: ANN, name: seatLabel(1), score: 3 },
      { id: BEN, name: seatLabel(2), score: 1 },
      { id: BOT, name: 'Tempo Rookie', score: 0 },
    ])
    const [first, second] = state.data.questionHistory
    expect(first).toMatchObject({ askerId: ANN, askerName: 'Player 1', targetId: BEN, targetName: 'Player 2', question: '', answer: '' })
    // The player who left gets the next label after the seats.
    expect(second).toMatchObject({ askerId: LEFT, askerName: 'Player 4', targetName: 'Player 1', question: '', answer: '' })
    expect(state.data.pendingQuestion).toBeNull()
    expect(state.data.winnerName).toBe('Player 1')
    // What statistics and the Control Panel read is untouched.
    expect(state.data.scores).toEqual({ [ANN]: 3, [BEN]: 1, [BOT]: 0 })
    expect(state.data.spyPlayerId).toBe(BEN)
    expect(state.data.location).toBe('Airport')

    const text = JSON.stringify(state)
    for (const personal of ['"Ann"', '"Ben"', '"Carl"', 'Oslo', 'Grünerløkka', 'Friday']) {
      expect(text).not.toContain(personal)
    }
    expect(result.labels.get(BOT)).toBeUndefined()
  })

  it('also catches the name an account has now when the game stored an older one', () => {
    const state = base([{ id: ANN, name: 'OldAnn' }, { id: BEN, name: 'Ben' }], { winnerName: 'NewAnn' }, 'tic_tac_toe')
    const result = pseudonymiseGameState({
      gameType: 'tic_tac_toe',
      state,
      players: [{ userId: ANN, username: 'NewAnn' }],
      botIds: NO_BOTS,
    })
    expect(result.state.players[0].name).toBe('Player 1')
    expect(result.state.data.winnerName).toBe('Player 1')
  })

  it('removes Sketch & Guess drawings, guesses and hint languages, and keeps words and scores', () => {
    const state = base(
      [{ id: ANN, name: 'Ann' }, { id: BEN, name: 'Ben' }],
      {
        phase: 'finished',
        rounds: [
          {
            round: 1,
            drawerId: ANN,
            prompt: 'cat',
            word: { en: 'cat', no: 'katt', ru: 'кот', uk: 'кіт' },
            wordChoices: [],
            wordAutoPicked: false,
            drawingStartedAt: 1,
            drawingContent: '{"strokes":[[1,2,3]]}',
            drawingSubmittedAt: 2,
            drawingAutoSubmitted: false,
            hintLocales: { [BEN]: 'no' },
            guesses: [{ id: 'r1-g1', playerId: BEN, guess: 'my name is Ben', submittedAt: 3, isCorrect: false }],
            revealAt: null,
            isScored: true,
            scoredAt: 4,
          },
        ],
        scores: { [ANN]: 40, [BEN]: 0 },
        ranking: [ANN, BEN],
        winnerId: ANN,
      },
      'sketch_and_guess'
    )
    const result = pseudonymiseGameState({ gameType: 'sketch_and_guess', state, players: [], botIds: NO_BOTS })
    const round = result.state.data.rounds[0]

    expect(round.drawingContent).toBeNull()
    expect(round.guesses[0]).toMatchObject({ id: 'r1-g1', playerId: BEN, guess: '', isCorrect: false })
    expect(round.hintLocales).toBeUndefined()
    expect(round.word.en).toBe('cat')
    expect(result.state.data.scores).toEqual({ [ANN]: 40, [BEN]: 0 })
  })

  it("empties Liar's Party claims, Fake Artist strokes and Telephone Doodle steps", () => {
    const people = [{ id: ANN, name: 'Ann' }, { id: BEN, name: 'Ben' }]
    const liars = pseudonymiseGameState({
      gameType: 'liars_party',
      state: base(people, {
        claim: { playerId: ANN, text: 'I was born in Bergen', isBluff: false, submittedAt: 1 },
        roundResults: [{ round: 1, claimantId: ANN, claimText: 'I have two cats', wasBluff: true, scores: {} }],
      }, 'liars_party'),
      players: [],
      botIds: NO_BOTS,
    }).state
    expect(liars.data.claim.text).toBe('')
    expect(liars.data.roundResults[0].claimText).toBe('')
    expect(liars.data.roundResults[0].wasBluff).toBe(true)

    const fake = pseudonymiseGameState({
      gameType: 'fake_artist',
      state: base(people, { strokes: [{ round: 1, playerId: ANN, content: '[[0,0]]', submittedAt: 1 }] }, 'fake_artist'),
      players: [],
      botIds: NO_BOTS,
    }).state
    expect(fake.data.strokes[0]).toMatchObject({ playerId: ANN, content: '' })

    const doodle = pseudonymiseGameState({
      gameType: 'telephone_doodle',
      state: base(people, {
        chains: [{ id: 'c1', ownerId: ANN, steps: [{ round: 1, phase: 'prompt', playerId: ANN, content: 'Ann rides a bike', submittedAt: 1 }] }],
      }, 'telephone_doodle'),
      players: [],
      botIds: NO_BOTS,
    }).state
    expect(doodle.data.chains[0].steps[0]).toMatchObject({ playerId: ANN, content: '' })
  })

  it('renames an Alias solo team after its label and leaves a shared "Team 1" alone', () => {
    const state = base(
      [{ id: ANN, name: 'Ann' }, { id: BEN, name: 'Ben' }, { id: 'u3', name: 'Cy' }],
      {
        teams: [
          { id: 'team-1', name: 'Ann', playerIds: [ANN], score: 3 },
          { id: 'team-2', name: 'Team 2', playerIds: [BEN, 'u3'], score: 1 },
        ],
      },
      'alias'
    )
    const teams = pseudonymiseGameState({ gameType: 'alias', state, players: [], botIds: NO_BOTS }).state.data.teams
    expect(teams[0]).toMatchObject({ name: 'Player 1', playerIds: [ANN], score: 3 })
    expect(teams[1].name).toBe('Team 2')
  })

  it('labels Yahtzee result rows and leaves the scorecards', () => {
    const state = base(
      [{ id: ANN, name: 'Ann', score: 200 }, { id: BEN, name: 'Ben', score: 150 }],
      {
        scorecards: { [ANN]: { ones: 3 }, [BEN]: { ones: 2 } },
        results: [
          { playerId: ANN, playerName: 'Ann', totalScore: 200, rank: 1 },
          { playerId: BEN, playerName: 'Ben', totalScore: 150, rank: 2 },
        ],
      },
      'yahtzee'
    )
    const data = pseudonymiseGameState({ gameType: 'yahtzee', state, players: [], botIds: NO_BOTS }).state.data
    expect(data.results.map((row) => row.playerName)).toEqual(['Player 1', 'Player 2'])
    expect(data.scorecards).toEqual({ [ANN]: { ones: 3 }, [BEN]: { ones: 2 } })
  })

  it('returns the stored value untouched when a game holds only bots', () => {
    const state = base([{ id: BOT, name: 'Tempo Rookie' }], {}, 'tic_tac_toe')
    const result = pseudonymiseGameState({ gameType: 'tic_tac_toe', state, players: [], botIds: new Set([BOT]) })
    expect(result.changed).toBe(false)
    expect(result.unparseable).toBe(false)
    expect(result.state).toBe(state)
  })

  it('says so when a state cannot be read, instead of calling it clean', () => {
    for (const state of ['{not json', '"just a string"', null, ['x']]) {
      const result = pseudonymiseGameState({ gameType: 'tic_tac_toe', state, players: [], botIds: NO_BOTS })
      expect(result).toMatchObject({ changed: false, unparseable: true })
      expect(result.state).toBe(state)
    }
  })

  it('reads a state stored as a JSON string', () => {
    const result = pseudonymiseGameState({
      gameType: 'tic_tac_toe',
      state: JSON.stringify(base([{ id: ANN, name: 'Ann' }], {}, 'tic_tac_toe')),
      players: [],
      botIds: NO_BOTS,
    })
    expect(result.changed).toBe(true)
    expect(result.state.players[0].name).toBe('Player 1')
  })

  it('does not change the object it was given', () => {
    const state = spyState()
    pseudonymiseGameState({ gameType: 'guess_the_spy', state, players: [], botIds: NO_BOTS })
    expect(state.players[0].name).toBe('Ann')
    expect(state.data.questionHistory[0].question).toBe('Do you live in Oslo, Ben?')
  })

  // The results route, the lobby poll and the Control Panel read old games back, and all
  // of them pass through the persisted-state schema or a per-game sanitizer.
  it('leaves a state every reader can still parse and sanitize', () => {
    const fixtures = {
      guess_the_spy: spyState(),
      sketch_and_guess: base([{ id: ANN, name: 'Ann' }], { rounds: [{ round: 1, drawerId: ANN, drawingContent: 'x', guesses: [] }], scores: {} }, 'sketch_and_guess'),
      liars_party: base([{ id: ANN, name: 'Ann' }], { claim: { playerId: ANN, text: 'x' }, roundResults: [] }, 'liars_party'),
      fake_artist: base([{ id: ANN, name: 'Ann' }], { strokes: [{ playerId: ANN, content: 'x' }], votes: [], roundResults: [] }, 'fake_artist'),
      telephone_doodle: base([{ id: ANN, name: 'Ann' }], { chains: [] }, 'telephone_doodle'),
      alias: base([{ id: ANN, name: 'Ann' }], { teams: [], phase: 'game_over' }, 'alias'),
      yahtzee: base([{ id: ANN, name: 'Ann' }], {}, 'yahtzee'),
    }
    for (const [gameType, state] of Object.entries(fixtures)) {
      const result = pseudonymiseGameState({ gameType, state, players: [], botIds: NO_BOTS })
      expect(() => persistedGameStateSchema.parse(result.state)).not.toThrow()
      expect(() => sanitizeStateForBroadcast(gameType, result.state, ANN)).not.toThrow()
    }
  })
})

describe('collectPlayerNames', () => {
  it('pairs names with player ids and never mistakes a team for a player', () => {
    const names = collectPlayerNames(
      { players: [{ id: ANN, name: 'Ann' }], teams: [{ id: 'team-1', name: 'Team 1' }], log: [{ askerId: LEFT, askerName: 'Carl' }] },
      new Set([ANN])
    )
    expect([...names.keys()].sort()).toEqual([ANN, LEFT].sort())
    expect(names.get('team-1')).toBeUndefined()
  })
})

describe('pseudonymiseGames', () => {
  const NOW = new Date('2027-03-01T03:00:00.000Z')
  const CUTOFF = new Date('2026-03-01T03:00:00.000Z')
  const updatedAt = new Date('2026-02-10T12:00:00.000Z')
  const row = (id, state) => ({
    id,
    gameType: 'guess_the_spy',
    state,
    updatedAt,
    players: [{ userId: ANN, user: { username: 'Ann' } }, { userId: BOT, user: { username: 'Tempo Rookie' } }],
  })

  beforeEach(() => {
    jest.clearAllMocks()
    prisma.bots.findMany.mockResolvedValue([{ userId: BOT }])
    prisma.games.updateMany.mockResolvedValue({ count: 1 })
    prisma.gameStateSnapshots.deleteMany.mockResolvedValue({ count: 2 })
  })

  it('only reaches finished, abandoned and cancelled games past the cutoff that are not done yet', () => {
    const where = pseudonymisableGamesWhere(CUTOFF)
    expect(where.status.in.sort()).toEqual(['abandoned', 'cancelled', 'finished'])
    expect(where.pseudonymisedAt).toBeNull()
    expect(where.OR).toEqual([{ endedAt: { lt: CUTOFF } }, { endedAt: null, updatedAt: { lt: CUTOFF } }])
  })

  it('writes the new state once, keeps the end time, marks the row and drops leftover replays', async () => {
    prisma.games.findMany.mockResolvedValueOnce([row('g1', spyState()), row('g2', spyState())]).mockResolvedValueOnce([])

    const result = await pseudonymiseGames({ cutoff: CUTOFF, now: NOW })

    expect(result).toEqual({ pseudonymised: 2, snapshotsDeleted: 2, skippedUnparseable: 0 })
    const [call] = prisma.games.updateMany.mock.calls
    expect(call[0].where).toEqual({ id: 'g1', updatedAt, pseudonymisedAt: null })
    expect(call[0].data.pseudonymisedAt).toBe(NOW)
    // @updatedAt would otherwise move to now, and stats read it as when the game ended.
    expect(call[0].data.updatedAt).toBe(updatedAt)
    expect(call[0].data.state.players[0].name).toBe('Player 1')
    expect(call[0].data.state.players[2].name).toBe('Tempo Rookie')
    expect(prisma.gameStateSnapshots.deleteMany).toHaveBeenCalledWith({ where: { gameId: { in: ['g1', 'g2'] } } })
    // The second page starts after the last id of the first.
    expect(prisma.games.findMany.mock.calls[1][0].where.AND[1]).toEqual({ id: { gt: 'g2' } })
  })

  it('skips a row that changed under it, and leaves its replays alone', async () => {
    prisma.games.findMany.mockResolvedValueOnce([row('g1', spyState())]).mockResolvedValueOnce([])
    prisma.games.updateMany.mockResolvedValueOnce({ count: 0 })

    const result = await pseudonymiseGames({ cutoff: CUTOFF, now: NOW })

    expect(result.pseudonymised).toBe(0)
    expect(prisma.gameStateSnapshots.deleteMany).not.toHaveBeenCalled()
  })

  it('skips and logs a game whose state cannot be read, and never marks it done', async () => {
    prisma.games.findMany
      .mockResolvedValueOnce([row('g-bad', '{not json'), row('g-array', ['x']), row('g1', spyState())])
      .mockResolvedValueOnce([])

    const result = await pseudonymiseGames({ cutoff: CUTOFF, now: NOW })

    expect(result).toMatchObject({ pseudonymised: 1, skippedUnparseable: 2 })
    expect(prisma.games.updateMany).toHaveBeenCalledTimes(1)
    expect(prisma.games.updateMany.mock.calls[0][0].where.id).toBe('g1')
    expect(prisma.gameStateSnapshots.deleteMany).toHaveBeenCalledWith({ where: { gameId: { in: ['g1'] } } })
    expect(mockLogWarn).toHaveBeenCalledWith(expect.any(String), { gameId: 'g-bad' })
    expect(mockLogWarn).toHaveBeenCalledWith(expect.any(String), { gameId: 'g-array' })
  })

  it('stops at the per-run cap', async () => {
    prisma.games.findMany.mockResolvedValue([row('g1', spyState())])

    await pseudonymiseGames({ cutoff: CUTOFF, now: NOW, batchSize: 1, maxGames: 3 })

    expect(prisma.games.findMany).toHaveBeenCalledTimes(3)
  })
})

describe('pseudonymiseLobbies', () => {
  it('renames and retires only inactive lobbies that held a real game, once every game is done', async () => {
    prisma.$executeRaw.mockResolvedValue(4)
    const cutoff = new Date('2026-03-01T00:00:00.000Z')
    const now = new Date('2027-03-01T00:00:00.000Z')

    await expect(pseudonymiseLobbies(cutoff, now)).resolves.toBe(4)

    const sql = prisma.$executeRaw.mock.calls[0][0]
    const text = sql.strings.join('?')
    // One UPDATE: every SET reads the old row, so the name is built from the old code.
    expect(text).toContain(`'Lobby ' || l.code`)
    expect(text).toContain(`'Quick Play ' || l.code`)
    expect(text).toContain('code = ?::text || l.id')
    expect(text).toContain('"kickedUserIds" = ARRAY[]::text[]')
    expect(text).toContain('l."isActive" = false')
    expect(text).toContain(`g.status <> 'cancelled'`)
    expect(text).toContain('g."pseudonymisedAt" IS NULL')
    expect(sql.values).toEqual([RETIRED_LOBBY_CODE_PREFIX, now, cutoff])
  })

  // The retired code frees the four-digit one: it must never be a code the generator hands
  // out, or a new lobby could collide with (or land on) a retired one.
  it('retires to a code the generator can never produce', () => {
    const retired = `${RETIRED_LOBBY_CODE_PREFIX}cmg1x2y3z0000abcdefghijk`
    expect(isRetiredLobbyCode(retired)).toBe(true)
    expect(retired).not.toHaveLength(LOBBY_CODE_LENGTH)
    for (let i = 0; i < 200; i += 1) {
      for (const code of [generateLobbyCode(), generateLobbyCode({ fallbackToAlphanumeric: true })]) {
        expect(code).toMatch(/^[0-9A-Z]{4}$/)
        expect(isRetiredLobbyCode(code)).toBe(false)
      }
    }
  })
})

describe('abandonedLobbiesWhere', () => {
  it('matches an inactive lobby past the cutoff whose games were all cancelled', () => {
    const cutoff = new Date('2026-03-01T00:00:00.000Z')
    expect(abandonedLobbiesWhere(cutoff)).toEqual({
      isActive: false,
      createdAt: { lt: cutoff },
      games: { every: { status: 'cancelled' } },
    })
  })
})
