import { AliasGame } from '@/lib/games/alias'
import { sanitizeStateForBroadcast } from '@/lib/broadcast-sanitize'

type StateLike = { status?: string; data?: unknown }

describe('sanitizeStateForBroadcast dispatcher', () => {
  it('routes sketch_and_guess to the sketch sanitizer and strips the live prompt', () => {
    const state = {
      status: 'playing',
      data: {
        phase: 'drawing',
        currentRound: 1,
        rounds: [{ round: 1, drawerId: 'player1', prompt: 'castle' }],
      },
    }

    const forGuesser = sanitizeStateForBroadcast('sketch_and_guess', state, 'player2')
    expect((forGuesser.data as { rounds: Array<{ prompt: string }> }).rounds[0].prompt).toBe('')

    const forDrawer = sanitizeStateForBroadcast('sketch_and_guess', state, 'player1')
    expect((forDrawer.data as { rounds: Array<{ prompt: string }> }).rounds[0].prompt).toBe('castle')
  })

  it('passes state through unchanged for a game that declares no hidden state', () => {
    const state = { status: 'playing', data: { board: ['x', 'o'] } }
    expect(sanitizeStateForBroadcast('tic_tac_toe', state, null)).toBe(state)
  })

  it('passes state through unchanged for an unknown game type', () => {
    const state = { status: 'playing', data: { anything: true } }
    expect(sanitizeStateForBroadcast('not_a_real_game', state, null)).toBe(state)
  })
})

describe('memory sanitization (#715)', () => {
  const buildState = (): StateLike => ({
    status: 'playing',
    data: {
      cards: [
        { id: 'a', value: '🍎', isFlipped: true, isMatched: false },
        { id: 'b', value: '🍊', isFlipped: false, isMatched: true },
        { id: 'c', value: '🍋', isFlipped: false, isMatched: false },
        { id: 'd', value: '🍌', isFlipped: false, isMatched: false },
      ],
      moveHistory: [{ playerId: 'p1', card1Value: '🍇', card2Value: '🍓', isMatch: false }],
    },
  })

  const cardsOf = (state: StateLike) => (state.data as { cards: Array<{ id: string; value: string }> }).cards

  it('redacts the value of every face-down, unmatched card', () => {
    const result = sanitizeStateForBroadcast('memory', buildState(), null)
    const cards = cardsOf(result)

    expect(cards.find((c) => c.id === 'c')?.value).toBe('')
    expect(cards.find((c) => c.id === 'd')?.value).toBe('')
  })

  it('keeps values the table can already see (flipped or matched)', () => {
    const result = sanitizeStateForBroadcast('memory', buildState(), null)
    const cards = cardsOf(result)

    expect(cards.find((c) => c.id === 'a')?.value).toBe('🍎')
    expect(cards.find((c) => c.id === 'b')?.value).toBe('🍊')
  })

  it('redacts for the player whose turn it is too — there is no viewer exception', () => {
    const forActivePlayer = sanitizeStateForBroadcast('memory', buildState(), 'p1')
    expect(cardsOf(forActivePlayer).find((c) => c.id === 'c')?.value).toBe('')
  })

  it('does not mutate the source state', () => {
    const state = buildState()
    sanitizeStateForBroadcast('memory', state, null)
    expect(cardsOf(state).find((c) => c.id === 'c')?.value).toBe('🍋')
  })

  it('leaves already-public move history intact', () => {
    const result = sanitizeStateForBroadcast('memory', buildState(), null)
    const history = (result.data as { moveHistory: Array<{ card1Value: string }> }).moveHistory
    expect(history[0].card1Value).toBe('🍇')
  })
})

describe('alias sanitization (#716)', () => {
  const buildState = (phase = 'turn_active'): StateLike => ({
    status: 'playing',
    data: {
      phase,
      currentTeamIndex: 0,
      currentCardIndex: 0,
      currentCard: ['bridge', 'kettle', 'anchor'],
      currentCardResults: [{ word: 'ladder', result: 'guessed' }],
      teams: [
        { id: 'team-1', playerIds: ['describer', 'teammate'], describerIndex: 0 },
        { id: 'team-2', playerIds: ['opponent'], describerIndex: 0 },
      ],
    },
  })

  const cardOf = (state: StateLike) => (state.data as { currentCard: string[] | null }).currentCard

  it('hides the word card from a guesser on the describing team', () => {
    expect(cardOf(sanitizeStateForBroadcast('alias', buildState(), 'teammate'))).toBeNull()
  })

  it('hides the word card from the opposing team', () => {
    expect(cardOf(sanitizeStateForBroadcast('alias', buildState(), 'opponent'))).toBeNull()
  })

  it('hides the word card on a shared broadcast with no viewer', () => {
    expect(cardOf(sanitizeStateForBroadcast('alias', buildState(), null))).toBeNull()
  })

  it('still shows the word card to the describer', () => {
    expect(cardOf(sanitizeStateForBroadcast('alias', buildState(), 'describer'))).toEqual([
      'bridge',
      'kettle',
      'anchor',
    ])
  })

  it('leaves the card alone outside an active turn', () => {
    const state = buildState('turn_results')
    expect(cardOf(sanitizeStateForBroadcast('alias', state, 'opponent'))).toEqual(['bridge', 'kettle', 'anchor'])
  })

  // #1249: the deal pushes the card's indices into usedWordIndices before it
  // returns the words, so mid-turn the last ten entries ARE the card, and the
  // word list ships in the client bundle. Nobody but the engine may see them.
  it('never sends the dealt-word indices, to anyone, in any phase', () => {
    const game = new AliasGame('g-1249')
    for (const id of ['describer', 'teammate', 'opponent', 'opponent2']) {
      game.addPlayer({ id, name: id, score: 0, isActive: true })
    }
    game.startGame()
    game.makeMove({ type: 'start_round', playerId: 'describer', data: {}, timestamp: new Date() })
    const live = game.getState() as unknown as StateLike
    const liveData = live.data as { phase: string; usedWordIndices: number[]; currentCard: string[] }
    expect(liveData.phase).toBe('turn_active')
    expect(liveData.usedWordIndices).toHaveLength(10)

    const describerId = (liveData as unknown as { teams: Array<{ playerIds: string[]; describerIndex: number }>; currentTeamIndex: number })
    const team = describerId.teams[describerId.currentTeamIndex]
    const describer = team.playerIds[team.describerIndex]

    for (const viewer of ['describer', 'teammate', 'opponent', 'opponent2', null]) {
      const out = sanitizeStateForBroadcast('alias', live, viewer).data as { usedWordIndices: number[]; currentCard: string[] | null }
      expect(out.usedWordIndices).toEqual([])
      if (viewer !== describer) {
        expect(out.currentCard).toBeNull()
        const json = JSON.stringify(out)
        for (const word of liveData.currentCard) expect(json).not.toContain(`"${word}"`)
      }
    }
    // the engine's own copy is untouched, so the next deal still avoids repeats
    expect(liveData.usedWordIndices).toHaveLength(10)
  })

  it('keeps already-resolved words visible', () => {
    const result = sanitizeStateForBroadcast('alias', buildState(), 'opponent')
    const results = (result.data as { currentCardResults: Array<{ word: string }> }).currentCardResults
    expect(results[0].word).toBe('ladder')
  })
})

describe('fake_artist sanitization (#716)', () => {
  const buildState = (phase = 'drawing', status = 'playing'): StateLike => ({
    status,
    data: {
      phase,
      fakeArtistId: 'impostor',
      promptFingerprint: 'lighthouse',
      playerOrder: ['impostor', 'honest'],
      roundResults: [{ round: 1, fakeArtistId: 'honest' }],
    },
  })

  const fakeIdOf = (state: StateLike) => (state.data as { fakeArtistId: string }).fakeArtistId

  it('hides the impostor from an honest player', () => {
    const result = sanitizeStateForBroadcast('fake_artist', buildState(), 'honest')
    expect(fakeIdOf(result)).toBe('')
    expect((result.data as { promptFingerprint: string }).promptFingerprint).toBe('')
  })

  it('hides the impostor on a shared broadcast with no viewer', () => {
    expect(fakeIdOf(sanitizeStateForBroadcast('fake_artist', buildState(), null))).toBe('')
  })

  it('still tells the fake artist who they are', () => {
    expect(fakeIdOf(sanitizeStateForBroadcast('fake_artist', buildState(), 'impostor'))).toBe('impostor')
  })

  it('reveals the impostor to everyone at the reveal phase', () => {
    const state = buildState('reveal')
    expect(sanitizeStateForBroadcast('fake_artist', state, 'honest')).toBe(state)
  })

  it('reveals the impostor once the game is finished', () => {
    const state = buildState('voting', 'finished')
    expect(sanitizeStateForBroadcast('fake_artist', state, 'honest')).toBe(state)
  })

  it('keeps already-revealed past rounds intact', () => {
    const result = sanitizeStateForBroadcast('fake_artist', buildState(), 'honest')
    const rounds = (result.data as { roundResults: Array<{ fakeArtistId: string }> }).roundResults
    expect(rounds[0].fakeArtistId).toBe('honest')
  })
})

describe('liars_party sanitization (#1253)', () => {
  const buildState = (phase: 'claim' | 'challenge' | 'reveal' = 'challenge'): StateLike => ({
    status: 'playing',
    data: {
      phase,
      claim: { playerId: 'claimant', text: 'I have met a president', isBluff: true, submittedAt: 1 },
      challengeVotes: [
        { playerId: 'early', decision: 'challenge', submittedAt: 2 },
        { playerId: 'viewer', decision: 'believe', submittedAt: 3 },
      ],
      roundResults: [],
    },
  })
  type Out = { claim: Record<string, unknown> | null; challengeVotes: Array<Record<string, unknown>> }
  const dataOf = (state: StateLike) => state.data as Out

  it.each(['viewer', 'early', null])('hides whether the claim is a bluff from %s before the reveal', (viewer) => {
    const out = dataOf(sanitizeStateForBroadcast('liars_party', buildState(), viewer))
    expect(out.claim).not.toHaveProperty('isBluff')
    expect(out.claim?.text).toBe('I have met a president')
    expect(JSON.stringify(out)).not.toContain('isBluff')
  })

  it('keeps the flag for the claimant, who chose it', () => {
    expect(dataOf(sanitizeStateForBroadcast('liars_party', buildState(), 'claimant')).claim?.isBluff).toBe(true)
  })

  it("shows a voter only their own decision, but every vote's existence", () => {
    const out = dataOf(sanitizeStateForBroadcast('liars_party', buildState(), 'viewer'))
    expect(out.challengeVotes).toHaveLength(2)
    expect(out.challengeVotes.find((v) => v.playerId === 'viewer')?.decision).toBe('believe')
    expect(out.challengeVotes.find((v) => v.playerId === 'early')).not.toHaveProperty('decision')
  })

  it('hides every decision on a shared broadcast and from the claimant', () => {
    for (const viewer of [null, 'claimant']) {
      const out = dataOf(sanitizeStateForBroadcast('liars_party', buildState(), viewer))
      for (const vote of out.challengeVotes) expect(vote).not.toHaveProperty('decision')
    }
  })

  it('makes everything public at the reveal', () => {
    const state = buildState('reveal')
    expect(sanitizeStateForBroadcast('liars_party', state, null)).toBe(state)
  })
})
