/**
 * The notice an account's owner gets when a sign-in provider is linked to it (#1223).
 * Read from the HTML and text parts handed to Resend, which is mocked at the module
 * boundary as in email-suspension-notice.test.ts.
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
type Details = Parameters<EmailModule['sendProviderLinkedNoticeEmail']>[1]

const details: Details = {
  username: 'Ola',
  provider: 'discord',
  linkedAt: new Date('2026-10-04T12:30:00Z'),
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

async function send(overrides: Partial<Details> = {}): Promise<SentMail> {
  const mod = loadEmailModule()
  mockSend.mockClear()
  const result = await mod.sendProviderLinkedNoticeEmail('player@example.com', { ...details, ...overrides })
  expect(result).toEqual({ success: true })
  expect(mockSend).toHaveBeenCalledTimes(1)
  return mockSend.mock.calls[0][0] as SentMail
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

describe('sendProviderLinkedNoticeEmail (#1223)', () => {
  const originalEnv = { resend: process.env.RESEND_API_KEY, nextauth: process.env.NEXTAUTH_URL }

  beforeEach(() => {
    mockSend.mockReset()
    mockSend.mockResolvedValue({ data: { id: 'email_1' }, error: null })
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.NEXTAUTH_URL = 'https://boardly.test'
  })

  afterEach(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    restore('RESEND_API_KEY', originalEnv.resend)
    restore('NEXTAUTH_URL', originalEnv.nextauth)
  })

  it('names the provider, the time and what to do if it was someone else, in English then Norwegian', async () => {
    const mail = await send()

    expect(mail.to).toBe('player@example.com')
    expect(mail.replyTo).toBe('support@boardly.online')
    expect(mail.subject).toBe(
      'A Discord account was linked to your Boardly account / En Discord-konto ble koblet til Boardly-kontoen din'
    )

    for (const part of [visibleText(mail.html), mail.text]) {
      expect(part).toContain('A Discord account was linked to your Boardly account on October 4, 2026 at 12:30 PM UTC.')
      expect(part).toContain('En Discord-konto ble koblet til Boardly-kontoen din 4. oktober 2026 kl. 12:30 UTC.')
      expect(part).toContain('Sign in at https://boardly.test/profile, find Discord under "Connected Accounts" and choose "Unlink".')
      expect(part).toContain('Logg inn på https://boardly.test/profile, finn Discord under «Tilkoblede kontoer» og velg «Koble fra».')
      expect(part).toContain('set a new password at https://boardly.test/auth/forgot-password')
      expect(part).toContain('et nytt passord på https://boardly.test/auth/forgot-password')
      expect(part.indexOf('Hi Ola,')).toBeLessThan(part.indexOf('Hei Ola,'))
      expect(part).toContain('The Boardly team · support@boardly.online')
    }
    expect(mail.html).toContain('<a href="https://boardly.test/profile"')
    expect(mail.html).toContain('<a href="https://boardly.test/auth/forgot-password"')
  })

  it.each([
    ['google', 'A Google account was linked', 'En Google-konto ble koblet'],
    ['github', 'A GitHub account was linked', 'En GitHub-konto ble koblet'],
  ] as const)('names %s by its own name', async (provider, english, norwegian) => {
    const mail = await send({ provider })

    expect(mail.subject).toContain(english)
    expect(mail.text).toContain(english)
    expect(mail.text).toContain(norwegian)
    expect(mail.text).not.toContain('find Discord')
  })

  it('greets without a name when the account has none, and never renders a name as markup', async () => {
    expect((await send({ username: null })).text).toContain('Hi,\n')

    const mail = await send({ username: '<b>Ola</b>' })
    expect(mail.html).not.toContain('<b>Ola</b>')
    expect(mail.html).toContain('Hi &lt;b&gt;Ola&lt;/b&gt;,')
  })

  it('reports a failed send instead of throwing', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'quota' } })

    const result = await loadEmailModule().sendProviderLinkedNoticeEmail('player@example.com', details)

    expect(result).toEqual({ success: false, error: 'quota' })
  })
})
