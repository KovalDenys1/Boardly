/**
 * The seller's name and home address in emails (#1227, decision 2026-09-27):
 * only the Premium purchase confirmation carries them, because angrerettloven
 * section 18 is the one place a Boardly email has to repeat the seller's
 * identity on a durable medium. Every other email keeps the company voice -
 * "The Boardly team" and support@boardly.online - and never a private
 * person's name or home address. Resend is mocked at the module boundary so
 * the assertions run against the HTML the code hands it, and lib/email is
 * loaded fresh per test because it reads RESEND_API_KEY once at import.
 */

const mockSend = jest.fn()

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

type EmailModule = typeof import('@/lib/email')

const NAME_VAR = 'NEXT_PUBLIC_SELLER_LEGAL_NAME'
const ADDRESS_VAR = 'NEXT_PUBLIC_SELLER_ADDRESS'
const CONFIRMATION = 'sendPremiumConfirmationEmail'

/**
 * One call per exported send* function. The test below checks this map
 * against the module's exports, so a new template cannot ship without being
 * listed here, and therefore without being checked for a leaked seller
 * identity.
 */
const sends: Record<string, (m: EmailModule) => Promise<unknown>> = {
  sendVerificationEmail: (m) => m.sendVerificationEmail('player@example.com', 'token', 'Ola'),
  sendUnverifiedAccountWarningEmail: (m) =>
    m.sendUnverifiedAccountWarningEmail('player@example.com', 'token', 'Ola', 3),
  sendPasswordResetEmail: (m) => m.sendPasswordResetEmail('player@example.com', 'token'),
  sendSecurityPasswordResetEmail: (m) => m.sendSecurityPasswordResetEmail('player@example.com', 'Ola'),
  sendWelcomeEmail: (m) => m.sendWelcomeEmail('player@example.com', 'Ola'),
  sendGameInviteEmail: (m) =>
    m.sendGameInviteEmail('player@example.com', 'Ola', 'Kari', 'Friday night', 'yahtzee', 'https://boardly.test/lobby/ABC123'),
  sendAccountDeletionEmail: (m) => m.sendAccountDeletionEmail('player@example.com', 'token', 'Ola'),
  sendEmailChangeNoticeEmail: (m) =>
    m.sendEmailChangeNoticeEmail('old@example.com', 'new@example.com', 'Ola'),
  [CONFIRMATION]: (m) =>
    m.sendPremiumConfirmationEmail('player@example.com', {
      username: 'Ola',
      plan: 'monthly',
      amountTotal: 299,
      currency: 'usd',
      renewsAt: new Date('2026-10-24T14:00:00Z'),
      consentAt: new Date('2026-09-24T14:00:00Z'),
      termsVersion: '2026-09-24',
    }),
  sendSubscriptionNoticeEmail: (m) =>
    m.sendSubscriptionNoticeEmail('player@example.com', {
      username: 'Ola',
      plan: 'yearly',
      unitAmount: 2999,
      currency: 'usd',
      renewsAt: new Date('2027-09-03T00:00:00Z'),
    }),
  sendInactiveAccountWarningEmail: (m) =>
    m.sendInactiveAccountWarningEmail('player@example.com', {
      username: 'Ola',
      deleteOn: new Date('2027-12-19T03:00:00Z'),
    }),
}

const OTHER_SENDS = Object.keys(sends).filter((name) => name !== CONFIRMATION)

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

async function sentHtml(name: string, mod: EmailModule): Promise<string> {
  mockSend.mockClear()
  await sends[name](mod)
  expect(mockSend).toHaveBeenCalledTimes(1)
  return mockSend.mock.calls[0][0].html as string
}

describe('the seller identity stays out of every email but the purchase confirmation (#1227)', () => {
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

  it('covers every send function lib/email exports', () => {
    const mod = loadEmailModule()
    const exported = Object.keys(mod).filter((key) => key.startsWith('send')).sort()
    expect(exported).toEqual(Object.keys(sends).sort())
  })

  it('puts the seller name and address only under the purchase confirmation once both variables are set', async () => {
    process.env[NAME_VAR] = 'Ola Nordmann'
    process.env[ADDRESS_VAR] = 'Storgata 1|0155 Oslo'
    const mod = loadEmailModule()

    const confirmationHtml = await sentHtml(CONFIRMATION, mod)
    expect(confirmationHtml).toContain(
      'Ola Nordmann, Storgata 1, 0155 Oslo, Norway. Email: <a href="mailto:support@boardly.online"'
    )
    // Inside the body, after the template's own content, once.
    const footerAt = confirmationHtml.indexOf('Ola Nordmann, Storgata 1')
    expect(footerAt).toBeGreaterThan(confirmationHtml.indexOf('<body'))
    expect(footerAt).toBeLessThan(confirmationHtml.indexOf('</body>'))
    expect(confirmationHtml.indexOf('Ola Nordmann, Storgata 1', footerAt + 1)).toBe(-1)

    for (const name of OTHER_SENDS) {
      const html = await sentHtml(name, mod)
      expect(html).not.toContain('Ola Nordmann')
      expect(html).not.toContain('Storgata 1')
    }
  })

  it('gives every other email the company sign-off and a mailto link to support, never a home address', async () => {
    process.env[NAME_VAR] = 'Ola Nordmann'
    process.env[ADDRESS_VAR] = 'Storgata 1|0155 Oslo'
    const mod = loadEmailModule()

    for (const name of OTHER_SENDS) {
      const html = await sentHtml(name, mod)
      expect(html).toContain('The Boardly team')
      expect(html).toContain('mailto:support@boardly.online')
      expect(html).not.toContain('Norway.')
    }
  })

  it('escapes the seller name and address in the purchase confirmation', async () => {
    process.env[NAME_VAR] = 'Nordmann & Sons <AS>'
    process.env[ADDRESS_VAR] = 'Storgata "1"|0155 Oslo'
    const mod = loadEmailModule()

    const html = await sentHtml(CONFIRMATION, mod)
    expect(html).toContain('Nordmann &amp; Sons &lt;AS&gt;, Storgata &quot;1&quot;, 0155 Oslo, Norway.')
    expect(html).not.toContain('<AS>')
  })

  it('renders no seller footer on the confirmation while the variables are unset or half set, but still the company sign-off elsewhere', async () => {
    delete process.env[NAME_VAR]
    delete process.env[ADDRESS_VAR]
    let mod = loadEmailModule()

    expect(await sentHtml(CONFIRMATION, mod)).not.toContain('Norway. Email:')
    for (const name of OTHER_SENDS) {
      const html = await sentHtml(name, mod)
      expect(html).not.toContain('Norway. Email:')
      expect(html).toContain('The Boardly team')
      expect(html).toContain('mailto:support@boardly.online')
    }

    process.env[NAME_VAR] = 'Ola Nordmann'
    mod = loadEmailModule()
    const html = await sentHtml(CONFIRMATION, mod)
    expect(html).not.toContain('Ola Nordmann')
    expect(html).not.toContain('Norway. Email:')
  })
})
