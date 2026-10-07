/**
 * The warning before an inactive account is deleted (#1130). Read from the HTML and
 * text parts handed to Resend, which is mocked at the module boundary as in
 * email-subscription-notice.test.ts.
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
type Details = Parameters<EmailModule['sendInactiveAccountWarningEmail']>[1]

const NAME_VAR = 'NEXT_PUBLIC_SELLER_LEGAL_NAME'
const ADDRESS_VAR = 'NEXT_PUBLIC_SELLER_ADDRESS'

const details: Details = {
  username: 'Ola',
  deleteOn: new Date('2027-12-18T03:00:00Z'),
  idempotencyKey: 'inactive-account-warning/user_1/2025-12-18',
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
  const result = await mod.sendInactiveAccountWarningEmail('player@example.com', { ...details, ...overrides })
  expect(result).toEqual({ success: true })
  expect(mockSend).toHaveBeenCalledTimes(1)
  return { mail: mockSend.mock.calls[0][0] as SentMail, options: mockSend.mock.calls[0][1] }
}

// The English mail and the Norwegian one (#1331), with both bodies joined for the facts each
// of them has to state.
async function sendEach(overrides: Partial<Details> = {}) {
  const en = (await send({ ...overrides, language: 'en' })).mail
  const nb = (await send({ ...overrides, language: 'nb' })).mail
  return { en, nb, mail: { ...en, html: en.html + nb.html, text: `${en.text}\n\n${nb.text}` } }
}

function visibleText(html: string): string {
  return html
    .replace(/<\/(?:p|h\d|div)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
}

describe('sendInactiveAccountWarningEmail (#1130)', () => {
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
    process.env.NEXTAUTH_URL = 'https://boardly.test'
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

  it('names the day, how to keep the account, in English or in Norwegian, from the team (#1331)', async () => {
    const { mail, options } = await send()

    expect(mail.to).toBe('player@example.com')
    expect(mail.replyTo).toBe('support@boardly.online')
    expect(mail.subject).toBe('Your Boardly account will be deleted')
    expect(options).toEqual({ idempotencyKey: 'inactive-account-warning/user_1/2025-12-18' })
    expect(mail.text).not.toContain('Hei Ola,')

    const { nb, mail: both } = await sendEach()
    expect(nb.subject).toBe('Boardly-kontoen din blir slettet')
    expect(nb.text).not.toContain('Hi Ola,')
    for (const part of [visibleText(both.html), both.text]) {
      expect(part).toContain('we will delete yours on December 18, 2027 or shortly after, unless you sign in before then.')
      expect(part).toContain('Sign in at https://boardly.test/auth/login before December 18, 2027 and we keep the account.')
      expect(part).toContain('så vi sletter din 18. desember 2027 eller kort tid etter, hvis du ikke logger inn før det.')
      expect(part).toContain('Logg inn på https://boardly.test/auth/login før 18. desember 2027, så beholder vi kontoen.')
      expect(part).toContain('Hi Ola,')
      expect(part).toContain('Hei Ola,')
      expect(part).toContain('The Boardly team')
    }
  })

  it('says what goes, what stays, and where to get a copy first', async () => {
    const { mail } = await sendEach()

    expect(mail.text).toContain('your name is replaced with "Deleted player"')
    expect(mail.text).toContain('Feedback you sent stays, without your email address and account.')
    expect(mail.text).toContain('use "Download my data" on your profile page: https://boardly.test/profile.')
    expect(mail.text).toContain('«Last ned dataene mine» på profilsiden: https://boardly.test/profile.')
    expect(mail.html).toContain('<a href="https://boardly.test/auth/login"')
    expect(mail.html).toContain('<a href="https://boardly.test/privacy"')
  })

  it('greets without a name when the account has none, and never lets one inject markup', async () => {
    expect((await send({ username: null })).mail.text).toContain('Hi,\n')
    const { mail } = await send({ username: '<b>x</b>' })
    expect(mail.html).not.toContain('<b>x</b>')
  })

  it('never carries the seller identity, even once it is configured (#1227)', async () => {
    process.env[NAME_VAR] = 'Test Operator'
    process.env[ADDRESS_VAR] = 'Street 1|0001 Oslo'
    const { mail } = await send()

    expect(mail.text).not.toContain('Test Operator')
    expect(mail.text).not.toContain('Norway.')
    expect(visibleText(mail.html)).not.toContain('Test Operator')
    expect(visibleText(mail.html)).not.toContain('Norway.')
    // The company sign-off and the support mailto link still carry the message.
    expect(mail.text).toContain('The Boardly team')
    expect(mail.html).toContain('mailto:support@boardly.online')
  })

  it('reports a failed send instead of throwing', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'quota' } })
    const result = await loadEmailModule().sendInactiveAccountWarningEmail('player@example.com', details)
    expect(result).toEqual({ success: false, error: 'quota' })
  })
})
