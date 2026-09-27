/**
 * @jest-environment node
 */
/**
 * #1132: no log call on an auth path hands the logger a raw email address.
 *
 * The logger masks addresses itself (logger-redaction.test.ts), but that is the
 * backstop: a call site that passes `{ email }` has decided to log personal data the
 * userId already identifies, and the next logger change could quietly undo the mask.
 * So the source is read: every `log.*` / `logger.*` / `console.*` call in the auth
 * routes, the account routes and NextAuth's configuration must name no email-carrying
 * property and read no `.email` field, unless it goes through `maskEmail(...)`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = path.join(__dirname, '..', '..')

const SCANNED_DIRS = ['app/api/auth', 'app/api/user']
const SCANNED_FILES = [
  'lib/next-auth.ts',
  'lib/custom-prisma-adapter.ts',
  'lib/cleanup-unverified.ts',
  'app/api/feedback/route.ts',
]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

// String literals are blanked first so a message such as 'Failed to send email:'
// is not read as a property named email. Template literals keep their ${...}
// holes, which are code.
function blankStrings(source: string): string {
  return source
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\$]|\\.|\$(?!\{))*`/g, '``')
}

const LOG_CALL = /\b(?:log|logger|console|[A-Za-z]+Log(?:ger)?|apiLogger\([^)]*\))\.(?:debug|info|warn|error|log)\s*\(/g

function callArguments(source: string, openParen: number): string {
  let depth = 0
  for (let i = openParen; i < source.length; i++) {
    const c = source[i]
    if (c === '(' || c === '{' || c === '[') depth++
    else if (c === ')' || c === '}' || c === ']') {
      depth--
      if (depth === 0) return source.slice(openParen, i + 1)
    }
  }
  return source.slice(openParen)
}

// email, userEmail, oauthEmail, pendingEmail... as a key or a shorthand property,
// and any `.email` / `.userEmail` read. `emailsSent` or `pendingEmailChange` hold
// no address and do not match.
const EMAIL_KEY = /(?:^|[{,\s])(\w*[eE]mail)\s*(?::(?!\s*maskEmail\()|(?=\s*[,}]))/
const EMAIL_READ = /\.(\w*[eE]mail)\b(?!\s*\()/

function findRawEmailLogCalls(source: string): string[] {
  const code = blankStrings(source)
  const hits: string[] = []
  for (const match of code.matchAll(LOG_CALL)) {
    const start = (match.index ?? 0) + match[0].length - 1
    const args = callArguments(code, start)
    const withoutMasked = args.replace(/maskEmail\([^)]*\)/g, 'maskEmail()')
    if (EMAIL_KEY.test(withoutMasked) || EMAIL_READ.test(withoutMasked)) {
      const line = code.slice(0, match.index).split('\n').length
      hits.push(`${line}: ${args.replace(/\s+/g, ' ').slice(0, 160)}`)
    }
  }
  return hits
}

describe('the scanner', () => {
  it('catches the shapes that used to be in the auth routes', () => {
    expect(findRawEmailLogCalls("log.info('Login attempt', { email })")).toHaveLength(1)
    expect(findRawEmailLogCalls("log.warn('x', { email, userId: user.id })")).toHaveLength(1)
    expect(findRawEmailLogCalls("log.info('x', { userId: user.id, email: user.email })")).toHaveLength(1)
    expect(findRawEmailLogCalls("log.info('x', {\n  userEmail: user.email,\n})")).toHaveLength(1)
    expect(findRawEmailLogCalls("apiLogger('/x').info('y', { to: user.email })")).toHaveLength(1)
    expect(findRawEmailLogCalls("console.error('Error for', user.email)")).toHaveLength(1)
  })

  it('lets through what carries no address', () => {
    expect(findRawEmailLogCalls("log.info('Failed to send email:', { userId: user.id })")).toEqual([])
    expect(findRawEmailLogCalls("log.info('x', { emailsSent, pendingEmailChange: true })")).toEqual([])
    expect(findRawEmailLogCalls("log.info('x', { email: maskEmail(user.email) })")).toEqual([])
  })
})

describe('auth-path log calls', () => {
  const files = [
    ...SCANNED_DIRS.flatMap((dir) => walk(path.join(root, dir))),
    ...SCANNED_FILES.map((file) => path.join(root, file)),
  ]

  it('scans a real set of files', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it.each(files.map((file) => [path.relative(root, file), file]))(
    '%s passes no raw email to a log call',
    (_relative, file) => {
      expect(findRawEmailLogCalls(readFileSync(file, 'utf8'))).toEqual([])
    }
  )
})
