/**
 * Error Handler Utility
 * 
 * Provides consistent error handling across the application
 */

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { logger } from './logger'

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: any
  ) {
    super(message)
    this.name = 'AppError'
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details)
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR')
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Permission denied') {
    super(message, 403, 'AUTHORIZATION_ERROR')
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT')
    this.name = 'ConflictError'
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super('Too many requests', 429, 'RATE_LIMIT_EXCEEDED', { retryAfter })
    this.name = 'RateLimitError'
  }
}

/**
 * Handle API errors and convert them to appropriate HTTP responses
 */
export function handleApiError(error: unknown): NextResponse {
  // Log the error
  if (error instanceof Error) {
    logger.error('API Error', error, {
      name: error.name,
      stack: error.stack,
    })
  } else {
    logger.error('Unknown API Error', undefined, { error })
  }

  // Handle known error types
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        details: error.details,
      },
      { status: error.statusCode }
    )
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.issues.map(err => ({
          path: Array.isArray(err.path) ? err.path.join('.') : String(err.path),
          message: err.message,
        })),
      },
      { status: 400 }
    )
  }

  // Handle Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return handlePrismaError(error)
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return NextResponse.json(
      {
        error: 'Invalid database query',
        code: 'DATABASE_VALIDATION_ERROR',
      },
      { status: 400 }
    )
  }

  // Handle generic errors
  if (error instanceof Error) {
    // Don't expose internal error messages in production
    const message = process.env.NODE_ENV === 'development' 
      ? error.message 
      : 'Internal server error'
    
    return NextResponse.json(
      {
        error: message,
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    )
  }

  // Unknown error type
  return NextResponse.json(
    {
      error: 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
    },
    { status: 500 }
  )
}

/**
 * Handle Prisma-specific errors
 */
function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): NextResponse {
  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      const target = (error.meta?.target as string[]) || []
      return NextResponse.json(
        {
          error: `${target.join(', ')} already exists`,
          code: 'DUPLICATE_ENTRY',
          details: { fields: target },
        },
        { status: 409 }
      )

    case 'P2025':
      // Record not found
      return NextResponse.json(
        {
          error: 'Record not found',
          code: 'NOT_FOUND',
        },
        { status: 404 }
      )

    case 'P2003':
      // Foreign key constraint failed
      return NextResponse.json(
        {
          error: 'Related record not found',
          code: 'FOREIGN_KEY_CONSTRAINT',
        },
        { status: 400 }
      )

    case 'P2014':
      // Required relation violation
      return NextResponse.json(
        {
          error: 'Invalid relation',
          code: 'RELATION_VIOLATION',
        },
        { status: 400 }
      )

    default:
      logger.error('Unhandled Prisma error', undefined, {
        code: error.code,
        meta: error.meta,
      })
      return NextResponse.json(
        {
          error: 'Database operation failed',
          code: 'DATABASE_ERROR',
        },
        { status: 500 }
      )
  }
}

/**
 * Async error handler wrapper for API routes
 */
export function withErrorHandler(
  handler: (...args: any[]) => Promise<NextResponse>
) {
  return async (...args: any[]): Promise<NextResponse> => {
    try {
      return await handler(...args)
    } catch (error) {
      return handleApiError(error)
    }
  }
}

/**
 * Assert that a value is truthy or throw an error
 */
export function assert(
  condition: any,
  message: string,
  ErrorClass: typeof AppError = AppError
): asserts condition {
  if (!condition) {
    throw new ErrorClass(message)
  }
}

/**
 * Assert that a value exists or throw NotFoundError
 */
export function assertExists<T>(
  value: T | null | undefined,
  resource: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new NotFoundError(resource)
  }
}
