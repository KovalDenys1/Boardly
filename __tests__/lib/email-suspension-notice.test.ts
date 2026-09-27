/**
 * The suspension notice (#1231, Control Panel #120). The Terms promise it in section 5:
 * "When we suspend or close an account, we email the owner the reason and, for a temporary
 * suspension, the end date." Read from the HTML and text parts handed to Resend, which is
 * mocked at the module boundary as in email-inactive-account-warning.test.ts.
 */

export {}

const mockSend = jest.fn()

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

type EmailModule = typeof import('@/lib/email')
type Details = Parameters<EmailModule['sendSuspensionNoticeEmail']>[1]

const NAME_VAR = 'NEXT_PUBLIC_SELLER_LEGAL_NAME'
const ADDRESS_VAR = 'NEXT_PUBLIC_SELLER_ADDRESS'

const details: Details = {
  username: 'Ola',
  reason: 'Repeated insults in lobby chat',
  expiresAt: new Date('2026-10-04T12:30:00Z'),
  idempotencyKey: 'suspension-notice/user_1/abc',
}

function loadEmailModule(): EmailModule {
  let mod: EmailModule | undefined
  jest.isolateModules(() => {
    mod = require('@/lib/email') as EmailModule
  })
  if (!mod) throw new Error('lib/email did not load')
  return mod
}

type SentMail = { to: string; replyTo: string; subject: string; html: string; text: string }

async function send(overrides: Partial<Details> = {}): Promise<{ mail: SentMail; options: unknown }> {
  const mod = loadEmailModule()
  mockSend.mockClear()
  const result = await mod.sendSuspensionNoticeEmail('player@example.com', { ...details, ...overrides })
  expect(result).toEqual({ success: true })
  expect(mockSend).toHaveBeenCalledTimes(1)
  return { mail: mockSend.mock.calls[0][0] as SentMail, options: mockSend.mock.calls[0][1] }
}

function visibleText(html: string): string {
  return html
    .replace(/<\/(?:p|h\d|div)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&middot;/g, '·')
    .replace(/\s+/g, ' ')
}

describe('sendSuspensionNoticeEmail (#1231)', () => {
  const originalEnv = {
    name: process.env[NAME_VAR],
    address: process.env[ADDRESS_VAR],
    resend: process.env.RESEND_API_KEY,
    nextauth: process.env.NEXTAUTH_URL,
  }

  beforeEach(() => {
    mockSend.mockReset()
    mockSend.mockResolvedValue({ data: { id: 'email_1' }, error: null })
    process.env.RESEND_API_KEY = 're_test_key'
    // A preview deployment: the appeal link must still be the production form.
    process.env.NEXTAUTH_URL = 'https://boardly-preview.test'
    delete process.env[NAME_VAR]
    delete process.env[ADDRESS_VAR]
  })

  afterEach(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    restore(NAME_VAR, originalEnv.name)
    restore(ADDRESS_VAR, originalEnv.address)
    restore('RESEND_API_KEY', originalEnv.resend)
    restore('NEXTAUTH_URL', originalEnv.nextauth)
  })

  it('gives the reason, the end date and the appeal link, in English then Norwegian', async () => {
    const { mail, options } = await send()

    expect(mail.to).toBe('player@example.com')
    expect(mail.replyTo).toBe('support@boardly.online')
    expect(mail.subject).toBe('Your Boardly account has been suspended / Boardly-kontoen din er suspendert')
    expect(options).toEqual({ idempotencyKey: 'suspension-notice/user_1/abc' })

    for (const part of [visibleText(mail.html), mail.text]) {
      expect(part).toContain('We have suspended your Boardly account.')
      expect(part).toContain('Repeated insults in lobby chat')
      expect(part).toContain('The suspension ends on October 4, 2026 at 12:30 PM UTC.')
      expect(part).toContain('Suspensjonen varer til 4. oktober 2026 kl. 12:30 UTC.')
      expect(part).toContain('appeal with the form at https://boardly.online/suspended')
      expect(part).toContain('klage med skjemaet på https://boardly.online/suspended')
      expect(part.indexOf('Hi Ola,')).toBeLessThan(part.indexOf('Hei Ola,'))
      expect(part).toContain('The Boardly team · support@boardly.online')
    }
    expect(mail.html).toContain('<a href="https://boardly.online/suspended"')
    expect(mail.html).toContain('mailto:support@boardly.online')
  })

  it('says "until further notice" when the suspension has no end date', async () => {
    const { mail } = await send({ expiresAt: null })

    expect(mail.text).toContain('The suspension lasts until further notice.')
    expect(mail.text).toContain('Suspensjonen gjelder inntil videre.')
    expect(mail.text).not.toContain('ends on')
  })

  it('shows the reason as written, one paragraph per line, and never as markup', async () => {
    const { mail } = await send({ reason: 'First line\n\n<script>alert(1)</script> & more' })

    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('<p>First line</p><p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; more</p>')
    expect(mail.text).toContain('First line\n<script>alert(1)</script> & more')
  })

  it('greets without a name when the account has none', async () => {
    expect((await send({ username: null })).mail.text).toContain('Hi,\n')
  })

  it('carries the plain company footer and never the seller identity (#1227)', async () => {
    process.env[NAME_VAR] = 'Test Operator'
    process.env[ADDRESS_VAR] = 'Street 1|0001 Oslo'
    const { mail } = await send()

    for (const part of [visibleText(mail.html), mail.text]) {
      expect(part).not.toContain('Test Operator')
      expect(part).not.toContain('Norway.')
    }
  })

  it('reports a failed send instead of throwing', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'quota' } })

    const result = await loadEmailModule().sendSuspensionNoticeEmail('player@example.com', details)

    expect(result).toEqual({ success: false, error: 'quota' })
  })
})
