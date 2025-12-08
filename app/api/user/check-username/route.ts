import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'

const limiter = rateLimit(rateLimitPresets.api)

export async function GET(req: NextRequest) {
  const log = apiLogger('GET /api/user/check-username')
  
  // Rate limiting
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { searchParams } = new URL(req.url)
    const username = searchParams.get('username')

    if (!username) {
      return NextResponse.json(
        { error: 'Username parameter is required' },
        { status: 400 }
      )
    }

    // Validate username format
    if (username.length < 3 || username.length > 20) {
      return NextResponse.json(
        { 
          available: false, 
          error: 'Username must be between 3 and 20 characters',
          suggestions: []
        },
        { status: 200 }
      )
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return NextResponse.json(
        { 
          available: false, 
          error: 'Username can only contain letters, numbers, and underscores',
          suggestions: []
        },
        { status: 200 }
      )
    }

    // Check if username exists (case-insensitive)
    const existingUser = await prisma.user.findFirst({
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
  } catch (error: any) {
    log.error('Username check error', error)
    return NextResponse.json(
      { error: 'Failed to check username availability' },
      { status: 500 }
    )
  }
}

async function generateUsernameSuggestions(baseUsername: string): Promise<string[]> {
  const suggestions: string[] = []
  const maxSuggestions = 3

  // Try with numbers
  for (let i = 1; i <= 99 && suggestions.length < maxSuggestions; i++) {
    const suggestion = `${baseUsername}${i}`
    if (suggestion.length <= 20) {
      const exists = await prisma.user.findFirst({
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
        const exists = await prisma.user.findFirst({
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
    const exists = await prisma.user.findFirst({
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
