import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { ValidationError, withErrorHandler } from '@/lib/error-handler'

const limiter = rateLimit(rateLimitPresets.api)
const log = apiLogger('GET /api/user/check-username')

async function checkUsernameHandler(req: NextRequest) {
  // Rate limiting
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const { searchParams } = new URL(req.url)
  const username = searchParams.get('username')

  if (!username) {
    throw new ValidationError('Username parameter is required')
  }

  // Validate username format
  if (username.length < 3 || username.length > 20) {
    return NextResponse.json(
      {
        available: false,
        error: 'Username must be between 3 and 20 characters',
        suggestions: [],
      },
      { status: 200 }
    )
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return NextResponse.json(
      {
        available: false,
        error: 'Username can only contain letters, numbers, and underscores',
        suggestions: [],
      },
      { status: 200 }
    )
  }

  // Check if username exists (case-insensitive)
  const existingUser = await prisma.users.findFirst({
    where: {
      username: {
        equals: username,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
    },
  })

  const isAvailable = !existingUser

  // Generate suggestions if username is taken
  let suggestions: string[] = []
  if (!isAvailable) {
    suggestions = await generateUsernameSuggestions(username)
  }

  log.info('Username check completed', { username, isAvailable })

  return NextResponse.json({
    available: isAvailable,
    username,
    suggestions,
  })
}

export const GET = withErrorHandler(checkUsernameHandler)

async function generateUsernameSuggestions(baseUsername: string): Promise<string[]> {
  const suggestions: string[] = []
  const maxSuggestions = 3

  // Try with numbers
  for (let i = 1; i <= 99 && suggestions.length < maxSuggestions; i++) {
    const suggestion = `${baseUsername}${i}`
    if (suggestion.length <= 20) {
      const exists = await prisma.users.findFirst({
        where: {
          username: {
            equals: suggestion,
            mode: 'insensitive',
          },
        },
      })
      if (!exists) {
        suggestions.push(suggestion)
      }
    }
  }

  // Try with underscore and numbers
  if (suggestions.length < maxSuggestions) {
    for (let i = 1; i <= 99 && suggestions.length < maxSuggestions; i++) {
      const suggestion = `${baseUsername}_${i}`
      if (suggestion.length <= 20) {
        const exists = await prisma.users.findFirst({
          where: {
            username: {
              equals: suggestion,
              mode: 'insensitive',
            },
          },
        })
        if (!exists) {
          suggestions.push(suggestion)
        }
      }
    }
  }

  // Try with random numbers at the end
  if (suggestions.length < maxSuggestions) {
    const randomNum = Math.floor(Math.random() * 9000) + 1000 // 1000-9999
    const suggestion = `${baseUsername}${randomNum}`.substring(0, 20)
    const exists = await prisma.users.findFirst({
      where: {
        username: {
          equals: suggestion,
          mode: 'insensitive',
        },
      },
    })
    if (!exists) {
      suggestions.push(suggestion)
    }
  }

  return suggestions
}
