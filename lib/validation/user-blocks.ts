import { z } from 'zod'

export const blockedUserIdSchema = z.string().trim().min(1).max(128)
