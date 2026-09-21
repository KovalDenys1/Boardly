/**
 * Case-insensitive name matching that does not treat `_` as a wildcard.
 *
 * Prisma's `equals` with `mode: 'insensitive'` compiles to `ILIKE <value>` and
 * passes the value straight through, so the LIKE metacharacters inside it stay
 * live: `_` matches any single character and `%` matches any run. A username is
 * `[a-zA-Z0-9_]+` - both writers and GET /api/user/check-username validate that
 * - so `_` is an ordinary character in a name and the filter over-matches.
 *
 * Verified against boardly-dev on 2026-09-21 with two rows, `probe_1055_zz` and
 * `probeX1055Xzz`:
 *
 *   equals: 'probe_1055_zz',     mode: 'insensitive'  -> both rows
 *   equals: 'probe\\_1055\\_zz', mode: 'insensitive'  -> only probe_1055_zz
 *
 * Two halves, and a caller deciding whether a name is taken needs both.
 *
 * `insensitiveEquals` escapes the metacharacters so the database returns a tight
 * set - with them escaped only genuine case-variants come back, and `username`
 * is `@unique`, so that is a couple of rows however common the name is.
 *
 * `sameName` decides. It is a separate step on purpose: the escaping relies on
 * Prisma compiling this filter to ILIKE, which is an implementation detail it
 * does not promise, so nothing is allowed to depend on it for correctness. The
 * query narrows; the comparison is what answers the question.
 */

/**
 * `value` with the LIKE metacharacters neutralised, for a pattern that Postgres
 * reads with its default escape character.
 *
 * The backslash goes first, so an escape this function adds is never escaped a
 * second time.
 */
export function escapeLikeValue(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

/**
 * A Prisma filter matching `value` case-insensitively and nothing else.
 *
 * Narrowing only - see the note above. Pair it with `sameName` over the rows it
 * returns before calling a name taken.
 */
export function insensitiveEquals(value: string) {
    return { equals: escapeLikeValue(value), mode: 'insensitive' } as const
}

/**
 * Whether two stored names are the same name ignoring case.
 *
 * A null or absent name matches nothing, including another null: a row with no
 * username is not holding one.
 */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') return false
    return a.toLowerCase() === b.toLowerCase()
}
