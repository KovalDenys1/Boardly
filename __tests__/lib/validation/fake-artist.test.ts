import {
  FAKE_ARTIST_ANTI_CHEAT_CONSIDERATIONS,
  fakeArtistActionRequestSchema,
} from '@/lib/validation/fake-artist'

describe('fake-artist validation', () => {
  it('accepts submit-stroke payload', () => {
    const result = fakeArtistActionRequestSchema.safeParse({
      action: 'submit-stroke',
      data: {
        content: '{"strokes":[[0,0],[10,10]]}',
      },
    })

    expect(result.success).toBe(true)
  })

  it('accepts submit-vote payload', () => {
    const result = fakeArtistActionRequestSchema.safeParse({
      action: 'submit-vote',
      data: {
        suspectPlayerId: 'player-2',
      },
    })

    expect(result.success).toBe(true)
  })

  it('accepts advance-phase and advance-round payloads', () => {
    const phaseResult = fakeArtistActionRequestSchema.safeParse({
      action: 'advance-phase',
      data: {},
    })
    const roundResult = fakeArtistActionRequestSchema.safeParse({
      action: 'advance-round',
      data: {},
    })

    expect(phaseResult.success).toBe(true)
    expect(roundResult.success).toBe(true)
  })

  it('includes anti-cheat guidance for role secrecy and vote integrity', () => {
    expect(FAKE_ARTIST_ANTI_CHEAT_CONSIDERATIONS.length).toBeGreaterThanOrEqual(4)
    expect(
      FAKE_ARTIST_ANTI_CHEAT_CONSIDERATIONS.some((entry) => entry.toLowerCase().includes('prompt'))
    ).toBe(true)
    expect(
      FAKE_ARTIST_ANTI_CHEAT_CONSIDERATIONS.some((entry) => entry.toLowerCase().includes('vote'))
    ).toBe(true)
  })
})
