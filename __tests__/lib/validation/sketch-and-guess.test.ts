import { sketchAndGuessActionRequestSchema } from '@/lib/validation/sketch-and-guess'

describe('sketch-and-guess validation', () => {
  it('accepts submit-drawing action payload', () => {
    const result = sketchAndGuessActionRequestSchema.safeParse({
      action: 'submit-drawing',
      data: {
        content: '{"strokes":[[0,0],[10,10]]}',
      },
    })

    expect(result.success).toBe(true)
  })

  it('accepts submit-guess action payload', () => {
    const result = sketchAndGuessActionRequestSchema.safeParse({
      action: 'submit-guess',
      data: {
        guess: 'castle',
      },
    })

    expect(result.success).toBe(true)
  })

  it('rejects too-short guess', () => {
    const result = sketchAndGuessActionRequestSchema.safeParse({
      action: 'submit-guess',
      data: {
        guess: 'a',
      },
    })

    expect(result.success).toBe(false)
  })

  it('accepts advance-round action with empty data', () => {
    const result = sketchAndGuessActionRequestSchema.safeParse({
      action: 'advance-round',
      data: {},
    })

    expect(result.success).toBe(true)
  })

  it('accepts choose-word and accept-guess with their ids (#1082)', () => {
    expect(sketchAndGuessActionRequestSchema.safeParse({ action: 'choose-word', data: { wordId: 'castle' } }).success).toBe(true)
    expect(sketchAndGuessActionRequestSchema.safeParse({ action: 'accept-guess', data: { guessId: 'r1-g3' } }).success).toBe(true)
  })

  it('rejects choose-word and accept-guess without an id (#1082)', () => {
    expect(sketchAndGuessActionRequestSchema.safeParse({ action: 'choose-word', data: {} }).success).toBe(false)
    expect(sketchAndGuessActionRequestSchema.safeParse({ action: 'accept-guess', data: { guessId: '' } }).success).toBe(false)
  })
})
