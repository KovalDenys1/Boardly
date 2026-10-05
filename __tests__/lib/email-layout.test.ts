/**
 * The one layout every mail is drawn in (#1293). The first half reads what
 * lib/email-layout renders from a description of a mail; the second sends every
 * mail lib/email exports, with Resend mocked at the module boundary, and reads
 * what was handed over.
 */

import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { EMAIL_LOGO, escapeHtml, renderEmail, type EmailContent, type EmailLayout } from '@/lib/email-layout'
import { LINK_SUPPORT_URL } from '@/lib/sold-through-link'
import { emailSamples } from '../../scripts/email-samples'

const mockSend = jest.fn()

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

jest.mock('@/lib/email-layout', () => {
  const actual = jest.requireActual('@/lib/email-layout')
  return { ...actual, renderEmail: jest.fn(actual.renderEmail) }
})

const notice: EmailLayout = {
  preheader: 'Your account is fine.',
  sheets: [
    {
      lang: 'en',
      title: 'An account notice',
      blocks: [
        { type: 'paragraph', content: 'Hi <b>Ola</b>,' },
        { type: 'heading', text: 'What to do' },
        { type: 'paragraph', content: 'Open https://boardly.online/profile or write to support@boardly.online.' },
        { type: 'button', label: 'Open profile', href: 'https://boardly.online/profile?tab=premium&from=mail' },
        { type: 'fallbackLink', text: 'Or open this link:', href: 'https://boardly.online/profile?tab=premium&from=mail' },
      ],
    },
    {
      lang: 'nb',
      title: 'Et varsel om kontoen',
      blocks: [
        { type: 'paragraph', content: 'Hei Ola,' },
        { type: 'heading', text: 'Dette gjør du' },
        { type: 'paragraph', content: 'Åpne https://boardly.online/profile.' },
      ],
    },
  ],
  footer: [['Questions? Reply to this email.', 'Spørsmål? Svar på denne e-posten.'], ['The Boardly team']],
  links: ['https://boardly.online/profile'],
}

describe('the shared email layout (#1293)', () => {
  it('draws one labelled sheet per language, in the order given, and no label on a mail in one language', () => {
    const { html } = renderEmail(notice)

    expect(html.indexOf('<div lang="en">')).toBeGreaterThan(-1)
    expect(html.indexOf('<div lang="en">')).toBeLessThan(html.indexOf('<div lang="nb">'))
    expect(html).toContain('>English</span>')
    expect(html).toContain('>Norsk &darr;</span>')
    expect(html).toContain('>English &uarr;</span>')
    expect(html).toContain('>Norsk</span>')

    const single = renderEmail({ ...notice, sheets: [notice.sheets[0]] }).html
    expect(single).not.toContain('>English</span>')
    expect(single).not.toContain('Norsk')
  })

  it('escapes the copy and links only the listed addresses and the support mailbox', () => {
    const { html } = renderEmail(notice)

    expect(html).toContain('Hi &lt;b&gt;Ola&lt;/b&gt;,')
    expect(html).not.toContain('<b>Ola</b>')
    expect(html).toContain('<a href="https://boardly.online/profile"')
    expect(html).toContain('<a href="mailto:support@boardly.online"')
    expect(html).toContain('<a href="https://boardly.online/profile?tab=premium&amp;from=mail"')
  })

  it('carries the preheader hidden at the top of the body', () => {
    const { html } = renderEmail(notice)

    const body = html.slice(html.indexOf('<body'))
    expect(body.indexOf('Your account is fine.')).toBeLessThan(body.indexOf('<img'))
    expect(body).toMatch(/<div style="display: none;[^"]*">Your account is fine\./)
  })

  it('writes the plain-text part from the same content: the title, headings over their paragraphs, a rule between languages', () => {
    const { text } = renderEmail(notice)

    expect(text).toBe(
      [
        'An account notice',
        'Hi <b>Ola</b>,',
        'WHAT TO DO\nOpen https://boardly.online/profile or write to support@boardly.online.',
        'Open profile: https://boardly.online/profile?tab=premium&from=mail',
        'Or open this link:\nhttps://boardly.online/profile?tab=premium&from=mail',
        '----',
        'Et varsel om kontoen',
        'Hei Ola,',
        'DETTE GJØR DU\nÅpne https://boardly.online/profile.',
        '----',
        'Questions? Reply to this email.\nSpørsmål? Svar på denne e-posten.',
        'The Boardly team',
      ].join('\n\n')
    )
  })

  it('points the logo at a PNG under public/ that is three times the size it is drawn at', () => {
    const file = path.join(process.cwd(), 'public', new URL(EMAIL_LOGO.src).pathname)

    expect(new URL(EMAIL_LOGO.src).origin).toBe('https://boardly.online')
    expect(existsSync(file)).toBe(true)
    const png = readFileSync(file)
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(EMAIL_LOGO.width * 3)
    expect(png.readUInt32BE(20)).toBe(EMAIL_LOGO.height * 3)
  })
})

type EmailModule = typeof import('@/lib/email')
type LayoutModule = typeof import('@/lib/email-layout')
type SenderName = keyof typeof emailSamples
type SentMail = { to: string; replyTo?: string; subject: string; html: string; text: string }

const SENDERS = Object.keys(emailSamples) as SenderName[]
const GMAIL_CLIP_BYTES = 102 * 1024

// The eight mails in one language have no suite of their own, so what they hand to Resend
// besides the body is pinned here.
const SINGLE_LANGUAGE_MAILS: [SenderName, { subject: string; replyTo?: string; result: object }][] = [
  ['sendVerificationEmail', { subject: 'Verify your email - Boardly', result: { success: true } }],
  [
    'sendUnverifiedAccountWarningEmail',
    { subject: 'Action required: verify your Boardly account in 3 days', result: { success: true } },
  ],
  ['sendPasswordResetEmail', { subject: 'Reset your password - Boardly', result: { success: true } }],
  [
    'sendSecurityPasswordResetEmail',
    { subject: 'Please set a new Boardly password', replyTo: 'support@boardly.online', result: { success: true, id: 'email_1' } },
  ],
  [
    'sendEmailChangeNoticeEmail',
    {
      subject: 'Your Boardly email address is being changed',
      replyTo: 'support@boardly.online',
      result: { success: true, id: 'email_1' },
    },
  ],
  ['sendWelcomeEmail', { subject: 'Welcome to Boardly! 🎲', result: { success: true } }],
  ['sendGameInviteEmail', { subject: 'Kari invited you to play guess the spy on Boardly', result: { success: true } }],
  ['sendAccountDeletionEmail', { subject: 'Confirm Account Deletion - Boardly', result: { success: true } }],
]

const HOSTILE = `"><img src=x onerror=1><script>alert(1)</script>'`
const ENUM_FIELDS = ['plan', 'provider', 'currency']

function hostile(value: unknown, key = ''): unknown {
  if (typeof value === 'string') return ENUM_FIELDS.includes(key) ? value : HOSTILE
  if (Array.isArray(value)) return value.map((item) => hostile(item))
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([field, inner]) => [field, hostile(inner, field)]))
  }
  return value
}

function plain(content: EmailContent): string[] {
  const parts = typeof content === 'string' ? [content] : content
  return parts.map((part) => (typeof part === 'string' ? part : 'strong' in part ? part.strong : part.text))
}

describe('every mail lib/email sends (#1293)', () => {
  const originalEnv = { ...process.env }
  let email: EmailModule
  let layout: jest.Mocked<LayoutModule>

  beforeEach(() => {
    mockSend.mockReset()
    mockSend.mockResolvedValue({ data: { id: 'email_1' }, error: null })
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.NEXTAUTH_URL = 'https://boardly.online'
    process.env.NEXT_PUBLIC_SELLER_LEGAL_NAME = 'Ola Nordmann'
    process.env.NEXT_PUBLIC_SELLER_ADDRESS = 'Storgata 1|0155 Oslo'
    jest.isolateModules(() => {
      layout = require('@/lib/email-layout') as jest.Mocked<LayoutModule>
      email = require('@/lib/email') as EmailModule
    })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  const call = (name: SenderName, args: unknown[] = emailSamples[name]) =>
    (email[name] as unknown as (to: string, ...args: unknown[]) => Promise<unknown>)('player@example.com', ...args)

  async function send(name: SenderName, args?: unknown[]): Promise<SentMail> {
    mockSend.mockClear()
    layout.renderEmail.mockClear()
    await call(name, args)
    expect(mockSend).toHaveBeenCalledTimes(1)
    return mockSend.mock.calls[0][0] as SentMail
  }

  it('has a template and a sample for every send function', () => {
    const exported = Object.keys(email).filter((key) => key.startsWith('send')).sort()

    expect(Object.keys(email.emailTemplates).sort()).toEqual(exported)
    expect([...SENDERS].sort()).toEqual(exported)
  })

  it.each(SINGLE_LANGUAGE_MAILS)('%s keeps its recipient, subject, reply address and answer', async (name, expected) => {
    mockSend.mockClear()
    const result = await call(name)
    const mail = mockSend.mock.calls[0][0] as SentMail

    expect(result).toEqual(expected.result)
    expect(mail.to).toBe('player@example.com')
    expect(mail.subject).toBe(expected.subject)
    expect(mail.replyTo).toBe(expected.replyTo)
  })

  it.each(SENDERS)('%s reports a refused send instead of throwing', async (name) => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'quota' } })

    await expect(call(name)).resolves.toEqual({ success: false, error: 'quota' })
  })

  it.each(SENDERS)('%s hands Resend exactly what the shared layout rendered', async (name) => {
    const mail = await send(name)

    expect(layout.renderEmail).toHaveBeenCalledTimes(1)
    const rendered = layout.renderEmail.mock.results[0].value as { html: string; text: string }
    expect(mail.html).toBe(rendered.html)
    expect(mail.text).toBe(rendered.text)
  })

  it.each(SENDERS)('%s stays under the size Gmail clips a mail at', async (name) => {
    const mail = await send(name)

    expect(Buffer.byteLength(mail.html, 'utf8')).toBeLessThan(GMAIL_CLIP_BYTES)
  })

  it.each(SENDERS)('%s says in its plain-text part everything its HTML part says', async (name) => {
    const mail = await send(name)
    const described = layout.renderEmail.mock.calls[0][0]

    for (const sheet of described.sheets) {
      expect(mail.html).toContain(`>${escapeHtml(sheet.title)}</h1>`)
      expect(mail.text).toContain(sheet.title)
      for (const block of sheet.blocks) {
        const said =
          block.type === 'paragraph' || block.type === 'note'
            ? plain(block.content)
            : block.type === 'list'
              ? block.items
              : block.type === 'heading'
                ? [block.text.toUpperCase()]
                : block.type === 'button'
                  ? [block.label, block.href]
                  : block.type === 'callout'
                    ? [block.text]
                    : [block.text, block.href]
        for (const piece of said) expect(mail.text).toContain(piece)
      }
    }
    for (const line of described.footer.flat()) expect(mail.text).toContain(line)
    expect(mail.text).not.toMatch(/<\/?(?:p|div|table|a|h\d|br)\b/)
  })

  it.each(SENDERS)('%s opens with a preheader taken from its own copy', async (name) => {
    const mail = await send(name)
    const { preheader } = layout.renderEmail.mock.calls[0][0]

    expect(preheader.length).toBeGreaterThan(20)
    expect(mail.html).toContain(`">${escapeHtml(preheader)}&#847;`)
    expect(mail.text).toContain(preheader.split('. ')[0])
  })

  it.each(SENDERS)('%s lets no argument become markup', async (name) => {
    const mail = await send(name, hostile(emailSamples[name]) as unknown[])

    expect(mail.html.match(/<img\b/g)).toHaveLength(1)
    expect(mail.html).not.toContain('<script')
    expect(mail.html).not.toContain('onerror=1>')
    expect(mail.html).not.toMatch(/href="[^"]*"[^>]*"[^>]*onerror/)
    expect(mail.html).toContain('&lt;img src=x onerror=1&gt;')
  })

  it.each(SENDERS)('%s is signed by the team with the support address, in both parts', async (name) => {
    const mail = await send(name)

    expect(mail.html).toContain('The Boardly team')
    expect(mail.html).toContain('<a href="mailto:support@boardly.online"')
    expect(mail.text).toContain('The Boardly team')
  })

  it.each(SENDERS)('%s loads nothing from a host other than boardly.online', async (name) => {
    const mail = await send(name)

    const sources = [...mail.html.matchAll(/\ssrc="([^"]*)"/g)].map((match) => match[1])
    expect(sources).toEqual([EMAIL_LOGO.src])
    expect(mail.html).not.toMatch(/url\(|@import|<link\b|<script\b|<iframe\b|<video\b|<object\b|\sbackground="/i)

    const linkSupportHost = new URL(LINK_SUPPORT_URL).host
    const hosts = new Set([...mail.html.matchAll(/https?:\/\/[^\s"'<>),]+/g)].map((match) => new URL(match[0]).host))
    const allowed = name === 'sendPremiumConfirmationEmail' ? ['boardly.online', linkSupportHost] : ['boardly.online']
    expect([...hosts].filter((host) => !allowed.includes(host))).toEqual([])
  })

  it.each(SENDERS)('%s gives its image alt text and fixed dimensions', async (name) => {
    const mail = await send(name)

    const images = mail.html.match(/<img\b[^>]*>/g) ?? []
    expect(images).toHaveLength(1)
    for (const image of images) {
      expect(image).toMatch(/\salt="[^"]+"/)
      expect(image).toMatch(/\swidth="\d+"/)
      expect(image).toMatch(/\sheight="\d+"/)
    }
  })
})
