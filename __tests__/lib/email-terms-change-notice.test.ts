export {}

const mockSend = jest.fn()

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

type EmailModule = typeof import('@/lib/email')
type Details = Parameters<EmailModule['sendTermsChangeNoticeEmail']>[1]

const details: Details = {
  username: 'Ola',
  appliesFrom: new Date('2027-01-01T00:00:00Z'),
  idempotencyKey: 'terms-change-notice/2026-10-05/user_1',
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

function visibleText(html: string): string {
  return html
    .replace(/<\/(?:p|h\d|div)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
}

describe('Terms change notice email (#1224)', () => {
  const originalKey = process.env.RESEND_API_KEY

  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test'
    mockSend.mockReset()
    mockSend.mockResolvedValue({ data: { id: 'email_1' }, error: null })
  })

  afterAll(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = originalKey
  })

  async function send(overrides: Partial<Details> = {}) {
    const result = await loadEmailModule().sendTermsChangeNoticeEmail('player@example.com', { ...details, ...overrides })
    expect(result).toEqual({ success: true })
    return { mail: mockSend.mock.calls[0][0] as SentMail, options: mockSend.mock.calls[0][1] }
  }

  it('says what changes, from when, and what the owner can do, in English and Norwegian', async () => {
    const { mail } = await send()

    for (const body of [mail.text, visibleText(mail.html)]) {
      expect(body).toContain('Hi Ola,')
      expect(body).toContain('One thing changes, and it applies from January 1, 2027.')
      expect(body).toContain(
        'From January 1, 2027, an account that has not been used for 24 months is deleted. We email the address on the account 30 days before, and signing in once before that day keeps the account. Nothing else in the Terms has changed.'
      )
      expect(body).toContain('has or has had Premium or has ever started a Premium purchase, or to an account that is suspended')
      expect(body).toContain('you can delete your account from your profile page before January 1, 2027: https://boardly.online/profile')
      expect(body).toContain('The rule is in section 2 of the Terms: https://boardly.online/terms')
      expect(body).toContain('Hei Ola,')
      expect(body).toContain('Fra 1. januar 2027 slettes en konto som ikke har vært brukt på 24 måneder.')
      expect(body).toContain('Regelen står i punkt 2 i vilkårene: https://boardly.online/terms')
      expect(body).toContain('The Boardly team')
    }
  })

  it('goes to the account address once, with replies to support', async () => {
    const { mail, options } = await send({ username: null })

    expect(mail.to).toBe('player@example.com')
    expect(mail.replyTo).toBe('support@boardly.online')
    expect(mail.subject).toBe('An update to the Boardly Terms of Service / Boardlys vilkår er oppdatert')
    expect(mail.text).toContain('Hi,\n')
    expect(options).toEqual({ idempotencyKey: 'terms-change-notice/2026-10-05/user_1' })
  })

  it('reports a refused send instead of throwing', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'daily quota exceeded' } })

    const result = await loadEmailModule().sendTermsChangeNoticeEmail('player@example.com', details)

    expect(result).toEqual({ success: false, error: 'daily quota exceeded' })
  })
})
