export class DatabaseTimeoutError extends Error {
  public readonly code = 'DATABASE_TIMEOUT'

  constructor(
    public readonly timeoutMs: number,
    public readonly operation: string
  ) {
    super(`Database operation timed out after ${timeoutMs}ms (${operation})`)
    this.name = 'DatabaseTimeoutError'
  }
}

/**
 * A Serializable transaction that lost a race. Prisma reports it as `P2034` when
 * the conflicting statement fails, but a conflict detected at COMMIT escapes the
 * transaction manager as the pg adapter's own `DriverAdapterError`, unwrapped.
 */
export function isTransactionWriteConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, name, cause } = error as { code?: unknown; name?: unknown; cause?: unknown }
  if (code === 'P2034') return true
  if (name !== 'DriverAdapterError' || typeof cause !== 'object' || cause === null) return false
  return (cause as { kind?: unknown }).kind === 'TransactionWriteConflict'
}
