import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'

const log = apiLogger('/api/feedback')

const feedbackSchema = z.object({
  type: z.enum(['bug', 'feature', 'other', 'appeal']),
  message: z.string().trim().min(1).max(2000),
  email: z.string().email().optional().or(z.literal('')),
  pageUrl: z.string().max(500).optional(),
})

// 5 submissions per hour per IP
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many feedback submissions. Please try again later.',
})

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await submitLimiter(request)
    if (rateLimitResponse) return rateLimitResponse

    const requestUser = await getRequestAuthUser(request)
    const body = await request.json()
    const parsed = feedbackSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const { type, message, email, pageUrl } = parsed.data

    await prisma.feedback.create({
      data: {
        type,
        message,
        email: email || null,
        pageUrl: pageUrl || null,
        userId: requestUser?.id ?? null,
      },
    })

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    log.error('Failed to save feedback', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
