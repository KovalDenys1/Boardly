import { z } from 'zod'

export const LIARS_PARTY_MIN_CLAIM_LENGTH = 5
export const LIARS_PARTY_MAX_CLAIM_LENGTH = 180

export const liarsPartyClaimRequestSchema = z.object({
  claim: z
    .string()
    .trim()
    .min(LIARS_PARTY_MIN_CLAIM_LENGTH)
    .max(LIARS_PARTY_MAX_CLAIM_LENGTH),
  isBluff: z.boolean(),
})

export const liarsPartyChallengeRequestSchema = z.object({
  decision: z.enum(['challenge', 'believe']),
})

export const liarsPartyActionRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('submit-claim'),
    data: liarsPartyClaimRequestSchema,
  }),
  z.object({
    action: z.literal('submit-challenge'),
    data: liarsPartyChallengeRequestSchema,
  }),
  z.object({
    action: z.literal('advance-round'),
    data: z.object({}).optional(),
  }),
])

/**
 * Draft checklist for server-side anti-collusion hardening.
 * The engine already enforces one action per player per phase and deterministic transitions.
 */
export const LIARS_PARTY_ANTI_COLLUSION_CONSIDERATIONS = [
  'Flag repeated challenge/believe alignment between the same player pairs across many rounds.',
  'Track claimant-voter score transfers to detect boosting rings over short windows.',
  'Store per-round action timestamps to spot scripted, near-simultaneous vote patterns.',
  'Rate-limit repeated reconnect + submit bursts from the same identity token.',
] as const

export type LiarsPartyActionRequest = z.infer<typeof liarsPartyActionRequestSchema>
