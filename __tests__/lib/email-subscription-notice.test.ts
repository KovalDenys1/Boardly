/**
 * The running-subscription notice email (#1165). digitalytelsesloven § 33 fourth
 * paragraph wants it to say that the contract runs and how to end it; these
 * tests read that from the HTML and text parts handed to Resend, which is
 * mocked at the module boundary as in email-premium-confirmation.test.ts.
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
type Details = Parameters<EmailModule['sendSubscriptionNoticeEmail']>[1]

const NAME_VAR = 'NEXT_PUBLIC_SELLER_LEGAL_NAME'
const ADDRESS_VAR = 'NEXT_PUBLIC_SELLER_ADDRESS'

const details: Details = {
  username: 'Ola',
  plan: 'yearly',
  unitAmount: 2999,
  currency: 'usd',
  renewsAt: new Date('2027-09-03T00:00:00Z'),
  idempotencyKey: 'subscription-notice/user_1/2027-02-20',
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
  const result = await mod.sendSubscriptionNoticeEmail('buyer@example.com', { ...details, ...overrides })
  expect(result).toEqual({ success: true })
  expect(mockSend).toHaveBeenCalledTimes(1)
  return { mail: mockSend.mock.calls[0][0] as SentMail, options: mockSend.mock.calls[0][1] }
}

function visibleText(html: string): string {
  return html
    .replace(/<\/(?:p|h\d|div)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
}

describe('sendSubscriptionNoticeEmail (#1165)', () => {
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

  it('says the subscription is running, in English and in Norwegian, and replies to support', async () => {
    const { mail, options } = await send()

    expect(mail.to).toBe('buyer@example.com')
    expect(mail.replyTo).toBe('support@boardly.online')
    expect(mail.subject).toBe(
      'Your Boardly Premium subscription is still running / Boardly Premium-abonnementet ditt løper fortsatt'
    )
    expect(options).toEqual({ idempotencyKey: 'subscription-notice/user_1/2027-02-20' })

    for (const part of [visibleText(mail.html), mail.text]) {
      expect(part).toContain('Your Boardly Premium subscription is still running.')
      expect(part).toContain('Boardly Premium-abonnementet ditt løper fortsatt.')
      expect(part.indexOf('Hi Ola,')).toBeLessThan(part.indexOf('Hei Ola,'))
      expect(part).toContain('The Boardly team')
    }
  })

  it('names the plan, the price, the next renewal and the cancellation route (§ 33 first to third paragraphs)', async () => {
    const { mail } = await send()
    const text = mail.text

    expect(text).toContain('Boardly Premium, yearly plan. Price: $29.99 per year.')
    expect(text).toContain('It renews automatically on September 3, 2027, and every year after that, until you cancel.')
    expect(text).toContain('open https://boardly.test/profile?tab=premium, go to the Premium tab and press Cancel.')
    expect(text).toContain('takes effect at the end of the period you have paid for')
    expect(text).toContain('write to support@boardly.online and we cancel it for you')
    // The early yearly refund is on request, never automatic.
    expect(text).toContain('If you cancel a yearly plan early, write to us and we refund the unused whole months.')
    expect(text).toContain('Sier du opp et årsabonnement før tiden, kan du skrive til oss, så betaler vi tilbake de ubrukte hele månedene.')
    expect(text).toContain('Du kan si opp når som helst: åpne https://boardly.test/profile?tab=premium')
    expect(mail.html).toContain('<a href="https://boardly.test/profile?tab=premium"')
  })

  it('reads as a monthly plan when it is one, and leaves the price out when Stripe gave none', async () => {
    const { mail } = await send({ plan: 'monthly', unitAmount: null, currency: null, renewsAt: null })

    expect(mail.text).toContain('Boardly Premium, monthly plan.\n')
    expect(mail.text).not.toContain('Price:')
    expect(mail.text).toContain('It renews automatically every month until you cancel.')
    expect(mail.text).toContain('Abonnementet fornyes automatisk hver måned til du sier det opp.')
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
})
