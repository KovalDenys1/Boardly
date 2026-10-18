import { z } from 'zod'

export const MAX_BLOCKS_PER_ACCOUNT = 500

export const blockedUserIdSchema = z.string().trim().min(1).max(128)
