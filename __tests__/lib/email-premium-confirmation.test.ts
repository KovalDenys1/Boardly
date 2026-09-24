/**
 * The purchase confirmation a Premium buyer gets (#1164). Resend is mocked at
 * the module boundary, so the assertions run against the HTML and the text
 * part the code hands it; lib/email is loaded fresh per test because it reads
 * RESEND_API_KEY once at import.
 */

// A module, not a script: without an export the file's top-level names would
// share one global scope with email-seller-footer.test.ts under tsc.
export {}

const mockSend = jest.fn()

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

type EmailModule = typeof import('@/lib/email')
type Details = Parameters<EmailModule['sendPremiumConfirmationEmail']>[1]

const NAME_VAR = 'NEXT_PUBLIC_SELLER_LEGAL_NAME'
const ADDRESS_VAR = 'NEXT_PUBLIC_SELLER_ADDRESS'

const details: Details = {
  username: 'Ola',
  plan: 'monthly',
  amountTotal: 299,
  currency: 'usd',
  convertedFrom: null,
  renewsAt: new Date('2026-10-24T14:00:00Z'),
  consentAt: new Date('2026-09-24T14:00:00Z'),
  termsVersion: '2026-09-24',
}

function loadEmailModule(): EmailModule {
  let mod: EmailModule | undefined
  jest.isolateModules(() => {
    mod = require('@/lib/email') as EmailModule
  })
  if (!mod) {
    throw new Error('lib/email did not load')
  }
  return mod
}

type SentMail = { to: string; from: string; replyTo: string; subject: string; html: string; text: string }

async function send(overrides: Partial<Details> = {}): Promise<SentMail> {
  const mod = loadEmailModule()
  mockSend.mockClear()
  const result = await mod.sendPremiumConfirmationEmail('buyer@example.com', { ...details, ...overrides })
  expect(result).toEqual({ success: true })
  expect(mockSend).toHaveBeenCalledTimes(1)
  return mockSend.mock.calls[0][0] as SentMail
}

// The text a reader sees, without the markup: tags gone, entities decoded,
// whitespace collapsed. Sentences are asserted on this so an anchor inside
// one does not break the match.
function visibleText(html: string): string {
  return html
    .replace(/<\/(?:p|h\d|div)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
}

describe('sendPremiumConfirmationEmail', () => {
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
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    restore(NAME_VAR, originalEnv.name)
    restore(ADDRESS_VAR, originalEnv.address)
    restore('RESEND_API_KEY', originalEnv.resend)
    restore('NEXTAUTH_URL', originalEnv.nextauth)
  })

  it('goes to the buyer with the bilingual subject and replies to support', async () => {
    const mail = await send()

    expect(mail.to).toBe('buyer@example.com')
    expect(mail.subject).toBe('Your Boardly Premium confirmation / Bekreftelse på Boardly Premium')
    expect(mail.replyTo).toBe('support@boardly.online')
    expect(mail.from).toBeTruthy()
  })

  it('carries both languages, English first, in the HTML and in the text part', async () => {
    const mail = await send()

    for (const part of [visibleText(mail.html), mail.text]) {
      expect(part).toContain('Hi Ola,')
      expect(part).toContain('Hei Ola,')
      expect(part.indexOf('Hi Ola,')).toBeLessThan(part.indexOf('Hei Ola,'))
      for (const heading of [
        'What you bought',
        'How to cancel',
        'Right of withdrawal',
        'Your request at checkout',
        'Terms',
        'Hva du kjøpte',
        'Slik sier du opp',
        'Angrerett',
        'Det du ba om i kassen',
        'Vilkår',
      ]) {
        expect(part.toLowerCase()).toContain(heading.toLowerCase())
      }
    }
    expect(mail.html).toContain('<div lang="en">')
    expect(mail.html).toContain('<div lang="nb">')
  })

  it('states what was bought: plan, the charged amount in both formats, renewal and the next date', async () => {
    const mail = await send()
    const text = visibleText(mail.html)

    expect(text).toContain('Boardly Premium, monthly plan, purchased on September 24, 2026 at 2:00 PM UTC.')
    expect(text).toContain('Amount charged: $2.99.')
    expect(text).toContain('renews automatically every month at the same price until you cancel. Next renewal: October 24, 2026.')
    expect(text).toContain('Boardly Premium, månedsabonnement, kjøpt 24. september 2026 kl. 14:00 UTC.')
    expect(text).toContain('Belastet beløp: 2,99 USD.')
    expect(text).toContain('fornyes automatisk hver måned til samme pris til du sier det opp. Neste fornyelse: 24. oktober 2026.')
    // The plain-text part carries the same figures.
    expect(mail.text).toContain('Amount charged: $2.99.')
    expect(mail.text).toContain('Belastet beløp: 2,99 USD.')
  })

  it('formats the charged currency by its own minor unit and names the converted source amount', async () => {
    const mail = await send({
      plan: 'yearly',
      amountTotal: 32900,
      currency: 'nok',
      convertedFrom: { amountTotal: 2999, currency: 'usd' },
    })
    const text = visibleText(mail.html)

    expect(text).toContain('Amount charged: NOK 329.00. That is $29.99 converted into your currency at checkout.')
    expect(text).toContain('Belastet beløp: 329,00 kr. Det tilsvarer 29,99 USD omregnet til din valuta i kassen.')
    expect(text).toContain('yearly plan')
    expect(text).toContain('renews automatically every year')
    expect(text).toContain('årsabonnement')
    expect(text).toContain('fornyes automatisk hvert år')
  })

  it('explains cancellation: one click in the profile, end of the paid period, yearly refunds whole months', async () => {
    const mail = await send()
    const text = visibleText(mail.html)

    expect(text).toContain(
      'You can cancel at any time with one click from your profile at https://boardly.test/profile. The cancellation takes effect at the end of the period you have paid for, and you keep Premium until then. If you cancel a yearly plan early, we refund the unused whole months.'
    )
    expect(text).toContain(
      'Sier du opp et årsabonnement før tiden, betaler vi tilbake de ubrukte hele månedene.'
    )
    expect(mail.html).toContain('<a href="https://boardly.test/profile"')
  })

  it('repeats the right of withdrawal: 14 days, full refund within 14 days of notice, email or the form', async () => {
    const mail = await send()
    const text = visibleText(mail.html)

    expect(text).toContain(
      'You have 14 days from the purchase date to withdraw from this purchase, without giving a reason. To withdraw, send an email to support@boardly.online or use the withdrawal form at https://boardly.test/withdrawal. We refund everything you have paid for the purchase within 14 days of receiving your notice, by the same payment method and with no fee.'
    )
    expect(text).toContain(
      'Du har 14 dagers angrerett fra kjøpsdatoen, uten å oppgi noen grunn. For å angre sender du en e-post til support@boardly.online eller bruker angreskjemaet på https://boardly.test/withdrawal.'
    )
    expect(mail.html).toContain('<a href="https://boardly.test/withdrawal"')
    expect(mail.html).toContain('<a href="mailto:support@boardly.online"')
  })

  it('states the request to start at once, with its date, and that the right of withdrawal still applies', async () => {
    const mail = await send()
    const text = visibleText(mail.html)

    expect(text).toContain(
      'At checkout on September 24, 2026 at 2:00 PM UTC you asked us to start Premium immediately and confirmed you had read the withdrawal information; the right of withdrawal still applies for 14 days.'
    )
    expect(text).toContain(
      'I kassen 24. september 2026 kl. 14:00 UTC ba du oss om å starte Premium med en gang og bekreftet at du hadde lest informasjonen om angrerett. Angreretten gjelder likevel i 14 dager.'
    )
    expect(mail.text).toContain('At checkout on September 24, 2026 at 2:00 PM UTC you asked us to start Premium immediately')
  })

  it('links the terms with the version that was agreed to', async () => {
    const mail = await send({ termsVersion: '2026-08-01' })
    const text = visibleText(mail.html)

    expect(text).toContain('The Boardly Terms of Service, version 2026-08-01, apply to this subscription: https://boardly.test/terms.')
    expect(text).toContain('Boardlys vilkår for bruk, versjon 2026-08-01, gjelder for abonnementet: https://boardly.test/terms.')
    expect(mail.html).toContain('<a href="https://boardly.test/terms"')
  })

  it('signs as the company, after both languages', async () => {
    const mail = await send()

    const text = visibleText(mail.html)
    expect(text).toContain('The Boardly team')
    expect(text.indexOf('The Boardly team')).toBeGreaterThan(text.indexOf('Vilkår'))
    expect(mail.text.trimEnd().endsWith('The Boardly team')).toBe(true)
    expect(mail.text).not.toContain('—')
    expect(mail.html).not.toContain('—')
  })

  it('names the seller under the HTML and in the text part once the imprint is set', async () => {
    process.env[NAME_VAR] = 'Ola Nordmann'
    process.env[ADDRESS_VAR] = 'Storgata 1|0155 Oslo'

    const mail = await send()

    expect(mail.html).toContain(
      'Ola Nordmann, Storgata 1, 0155 Oslo, Norway. Email: <a href="mailto:support@boardly.online"'
    )
    expect(mail.html.indexOf('Ola Nordmann')).toBeGreaterThan(mail.html.indexOf('The Boardly team'))
    expect(mail.text.trimEnd().endsWith('Ola Nordmann, Storgata 1, 0155 Oslo, Norway. Email: support@boardly.online')).toBe(true)
  })

  it('renders no seller line while the imprint is unset', async () => {
    const mail = await send()

    expect(mail.html).not.toContain('Norway. Email:')
    expect(mail.text).not.toContain('Norway. Email:')
  })

  it('escapes the username in the HTML and leaves the text part plain', async () => {
    const mail = await send({ username: '<b>Ola</b> & co' })

    expect(mail.html).toContain('Hi &lt;b&gt;Ola&lt;/b&gt; &amp; co,')
    expect(mail.html).not.toContain('<b>Ola</b>')
    expect(mail.text).toContain('Hi <b>Ola</b> & co,')
  })

  it('greets without a name when the account has none', async () => {
    const mail = await send({ username: null })

    expect(mail.text).toContain('Hi,\n')
    expect(mail.text).toContain('Hei,\n')
  })

  it('leaves out the renewal date when Stripe reported no period end', async () => {
    const mail = await send({ renewsAt: null })
    const text = visibleText(mail.html)

    expect(text).toContain('until you cancel.')
    expect(text).not.toContain('Next renewal')
    expect(text).not.toContain('Neste fornyelse')
  })

  it('reports a Resend error as a failed send instead of throwing', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'rate limited' } })
    const mod = loadEmailModule()

    await expect(mod.sendPremiumConfirmationEmail('buyer@example.com', details)).resolves.toEqual({
      success: false,
      error: 'rate limited',
    })
  })

  it('reports a missing API key as a failed send', async () => {
    delete process.env.RESEND_API_KEY
    const mod = loadEmailModule()

    await expect(mod.sendPremiumConfirmationEmail('buyer@example.com', details)).resolves.toEqual({
      success: false,
      error: 'Email service not configured',
    })
    expect(mockSend).not.toHaveBeenCalled()
  })
})
