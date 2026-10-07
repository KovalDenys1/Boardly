// @ts-nocheck - prisma is a lightweight mock.
import { prisma } from '@/lib/db'
import {
  TERMS_CHANGE_NOTICE,
  TERMS_CHANGE_NOTICE_SEND,
  sendTermsChangeNotices,
  termsChangeNoticeDeadline,
  termsChangeNoticeWhere,
} from '@/lib/terms-change-notice'
import { INACTIVITY_RULE_STARTS, TERMS_VERSION } from '@/lib/terms-version'

jest.mock('@/lib/db', () => ({
  prisma: { users: { count: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() } },
}))
jest.mock('@/lib/email', () => ({ sendTermsChangeNoticeEmail: jest.fn() }))
const mockResendSend = jest.fn()
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockResendSend } })),
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const NOW = new Date('2026-11-01T03:00:00.000Z')
const accounts = [
  { id: 'u1', email: 'one@example.com', username: 'one' },
  { id: 'u2', email: 'two@example.com', username: null },
]

describe('Terms change notice (#1224)', () => {
  let sendEmail: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    sendEmail = jest.fn().mockResolvedValue({ success: true })
    prisma.users.count.mockResolvedValue(accounts.length)
    prisma.users.findMany.mockResolvedValue(accounts)
    prisma.users.updateMany.mockResolvedValue({ count: 1 })
  })

  const run = (overrides = {}) => sendTermsChangeNotices({ now: NOW, approved: true, sendEmail, ...overrides })

  it('is about the current Terms and the day the inactive-account rule starts', () => {
    expect(TERMS_CHANGE_NOTICE).toEqual({ version: TERMS_VERSION, appliesFrom: INACTIVITY_RULE_STARTS })
    expect(termsChangeNoticeDeadline().toISOString()).toBe('2026-12-02T00:00:00.000Z')
  })

  it('is approved to send', () => {
    expect(TERMS_CHANGE_NOTICE_SEND).toBe(true)
  })

  it('only counts while the send is not approved', async () => {
    const result = await sendTermsChangeNotices({ now: NOW, approved: false, sendEmail })

    expect(result).toEqual({ version: '2026-10-05', approved: false, inTime: true, due: 2, sent: 0, failed: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(prisma.users.findMany).not.toHaveBeenCalled()
    expect(prisma.users.updateMany).not.toHaveBeenCalled()
  })

  it('owes it to registered people with a real verified address who had an account when the version was published', () => {
    expect(termsChangeNoticeWhere()).toEqual({
      isGuest: false,
      bot: null,
      email: { not: null },
      emailVerified: { not: null },
      createdAt: { lt: new Date('2026-10-06T00:00:00.000Z') },
      OR: [{ termsNoticeVersion: null }, { termsNoticeVersion: { not: '2026-10-05' } }],
      NOT: [
        { email: { endsWith: '@example.com', mode: 'insensitive' } },
        { email: { endsWith: '@test.com', mode: 'insensitive' } },
      ],
    })
  })

  it('emails each account once and records it after Resend has accepted the email', async () => {
    const result = await run()

    expect(result).toMatchObject({ approved: true, inTime: true, due: 2, sent: 2, failed: 0 })
    expect(sendEmail.mock.calls).toEqual([
      ['one@example.com', { username: 'one', language: 'en', appliesFrom: new Date('2027-01-01T00:00:00.000Z'), idempotencyKey: 'terms-change-notice/2026-10-05/u1' }],
      ['two@example.com', { username: null, language: 'en', appliesFrom: new Date('2027-01-01T00:00:00.000Z'), idempotencyKey: 'terms-change-notice/2026-10-05/u2' }],
    ])
    expect(prisma.users.updateMany.mock.calls.map(([call]) => call)).toEqual([
      { where: { id: 'u1' }, data: { termsNoticeVersion: '2026-10-05', termsNoticeSentAt: NOW } },
      { where: { id: 'u2' }, data: { termsNoticeVersion: '2026-10-05', termsNoticeSentAt: NOW } },
    ])
  })

  it('takes at most the nightly batch, oldest account first', async () => {
    await run()

    expect(prisma.users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20, orderBy: { createdAt: 'asc' } })
    )
  })

  it('stops at the first email Resend refuses and leaves that account owed', async () => {
    sendEmail.mockResolvedValueOnce({ success: false, error: 'quota' })

    const result = await run()

    expect(result).toMatchObject({ sent: 0, failed: 1 })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(prisma.users.updateMany).not.toHaveBeenCalled()
  })

  it('sends nothing once 30 days of notice before the change can no longer be given', async () => {
    const result = await run({ now: new Date('2026-12-02T00:00:00.001Z') })

    expect(result).toMatchObject({ approved: true, inTime: false, due: 2, sent: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('writes the mail to each account in its stored language only: Norwegian for no, English for ru and for none (#1331)', async () => {
    process.env.RESEND_API_KEY = 're_test'
    mockResendSend.mockReset()
    mockResendSend.mockResolvedValue({ data: { id: 'email_1' }, error: null })
    const { sendTermsChangeNoticeEmail } = jest.requireActual('@/lib/email')
    prisma.users.count.mockResolvedValue(3)
    prisma.users.findMany.mockResolvedValue([
      { id: 'u1', email: 'no@example.com', username: 'Kari', language: 'no' },
      { id: 'u2', email: 'ru@example.com', username: 'Ivan', language: 'ru' },
      { id: 'u3', email: 'none@example.com', username: 'Sam', language: null },
    ])

    await run({ sendEmail: sendTermsChangeNoticeEmail })

    const mails = Object.fromEntries(mockResendSend.mock.calls.map(([mail]) => [mail.to, mail]))
    expect(mails['no@example.com'].subject).toBe('Boardlys vilkår er oppdatert')
    expect(mails['no@example.com'].text).toContain('Hei Kari,')
    expect(mails['no@example.com'].text).not.toContain('Hi Kari,')
    expect(mails['no@example.com'].html).not.toContain('<div lang="en">')
    for (const [address, name] of [['ru@example.com', 'Ivan'], ['none@example.com', 'Sam']]) {
      expect(mails[address].subject).toBe('An update to the Boardly Terms of Service')
      expect(mails[address].text).toContain(`Hi ${name},`)
      expect(mails[address].text).not.toContain('Hei ')
      expect(mails[address].html).not.toContain('<div lang="nb">')
    }
  })
})
