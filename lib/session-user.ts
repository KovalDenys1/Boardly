import { getServerSession, type Session } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { AppError, AuthenticationError } from '@/lib/error-handler'

// The one way an API route reads the signed-in user (#1137).
//
// `proxy.ts` exempts `/api/` from the suspension redirect, and the `suspended`
// claim in the JWT is only re-read from the database every 30 minutes
// (lib/next-auth.ts), so a route that called getServerSession and checked
// nothing but `session.user.id` kept serving a suspended account for up to
// half an hour: friend requests, avatar uploads, profile edits, Stripe
// checkout, account unlinking. Every route that calls getServerSession goes
// through here instead:
//
// - the claim is checked on every method, so a suspension the token already
//   knows about is refused at once;
// - on a write method the flag is also re-read from the database, so a
//   suspension made a second ago is refused on the next write, not after the
//   next token refresh. Reads keep the claim only, which avoids a query per
//   GET for data the user could already see.
//
// lib/request-auth.ts does the same for the game and lobby routes.

export type SessionUser = Session['user'] & { id: string }

export interface ActiveSession {
  session: Session
  user: SessionUser
}

export interface SessionUserOptions {
  // For the account-deletion routes only: erasure (GDPR Art. 17) must stay
  // available to a suspended account, so those routes see the session as is.
  allowSuspended?: boolean
}

type MethodCarrier = { method?: string } | undefined

export class AccountSuspendedError extends AppError {
  constructor() {
    super('Account suspended', 403, 'ACCOUNT_SUSPENDED')
  }
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function isWriteMethod(method: string | undefined): boolean {
  return !READ_METHODS.has((method ?? 'GET').toUpperCase())
}

/**
 * The signed-in user, or null when nobody is signed in. Throws
 * AccountSuspendedError for a suspended account, and AuthenticationError when
 * a write comes from a session whose account no longer exists.
 */
export async function getOptionalSessionUser(
  request?: MethodCarrier,
  options: SessionUserOptions = {}
): Promise<ActiveSession | null> {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!session || !userId) {
    return null
  }

  const active: ActiveSession = { session, user: session.user as SessionUser }
  if (options.allowSuspended) {
    return active
  }

  if (session.user.suspended) {
    throw new AccountSuspendedError()
  }

  if (isWriteMethod(request?.method)) {
    const row = await prisma.users.findUnique({
      where: { id: userId },
      select: { suspended: true },
    })
    if (!row) {
      throw new AuthenticationError('Unauthorized')
    }
    if (row.suspended) {
      throw new AccountSuspendedError()
    }
  }

  return active
}

/** As getOptionalSessionUser, but a missing session is an AuthenticationError. */
export async function getSessionUserOrThrow(
  request?: MethodCarrier,
  options: SessionUserOptions = {}
): Promise<ActiveSession> {
  const active = await getOptionalSessionUser(request, options)
  if (!active) {
    throw new AuthenticationError('Unauthorized')
  }
  return active
}

/**
 * The response a route returns for the two errors above: 401 with the same
 * `{ error: 'Unauthorized' }` body the routes always answered, or 403 with
 * `code: 'ACCOUNT_SUSPENDED'`. Null for anything else, which the caller
 * rethrows.
 */
export function sessionUserErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof AccountSuspendedError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 403 })
  }
  if (error instanceof AuthenticationError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

/**
 * For routes where signing in is optional: `{ session: null }` for a visitor,
 * the session for an active account, `{ response }` for a suspended one.
 */
export async function optionalSessionUser(
  request?: MethodCarrier,
  options: SessionUserOptions = {}
): Promise<{ session: Session | null } | { response: NextResponse }> {
  try {
    const active = await getOptionalSessionUser(request, options)
    return { session: active?.session ?? null }
  } catch (error) {
    const response = sessionUserErrorResponse(error)
    if (response) {
      return { response }
    }
    throw error
  }
}

/**
 * For routes that answer with NextResponse rather than throwing into
 * withErrorHandler: `{ response }` to return as is, or the active session.
 */
export async function requireSessionUser(
  request?: MethodCarrier,
  options: SessionUserOptions = {}
): Promise<ActiveSession | { response: NextResponse }> {
  try {
    return await getSessionUserOrThrow(request, options)
  } catch (error) {
    const response = sessionUserErrorResponse(error)
    if (response) {
      return { response }
    }
    throw error
  }
}
