/**
 * The one layout every mail is drawn in (#1293). The first half reads what
 * lib/email-layout renders from a description of a mail; the second sends every
 * mail lib/email exports, with Resend mocked at the module boundary, and reads
 * what was handed over.
 */

import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { EMAIL_LOGO, escapeHtml, renderEmail, type EmailContent, type EmailLayout } from '@/lib/email-layout'
import { EMAIL_ART_BASE, EMAIL_ART_SCALE, EMAIL_HERO_SIZE, EMAIL_ICON_SIZE, EMAIL_LOGO_SIZE, allEmailArtFiles } from '@/lib/email-art'
import { NOTIFICATION_SETTINGS_SECTION_ID } from '@/lib/public-profile'
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

  it('keeps every picture a mail can show under public/email/, as a PNG drawn at its scale (#1298)', () => {
    expect(new URL(EMAIL_ART_BASE).origin).toBe('https://boardly.online')
    for (const name of allEmailArtFiles()) {
      const file = path.join(process.cwd(), 'public', 'email', name)
      expect(existsSync(file)).toBe(true)
      const png = readFileSync(file)
      expect(png.subarray(1, 4).toString('latin1')).toBe('PNG')
      const [size, scale] = name.startsWith('logo')
        ? [EMAIL_LOGO_SIZE, EMAIL_ART_SCALE.logo]
        : name.startsWith('hero')
          ? [EMAIL_HERO_SIZE, EMAIL_ART_SCALE.hero]
          : [EMAIL_ICON_SIZE, EMAIL_ART_SCALE.icon]
      expect([name, png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([name, size.width * scale, size.height * scale])
      expect(png.length).toBeLessThan(40 * 1024)
    }
  })

  it('shows the light logo to every client and the dark one only in dark mode (#1298)', () => {
    const { html } = renderEmail(notice)
    const body = html.slice(html.indexOf('<body'))

    const light = body.indexOf(`src="${EMAIL_LOGO.light}"`)
    const dark = body.indexOf(`src="${EMAIL_LOGO.dark}"`)
    expect(light).toBeGreaterThan(-1)
    expect(dark).toBeGreaterThan(light)
    const darkTag = body.slice(body.lastIndexOf('<img', dark), body.indexOf('>', dark) + 1)
    expect(darkTag).toContain('class="bd-img-dark" style="display: none;')
    const darkMedia = html.slice(html.indexOf('@media (prefers-color-scheme: dark)'), html.indexOf('\n}\n', html.indexOf('@media (prefers-color-scheme: dark)')))
    expect(darkMedia).toContain('.bd-img-light { display: none !important; }')
    expect(darkMedia).toContain('.bd-img-dark { display: block !important;')
    expect(body.match(/<!--\[if !mso\]><!-->/g)).toHaveLength(1)
  })
})

type EmailModule = typeof import('@/lib/email')
type LayoutModule = typeof import('@/lib/email-layout')
type SenderName = keyof typeof emailSamples
type SentMail = { to: string; replyTo?: string; subject: string; html: string; text: string }

const SENDERS = Object.keys(emailSamples) as SenderName[]
const GMAIL_CLIP_BYTES = 102 * 1024

// The eight mails that have no suite of their own, so what they hand to Resend besides the
// body is pinned here.
const SINGLE_LANGUAGE_MAILS: [SenderName, { subject: string; replyTo?: string; result: object }][] = [
  ['sendVerificationEmail', { subject: 'Confirm your email for Boardly', result: { success: true } }],
  [
    'sendUnverifiedAccountWarningEmail',
    {
      subject: 'Action required: verify your Boardly account in 3 days / Handling kreves: bekreft Boardly-kontoen din innen 3 dager',
      result: { success: true },
    },
  ],
  ['sendPasswordResetEmail', { subject: 'Reset your Boardly password', result: { success: true } }],
  [
    'sendSecurityPasswordResetEmail',
    {
      subject: 'Please set a new Boardly password / Lag et nytt passord for Boardly',
      replyTo: 'support@boardly.online',
      result: { success: true, id: 'email_1' },
    },
  ],
  [
    'sendEmailChangeNoticeEmail',
    {
      subject: 'Your Boardly email address is being changed',
      replyTo: 'support@boardly.online',
      result: { success: true, id: 'email_1' },
    },
  ],
  ['sendWelcomeEmail', { subject: 'Welcome to Boardly, Ola!', result: { success: true } }],
  [
    'sendGameInviteEmail',
    {
      subject: 'Kari invited you to play Guess the Spy on Boardly / Kari inviterte deg til å spille Gjett spionen',
      result: { success: true },
    },
  ],
  ['sendAccountDeletionEmail', { subject: 'Confirm deleting your Boardly account', result: { success: true } }],
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
          block.type === 'paragraph' || block.type === 'note' || block.type === 'lead'
            ? plain(block.content)
            : block.type === 'list'
              ? block.items
              : block.type === 'heading'
                ? [block.text.toUpperCase()]
                : block.type === 'button'
                  ? [block.label, block.href]
                  : block.type === 'callout'
                    ? [block.text]
                    : block.type === 'facts'
                      ? block.rows.map((row) => `${row.label}: ${row.value}`)
                      : block.type === 'details'
                        ? block.sections.flatMap((section) => [
                            section.heading.toUpperCase(),
                            ...(section.paragraphs ?? []).flatMap(plain),
                            ...(section.items ?? []),
                          ])
                        : [block.text, block.href]
        for (const piece of said) expect(mail.text).toContain(piece)
      }
    }
    for (const line of described.footer.flat()) for (const piece of plain(line)) expect(mail.text).toContain(piece)
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

    for (const image of mail.html.match(/<img\b[^>]*>/g) ?? []) expect(image).toContain(`src="${EMAIL_ART_BASE}`)
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
    expect(sources.slice(0, 2)).toEqual([EMAIL_LOGO.light, EMAIL_LOGO.dark])
    for (const source of sources) {
      expect(source.startsWith(EMAIL_ART_BASE)).toBe(true)
      expect(allEmailArtFiles()).toContain(source.slice(EMAIL_ART_BASE.length))
    }
    expect(mail.html).not.toMatch(/url\(|@import|<link\b|<script\b|<iframe\b|<video\b|<object\b|\sbackground="/i)

    const linkSupportHost = new URL(LINK_SUPPORT_URL).host
    const hosts = new Set([...mail.html.matchAll(/https?:\/\/[^\s"'<>),]+/g)].map((match) => new URL(match[0]).host))
    const allowed = name === 'sendPremiumConfirmationEmail' ? ['boardly.online', linkSupportHost] : ['boardly.online']
    expect([...hosts].filter((host) => !allowed.includes(host))).toEqual([])
  })

  it.each(SENDERS)('%s gives every image alt text and fixed dimensions, and a picture beside the logo', async (name) => {
    const mail = await send(name)

    const images = mail.html.match(/<img\b[^>]*>/g) ?? []
    expect(images.length).toBeGreaterThanOrEqual(4)
    expect(images.filter((image) => image.includes('class="bd-img-light"'))).toHaveLength(images.length / 2)
    for (const image of images) {
      expect(image).toMatch(/\salt="[^"]+"/)
      expect(image).toMatch(/\swidth="\d+"/)
      expect(image).toMatch(/\sheight="\d+"/)
    }
  })

  it.each(SENDERS)('%s links to the email settings in both parts, and says why it came (#1298)', async (name) => {
    const mail = await send(name)
    const settings = `https://boardly.online/profile?tab=settings#${NOTIFICATION_SETTINGS_SECTION_ID}`

    expect(mail.html).toContain(`href="${escapeHtml(settings)}"`)
    expect(mail.html).toContain('>Email settings</a>')
    expect(mail.text).toContain(`Email settings (${settings})`)
    if (name === 'sendGameInviteEmail') {
      expect(mail.text).toContain('You get this because you and Kari are friends on Boardly.')
      expect(mail.text).not.toContain('We always send this email')
    } else {
      expect(mail.text).toMatch(/We (always send this email because|send this email once)/)
      expect(mail.text).not.toContain('unsubscribe')
    }
  })

  it.each(SENDERS.filter((name) => name !== 'sendGameInviteEmail'))('%s carries no List-Unsubscribe header', async (name) => {
    const mail = (await send(name)) as SentMail & { headers?: Record<string, string> }

    expect(mail.headers?.['List-Unsubscribe']).toBeUndefined()
  })

  it('gives the invite a signed one-click unsubscribe link and the RFC 8058 headers (#1298)', async () => {
    process.env.NEXTAUTH_SECRET = 'test-secret'
    const [recipientName, senderName, lobbyName, gameType, inviteUrl] = emailSamples.sendGameInviteEmail
    const mail = (await send('sendGameInviteEmail', [recipientName, senderName, lobbyName, gameType, inviteUrl, { userId: 'friend-1' }])) as SentMail & {
      headers: Record<string, string>
    }

    const url = mail.headers['List-Unsubscribe'].slice(1, -1)
    expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(url.startsWith('https://boardly.online/api/notifications/unsubscribe?token=')).toBe(true)
    const { verifyNotificationUnsubscribeToken } = jest.requireActual('@/lib/unsubscribe-token')
    expect(verifyNotificationUnsubscribeToken(new URL(url).searchParams.get('token'))).toMatchObject({
      userId: 'friend-1',
      type: 'gameInvites',
    })
    expect(mail.html).toContain(`href="${escapeHtml(url)}"`)
    expect(mail.text).toContain(`Stop game invite emails (${url})`)
  })

  it('writes in the one language it is given, and in English then Norwegian without one (#1298)', async () => {
    const norwegian = await send('sendWelcomeEmail', ['Ola', 'nb'])
    expect(norwegian.subject).toBe('Velkommen til Boardly, Ola!')
    expect(norwegian.html).toContain('<div lang="nb">')
    expect(norwegian.html).not.toContain('<div lang="en">')
    expect(norwegian.text).toContain('E-postinnstillinger')
    expect(norwegian.text).not.toContain('Email settings')

    const english = await send('sendPasswordResetEmail', ['token', 'en'])
    expect(english.html).toContain('<div lang="en">')
    expect(english.html).not.toContain('<div lang="nb">')

    const both = await send('sendWelcomeEmail', ['Ola'])
    expect(both.subject).toBe('Welcome to Boardly, Ola! / Velkommen til Boardly, Ola!')
    expect(both.html.indexOf('<div lang="en">')).toBeLessThan(both.html.indexOf('<div lang="nb">'))
    expect(both.html.match(/class="bd-img-light"/g)).toHaveLength(2)

    const notice = await send('sendSuspensionNoticeEmail', [{ ...emailSamples.sendSuspensionNoticeEmail[0], language: 'nb' }])
    expect(notice.subject).toBe('Boardly-kontoen din er suspendert')
    expect(notice.text).not.toContain('Questions?')
  })
})
