import { sanitizeGameStateForSpectator } from '@/lib/spectator-state'

describe('spectator state sanitization', () => {
  it('removes guess_the_spy identity fields from nested game state', () => {
    const input = {
      data: {
        players: [
          { id: 'p1', isSpy: true, role: 'Spy' },
          { id: 'p2', isSpy: false, role: 'Tourist' },
        ],
        spyPlayerId: 'p1',
        spyIndex: 0,
      },
    }

    const sanitized = sanitizeGameStateForSpectator('guess_the_spy', input) as any

    expect(sanitized.data.spyPlayerId).toBeUndefined()
    expect(sanitized.data.spyIndex).toBeUndefined()
    expect(sanitized.data.players[0].isSpy).toBeUndefined()
    expect(sanitized.data.players[0].role).toBe('Spy')
  })

  it('strips the playerRoles map (the actual engine field, not just legacy isSpy/spyId keys)', () => {
    const input = {
      data: {
        spyPlayerId: 'p1',
        playerRoles: { p1: 'Spy', p2: 'Photographer', p3: 'Beach Cleaner' },
        location: 'Beach',
      },
    }

    const sanitized = sanitizeGameStateForSpectator('guess_the_spy', input) as any

    expect(sanitized.data.playerRoles).toBeUndefined()
    expect(sanitized.data.spyPlayerId).toBeUndefined()
    expect(sanitized.data.location).toBe('Beach')
  })

  it('reveals playerRoles when game status is finished', () => {
    const input = {
      data: {
        spyPlayerId: 'p1',
        playerRoles: { p1: 'Spy', p2: 'Photographer' },
      },
    }

    const sanitized = sanitizeGameStateForSpectator('guess_the_spy', input, 'finished') as any

    expect(sanitized.data.playerRoles).toEqual({ p1: 'Spy', p2: 'Photographer' })
  })

  it('reveals spy identity when game status is finished', () => {
    const input = {
      data: {
        players: [
          { id: 'p1', isSpy: true, role: 'Spy' },
          { id: 'p2', isSpy: false, role: 'Tourist' },
        ],
        spyPlayerId: 'p1',
        spyIndex: 0,
      },
    }

    const sanitized = sanitizeGameStateForSpectator('guess_the_spy', input, 'finished') as any

    expect(sanitized.data.spyPlayerId).toBe('p1')
    expect(sanitized.data.spyIndex).toBe(0)
    expect(sanitized.data.players[0].isSpy).toBe(true)
  })

  it('leaves non-spy, non-RPS games unchanged', () => {
    const input = { currentPlayerIndex: 0, data: { rollsLeft: 2 } }
    expect(sanitizeGameStateForSpectator('yahtzee', input)).toEqual(input)
  })

  it('hides a still-pending rock_paper_scissors choice from spectators (#652)', () => {
    const input = {
      status: 'playing',
      data: {
        playerChoices: { p1: 'rock', p2: null },
        playersReady: ['p1'],
      },
    }

    const sanitized = sanitizeGameStateForSpectator('rock_paper_scissors', input, 'playing') as any

    expect(sanitized.data.playerChoices.p1).toBeNull()
    expect(sanitized.data.playerChoices.p2).toBeNull()
    expect(sanitized.data.playersReady).toEqual(['p1'])
  })

  it('does not hide rock_paper_scissors choices once both are in (round resolved)', () => {
    const input = {
      status: 'playing',
      data: {
        playerChoices: { p1: 'rock', p2: 'scissors' },
        playersReady: [],
        rounds: [{ choices: { p1: 'rock', p2: 'scissors' }, winner: 'p1' }],
      },
    }

    const sanitized = sanitizeGameStateForSpectator('rock_paper_scissors', input, 'playing') as any

    expect(sanitized.data.playerChoices).toEqual({ p1: 'rock', p2: 'scissors' })
  })
})

describe('sanitizeGameStateForSpectator – Sketch & Guess word list (#1086)', () => {
  it('drops the host\'s word list even from a finished game, which is otherwise returned as is', () => {
    const state = { status: 'finished', data: { rounds: [], customWords: ['office plant'], customWordsOnly: true } }
    const out = JSON.stringify(sanitizeGameStateForSpectator('sketch_and_guess', state, 'finished'))
    expect(out).not.toContain('office plant')
    expect(out).not.toContain('customWordsOnly')
  })
})
