import { z } from 'zod'

export const TELEPHONE_DOODLE_CONTENT_MIN_LENGTH = 3
export const TELEPHONE_DOODLE_CONTENT_MAX_LENGTH = 500
export const TELEPHONE_DOODLE_MAX_STROKES = 250
export const TELEPHONE_DOODLE_MAX_POINTS_PER_STROKE = 300

const colorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Invalid stroke color')

const drawingPointSchema = z.object({
  x: z.number().finite().min(0).max(4096),
  y: z.number().finite().min(0).max(4096),
})

const drawingStrokeSchema = z.object({
  color: colorSchema,
  width: z.number().finite().min(1).max(64),
  points: z
    .array(drawingPointSchema)
    .min(2)
    .max(TELEPHONE_DOODLE_MAX_POINTS_PER_STROKE),
})

export const telephoneDoodleDrawingPayloadSchema = z
  .object({
    width: z.number().int().min(64).max(4096),
    height: z.number().int().min(64).max(4096),
    strokes: z.array(drawingStrokeSchema).min(1).max(TELEPHONE_DOODLE_MAX_STROKES),
  })
  .superRefine((drawing, ctx) => {
    for (let strokeIndex = 0; strokeIndex < drawing.strokes.length; strokeIndex += 1) {
      const stroke = drawing.strokes[strokeIndex]
      for (let pointIndex = 0; pointIndex < stroke.points.length; pointIndex += 1) {
        const point = stroke.points[pointIndex]
        if (point.x > drawing.width) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Point x exceeds drawing width',
            path: ['strokes', strokeIndex, 'points', pointIndex, 'x'],
          })
        }
        if (point.y > drawing.height) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Point y exceeds drawing height',
            path: ['strokes', strokeIndex, 'points', pointIndex, 'y'],
          })
        }
      }
    }
  })

export const telephoneDoodleSubmitStepRequestSchema = z
  .object({
    chainId: z.string().trim().min(1).max(80),
    content: z
      .string()
      .trim()
      .min(TELEPHONE_DOODLE_CONTENT_MIN_LENGTH)
      .max(TELEPHONE_DOODLE_CONTENT_MAX_LENGTH)
      .optional(),
    drawing: telephoneDoodleDrawingPayloadSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const hasText = typeof value.content === 'string'
    const hasDrawing = !!value.drawing
    if ((hasText && hasDrawing) || (!hasText && !hasDrawing)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either text content or drawing payload',
        path: ['content'],
      })
    }
  })

export const telephoneDoodleActionRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('submit-step'),
    data: telephoneDoodleSubmitStepRequestSchema,
  }),
  z.object({
    action: z.literal('advance-reveal'),
    data: z.object({}).optional(),
  }),
])

export type TelephoneDoodleDrawingPayload = z.infer<typeof telephoneDoodleDrawingPayloadSchema>
export type TelephoneDoodleSubmitStepRequest = z.infer<typeof telephoneDoodleSubmitStepRequestSchema>
export type TelephoneDoodleActionRequest = z.infer<typeof telephoneDoodleActionRequestSchema>
