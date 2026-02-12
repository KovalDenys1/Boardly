/**
 * @jest-environment @edge-runtime/jest-environment
 */

import {
  ValidationError,
  handleApiError,
  withErrorHandler,
} from '@/lib/error-handler'
import { DatabaseTimeoutError } from '@/lib/database-errors'

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}))

describe('error handler', () => {
  it('returns 400 for validation errors', async () => {
    const response = handleApiError(new ValidationError('Username is required'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      error: 'Username is required',
      code: 'VALIDATION_ERROR',
    })
  })

  it('returns 503 for database timeout errors', async () => {
    const response = handleApiError(new DatabaseTimeoutError(1500, 'Users.findUnique'))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      error: 'Database request timed out',
      code: 'DATABASE_TIMEOUT',
      details: {
        timeoutMs: 1500,
        operation: 'Users.findUnique',
      },
    })
  })

  it('withErrorHandler converts thrown errors to responses', async () => {
    const handler = withErrorHandler(async () => {
      throw new ValidationError('Invalid payload')
    })

    const response = await handler()
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      error: 'Invalid payload',
      code: 'VALIDATION_ERROR',
    })
  })
})
