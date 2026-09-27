/**
 * @jest-environment node
 */
/**
 * #1132: no plaintext email address reaches a log line. The logger is the backstop
 * for call sites that forget; the call sites themselves log the userId (see
 * log-no-raw-email.test.ts, which reads the source).
 */
import { logger, apiLogger } from '@/lib/logger'
import { maskEmail, redactEmailsInText, redactLogValue } from '@/lib/redact'
import { maskEmailAddress } from '@/lib/email'

// A full address: at least three characters of local part, then a domain. A masked
// address ("ja***@example.com") has `*` right before the `@` and never matches.
const FULL_ADDRESS = /[A-Za-z0-9._%+-]{3,}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

function captureLogs(run: () => void): string {
  const lines: string[] = []
  const spy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  })
  try {
    run()
  } finally {
    spy.mockRestore()
  }
  return lines.join('\n')
}

describe('maskEmail', () => {
  it('keeps the first two characters and the domain', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('ja***@example.com')
  })

  it('keeps one character of a one- or two-character local part', () => {
    expect(maskEmail('ab@example.com')).toBe('a***@example.com')
    expect(maskEmail('a@example.com')).toBe('a***@example.com')
  })

  it('answers *** for something that is not an address', () => {
    expect(maskEmail('no-at-sign')).toBe('***')
    expect(maskEmail('@example.com')).toBe('***')
  })

  it('is the same rule lib/email.ts uses in the email-change notice', () => {
    expect(maskEmailAddress('jane.doe@example.com')).toBe(maskEmail('jane.doe@example.com'))
  })
})

describe('redactEmailsInText', () => {
  it('masks every address inside a sentence and leaves the rest', () => {
    expect(redactEmailsInText('to jane.doe@example.com and bob+x@mail.co.uk now')).toBe(
      'to ja***@example.com and bo***@mail.co.uk now'
    )
  })

  it('does not touch an already masked address', () => {
    expect(redactEmailsInText('ja***@example.com')).toBe('ja***@example.com')
  })

  it('leaves text without an address alone', () => {
    expect(redactEmailsInText('@sentry/nextjs failed at 12:00')).toBe('@sentry/nextjs failed at 12:00')
  })
})

describe('redactLogValue', () => {
  it('masks email-named keys at any depth, arrays included', () => {
    const out = redactLogValue({
      email: 'jane.doe@example.com',
      nested: { userEmail: 'john@example.org', list: [{ oauthEmail: 'x.y@example.net' }] },
      emailsSent: 3,
      pendingEmailChange: true,
    })
    expect(out).toEqual({
      email: 'ja***@example.com',
      nested: { userEmail: 'jo***@example.org', list: [{ oauthEmail: 'x.***@example.net' }] },
      emailsSent: 3,
      pendingEmailChange: true,
    })
  })

  it('masks an email-named key even when the value does not look like an address', () => {
    expect(redactLogValue({ email: 'jane@localhost' })).toEqual({ email: 'ja***@localhost' })
  })

  it('masks addresses in any string value, not only under email keys', () => {
    expect(redactLogValue({ from: 'Jane <jane.doe@example.com>', to: ['support@boardly.online'] })).toEqual({
      from: 'Jane <ja***@example.com>',
      to: ['su***@boardly.online'],
    })
  })

  it('never mutates the object it was given', () => {
    const input = { email: 'jane.doe@example.com', nested: { email: 'john@example.org' } }
    redactLogValue(input)
    expect(input).toEqual({ email: 'jane.doe@example.com', nested: { email: 'john@example.org' } })
  })

  it('survives a circular reference', () => {
    const input: Record<string, unknown> = { email: 'jane.doe@example.com' }
    input.self = input
    expect(redactLogValue(input)).toEqual({ email: 'ja***@example.com', self: '[Circular]' })
  })

  it('keeps an Error readable with its message redacted', () => {
    expect(redactLogValue({ error: new Error('Invalid to: jane.doe@example.com') })).toEqual({
      error: { name: 'Error', message: 'Invalid to: ja***@example.com' },
    })
  })
})

describe('logger output', () => {
  it('writes no full address from the context, the message or the error', () => {
    const output = captureLogs(() => {
      logger.info('Reset asked for jane.doe@example.com', { email: 'jane.doe@example.com', userId: 'u1' })
      logger.warn('warn', { nested: { userEmail: 'john.smith@example.org' } })
      logger.error('failed', new Error('Resend refused jane.doe@example.com'), { to: 'john.smith@example.org' })
      apiLogger('/api/test').info('child', { oauthEmail: 'x.y.z@example.net' })
    })

    expect(output).not.toMatch(FULL_ADDRESS)
    expect(output).toContain('ja***@example.com')
    expect(output).toContain('jo***@example.org')
    expect(output).toContain('"userId":"u1"')
  })

  it('the assertion above would catch a raw address', () => {
    // The same check run on an unredacted payload must fail, or the test above
    // proves nothing.
    expect(JSON.stringify({ email: 'jane.doe@example.com' })).toMatch(FULL_ADDRESS)
  })
})
