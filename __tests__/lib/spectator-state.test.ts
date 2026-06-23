import { sanitizeGameStateForSpectator, sanitizePayloadForSpectator } from '@/lib/spectator-state'

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

  it('leaves non-spy games unchanged', () => {
    const input = { currentPlayerIndex: 0, data: { rollsLeft: 2 } }
    expect(sanitizeGameStateForSpectator('yahtzee', input)).toEqual(input)
  })

  it('sanitizes nested JSON string fields in payload-like objects', () => {
    const input = {
      gameType: 'guess_the_spy',
      initialState: JSON.stringify({
        data: {
          spyUserId: 'user_1',
          players: [{ id: 'user_1', isSpy: true }],
        },
      }),
    }

    const sanitized = sanitizePayloadForSpectator('guess_the_spy', input) as any

    expect(typeof sanitized.initialState).toBe('object')
    expect(sanitized.initialState.data.spyUserId).toBeUndefined()
    expect(sanitized.initialState.data.players[0].isSpy).toBeUndefined()
  })
})
