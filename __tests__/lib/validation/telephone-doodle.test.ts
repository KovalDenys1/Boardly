import {
  telephoneDoodleActionRequestSchema,
  telephoneDoodleDrawingPayloadSchema,
} from '@/lib/validation/telephone-doodle'

describe('telephone-doodle validation', () => {
  it('accepts valid drawing payload within bounds', () => {
    const result = telephoneDoodleDrawingPayloadSchema.safeParse({
      width: 800,
      height: 600,
      strokes: [
        {
          color: '#ffffff',
          width: 4,
          points: [
            { x: 10, y: 10 },
            { x: 120, y: 220 },
          ],
        },
      ],
    })

    expect(result.success).toBe(true)
  })

  it('rejects drawing points outside canvas bounds', () => {
    const result = telephoneDoodleDrawingPayloadSchema.safeParse({
      width: 300,
      height: 200,
      strokes: [
        {
          color: '#123456',
          width: 5,
          points: [
            { x: 10, y: 10 },
            { x: 350, y: 220 },
          ],
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('accepts submit-step with text content', () => {
    const result = telephoneDoodleActionRequestSchema.safeParse({
      action: 'submit-step',
      data: {
        chainId: 'chain-player1',
        content: 'A valid prompt',
      },
    })

    expect(result.success).toBe(true)
  })

  it('accepts submit-step with drawing payload', () => {
    const result = telephoneDoodleActionRequestSchema.safeParse({
      action: 'submit-step',
      data: {
        chainId: 'chain-player1',
        drawing: {
          width: 640,
          height: 480,
          strokes: [
            {
              color: '#abcdef',
              width: 3,
              points: [
                { x: 1, y: 1 },
                { x: 20, y: 30 },
              ],
            },
          ],
        },
      },
    })

    expect(result.success).toBe(true)
  })

  it('rejects submit-step when text and drawing are both present', () => {
    const result = telephoneDoodleActionRequestSchema.safeParse({
      action: 'submit-step',
      data: {
        chainId: 'chain-player1',
        content: 'Should fail',
        drawing: {
          width: 100,
          height: 100,
          strokes: [
            {
              color: '#000000',
              width: 2,
              points: [
                { x: 1, y: 1 },
                { x: 2, y: 2 },
              ],
            },
          ],
        },
      },
    })

    expect(result.success).toBe(false)
  })
})
