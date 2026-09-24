/**
 * The operator imprint under every email (#1163). Resend is mocked at the
 * module boundary so the assertions run against the HTML the code hands it,
 * and lib/email is loaded fresh per test because it reads RESEND_API_KEY once
 * at import.
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
const FOOTER_MARKER = ', Norway. Email: <a href="mailto:support@boardly.online"'

/**
 * One call per exported send* function. The test below checks this map
 * against the module's exports, so a new template cannot ship without being
 * listed here, and therefore without the footer being asserted on it.
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

async function sentHtml(name: string, mod: EmailModule): Promise<string> {
  mockSend.mockClear()
  await sends[name](mod)
  expect(mockSend).toHaveBeenCalledTimes(1)
  return mockSend.mock.calls[0][0].html as string
}

describe('email footer with the seller identity', () => {
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

  it('puts the name, address and support email under every template once both variables are set', async () => {
    process.env[NAME_VAR] = 'Ola Nordmann'
    process.env[ADDRESS_VAR] = 'Storgata 1|0155 Oslo'
    const mod = loadEmailModule()

    for (const name of Object.keys(sends)) {
      const html = await sentHtml(name, mod)
      expect(html).toContain(`Ola Nordmann, Storgata 1, 0155 Oslo${FOOTER_MARKER}`)
      // Inside the body, after the template's own content, once.
      const footerAt = html.indexOf('Ola Nordmann, Storgata 1')
      expect(footerAt).toBeGreaterThan(html.indexOf('<body'))
      expect(footerAt).toBeLessThan(html.indexOf('</body>'))
      expect(html.indexOf('Ola Nordmann, Storgata 1', footerAt + 1)).toBe(-1)
    }
  })

  it('sits below the sign-off of the security password reset email', async () => {
    process.env[NAME_VAR] = 'Ola Nordmann'
    process.env[ADDRESS_VAR] = 'Storgata 1|0155 Oslo'
    const mod = loadEmailModule()

    const html = await sentHtml('sendSecurityPasswordResetEmail', mod)
    expect(html.indexOf('The Boardly team')).toBeLessThan(html.indexOf('Ola Nordmann, Storgata 1'))
  })

  it('escapes the name and the address', async () => {
    process.env[NAME_VAR] = 'Nordmann & Sons <AS>'
    process.env[ADDRESS_VAR] = 'Storgata "1"|0155 Oslo'
    const mod = loadEmailModule()

    const html = await sentHtml('sendWelcomeEmail', mod)
    expect(html).toContain('Nordmann &amp; Sons &lt;AS&gt;, Storgata &quot;1&quot;, 0155 Oslo, Norway.')
    expect(html).not.toContain('<AS>')
  })

  it('renders no footer at all while the variables are unset or half set', async () => {
    delete process.env[NAME_VAR]
    delete process.env[ADDRESS_VAR]
    let mod = loadEmailModule()
    for (const name of Object.keys(sends)) {
      expect(await sentHtml(name, mod)).not.toContain('Norway. Email:')
    }

    process.env[NAME_VAR] = 'Ola Nordmann'
    mod = loadEmailModule()
    const html = await sentHtml('sendWelcomeEmail', mod)
    expect(html).not.toContain('Ola Nordmann')
    expect(html).not.toContain('Norway. Email:')
  })
})
