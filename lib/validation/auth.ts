import { z } from 'zod'

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Enter a valid email')
  .transform((value) => value.toLowerCase())

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, 'Password is required'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  email: emailSchema,
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/\d/, 'Password must contain at least one number'),
  // #1154: unticked by default, never assumed. Optional so a caller with no opinion
  // (an older client build, a script) still gets the lawful default rather than a
  // validation error.
  marketingConsent: z.boolean().optional().default(false),
  // #1135: an account rests on the contract the Terms set out (GDPR Art. 6(1)(b)), and
  // the person confirms being 13 or older. Both boxes must be ticked; the route stores
  // when. Literal true rather than a boolean, so a caller that omits them is refused
  // instead of creating an account nobody agreed to.
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to the Terms of Service and Privacy Policy' }),
  }),
  ageConfirmed: z.literal(true, {
    errorMap: () => ({ message: 'You must be 13 or older to create an account' }),
  }),
})

export type RegisterInput = z.infer<typeof registerSchema>

export function zodIssuesToFieldErrors(issues: Array<{ path: (string | number)[]; message: string }>) {
  const errors: Record<string, string> = {}
  for (const issue of issues) {
    const key = String(issue.path[0] ?? 'form')
    if (!errors[key]) errors[key] = issue.message
  }
  return errors
}
