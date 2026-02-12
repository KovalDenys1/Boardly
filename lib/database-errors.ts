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
