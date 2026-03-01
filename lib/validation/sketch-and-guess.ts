import { z } from 'zod'

export const SKETCH_AND_GUESS_MIN_DRAWING_LENGTH = 3
export const SKETCH_AND_GUESS_MAX_DRAWING_LENGTH = 120_000
export const SKETCH_AND_GUESS_MIN_GUESS_LENGTH = 2
export const SKETCH_AND_GUESS_MAX_GUESS_LENGTH = 80

export const sketchAndGuessSubmitDrawingRequestSchema = z.object({
  content: z
    .string()
    .trim()
    .min(SKETCH_AND_GUESS_MIN_DRAWING_LENGTH)
    .max(SKETCH_AND_GUESS_MAX_DRAWING_LENGTH),
})

export const sketchAndGuessSubmitGuessRequestSchema = z.object({
  guess: z
    .string()
    .trim()
    .min(SKETCH_AND_GUESS_MIN_GUESS_LENGTH)
    .max(SKETCH_AND_GUESS_MAX_GUESS_LENGTH),
})

export const sketchAndGuessActionRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('submit-drawing'),
    data: sketchAndGuessSubmitDrawingRequestSchema,
  }),
  z.object({
    action: z.literal('submit-guess'),
    data: sketchAndGuessSubmitGuessRequestSchema,
  }),
  z.object({
    action: z.literal('advance-round'),
    data: z.object({}).optional(),
  }),
])

export type SketchAndGuessActionRequest = z.infer<typeof sketchAndGuessActionRequestSchema>
