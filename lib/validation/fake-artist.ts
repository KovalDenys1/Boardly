import { z } from 'zod'

export const FAKE_ARTIST_MIN_STROKE_CONTENT_LENGTH = 3
export const FAKE_ARTIST_MAX_STROKE_CONTENT_LENGTH = 120_000

export const fakeArtistSubmitStrokeRequestSchema = z.object({
  content: z
    .string()
    .trim()
    .min(FAKE_ARTIST_MIN_STROKE_CONTENT_LENGTH)
    .max(FAKE_ARTIST_MAX_STROKE_CONTENT_LENGTH),
})

export const fakeArtistSubmitVoteRequestSchema = z.object({
  suspectPlayerId: z.string().trim().min(1).max(80),
})

export const fakeArtistActionRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('submit-stroke'),
    data: fakeArtistSubmitStrokeRequestSchema,
  }),
  z.object({
    action: z.literal('advance-phase'),
    data: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('submit-vote'),
    data: fakeArtistSubmitVoteRequestSchema,
  }),
  z.object({
    action: z.literal('advance-round'),
    data: z.object({}).optional(),
  }),
])

/**
 * Draft anti-cheat checklist for Fake Artist server-side controls.
 */
export const FAKE_ARTIST_ANTI_CHEAT_CONSIDERATIONS = [
  'Never expose full secret prompt to unauthorized participants or spectators.',
  'Allow exactly one stroke submission per deterministic turn index.',
  'Allow exactly one vote per player per round and reject self-votes.',
  'Persist authoritative role assignment and reject client role overrides.',
  'Rate-limit reconnect+submit bursts to reduce scripted spam attempts.',
] as const

export type FakeArtistActionRequest = z.infer<typeof fakeArtistActionRequestSchema>
