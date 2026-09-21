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
 * Two halves, and a caller deciding whether a name is taken needs both. They do
 * different jobs, and the difference is the whole of what this comment is for.
 *
 * `insensitiveEquals` escapes the metacharacters so the database returns a tight
 * set - with them escaped only genuine case-variants come back, and `username`
 * is `@unique`, so that is a couple of rows however common the name is. That
 * matters beyond speed on GET /api/user/check-email, which is public and takes
 * any address the loose pattern in lib/profile-email.ts admits: `%@%.%` passes
 * it, and unescaped that is a `findMany` over every row in the table.
 *
 * `sameName` decides over the rows the filter returned.
 *
 * An earlier version of this comment said `sameName` is a separate step so that
 * "nothing is allowed to depend on" Prisma compiling the filter to ILIKE. That
 * is not what the code does, and the direction it gets wrong is the one that
 * bites on an upgrade. The escaping works *because* the value is compiled into a
 * LIKE pattern read with the default `\` escape - it is a workaround for that
 * leak and it is coupled to it. Checked against boardly-dev on 2026-09-21 with
 * one row, `w2depmuay4aid_x`:
 *
 *   equals: 'w2depmuay4aid\\_x', mode: 'insensitive'  -> the row
 *   equals: 'w2depmuay4aid\\_x', plain equality       -> nothing
 *   equals: 'w2depmuay4aid_x',   plain equality       -> the row
 *
 * So if Prisma ever escapes the value itself, or stops compiling this filter to
 * a pattern, the escaped value stops matching the row it was meant to find and
 * the lookup comes back empty - a name an account holds would read as free.
 * `sameName` cannot cover that: it only ever sees rows the filter returned, so
 * it closes over-matching (a row the wildcard let in is dropped) and can do
 * nothing about under-matching (a row that never came back cannot be compared).
 *
 * Over-matching is the direction that has actually reached users - #1055, all
 * four call sites - and `sameName` closes it whatever the driver does with the
 * pattern. Under-matching is an assumption about Prisma, so it is written down
 * here rather than claimed away: on a Prisma upgrade, re-run the three queries
 * above against a real database. Nothing in the jest suite can check them.
 *
 * What pins each half, in __tests__/api/username-underscore-wildcard.test.ts:
 * `escapeLikeValue` by "escapes the LIKE metacharacters so a pattern matches
 * only its own literal", which runs its output through an independent
 * implementation of LIKE; `sameName` by the "escape does not reach the database"
 * cases, which drive the four routes against a driver that drops the escaping -
 * which is exactly what these routes did before #1055 - and require the answers
 * to stay right anyway.
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
 * A Prisma filter matching `value` case-insensitively and nothing else, for as
 * long as Prisma compiles it to a LIKE pattern - see the note above for what
 * happens if it stops.
 *
 * Narrowing. Pair it with `sameName` over the rows it returns before calling a
 * name taken: this decides what the database may return, `sameName` decides
 * which of those rows answers the question.
 */
export function insensitiveEquals(value: string) {
    return { equals: escapeLikeValue(value), mode: 'insensitive' } as const
}

/**
 * Whether two stored names are the same name ignoring case.
 *
 * The decision, over rows the filter already returned. It drops a row the
 * pattern let in and cannot recover one the pattern kept out.
 *
 * A null or absent name matches nothing, including another null: a row with no
 * username is not holding one.
 */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') return false
    return a.toLowerCase() === b.toLowerCase()
}
