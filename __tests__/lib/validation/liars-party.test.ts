import {
  LIARS_PARTY_ANTI_COLLUSION_CONSIDERATIONS,
  liarsPartyActionRequestSchema,
} from '@/lib/validation/liars-party'

describe("liars-party validation", () => {
  it('accepts submit-claim action payload', () => {
    const result = liarsPartyActionRequestSchema.safeParse({
      action: 'submit-claim',
      data: {
        claim: 'I definitely rolled a perfect score.',
        isBluff: true,
      },
    })

    expect(result.success).toBe(true)
  })

  it('accepts submit-challenge action payload', () => {
    const result = liarsPartyActionRequestSchema.safeParse({
      action: 'submit-challenge',
      data: {
        decision: 'challenge',
      },
    })

    expect(result.success).toBe(true)
  })

  it('rejects invalid challenge decision', () => {
    const result = liarsPartyActionRequestSchema.safeParse({
      action: 'submit-challenge',
      data: {
        decision: 'skip',
      },
    })

    expect(result.success).toBe(false)
  })

  it('accepts advance-round action with empty data', () => {
    const result = liarsPartyActionRequestSchema.safeParse({
      action: 'advance-round',
      data: {},
    })

    expect(result.success).toBe(true)
  })

  it('includes anti-collusion guidance for backend checks', () => {
    expect(LIARS_PARTY_ANTI_COLLUSION_CONSIDERATIONS.length).toBeGreaterThanOrEqual(3)
    expect(
      LIARS_PARTY_ANTI_COLLUSION_CONSIDERATIONS.some((entry) => entry.toLowerCase().includes('reconnect'))
    ).toBe(true)
  })
})
