import type { Prisma } from '@/prisma/client'
import { prisma } from './db'
import { sendTermsChangeNoticeEmail } from './email'
import { emailLanguageFromLocale } from './email-language'
import { apiLogger } from './logger'
import { INACTIVITY_RULE_STARTS } from './terms-version'

const log = apiLogger('terms-change-notice')

export const TERMS_CHANGE_NOTICE_SEND = true

export const TERMS_CHANGE_NOTICE = {
  version: '2026-10-05',
  appliesFrom: INACTIVITY_RULE_STARTS,
} as const

export const TERMS_CHANGE_NOTICE_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

// RFC 2606 reserves these domains; nobody can receive mail there.
const RESERVED_TEST_DOMAINS = ['example.com', 'test.com']

const startOfDay = (day: string) => new Date(`${day}T00:00:00.000Z`)

export function termsChangeNoticeDeadline(): Date {
  return new Date(startOfDay(TERMS_CHANGE_NOTICE.appliesFrom).getTime() - TERMS_CHANGE_NOTICE_DAYS * DAY_MS)
}

export function termsChangeNoticeWhere(): Prisma.UsersWhereInput {
  return {
    isGuest: false,
    bot: null,
    email: { not: null },
    emailVerified: { not: null },
    createdAt: { lt: new Date(startOfDay(TERMS_CHANGE_NOTICE.version).getTime() + DAY_MS) },
    OR: [{ termsNoticeVersion: null }, { termsNoticeVersion: { not: TERMS_CHANGE_NOTICE.version } }],
    NOT: RESERVED_TEST_DOMAINS.map((domain) => ({ email: { endsWith: `@${domain}`, mode: 'insensitive' as const } })),
  }
}

export interface TermsChangeNoticeResult {
  version: string
  approved: boolean
  inTime: boolean
  due: number
  sent: number
  failed: number
}

export interface TermsChangeNoticeOptions {
  now?: Date
  approved?: boolean
  sendEmail?: typeof sendTermsChangeNoticeEmail
  maxSends?: number
  deadlineMs?: number
}

export async function sendTermsChangeNotices(options: TermsChangeNoticeOptions = {}): Promise<TermsChangeNoticeResult> {
  const now = options.now ?? new Date()
  const approved = options.approved ?? TERMS_CHANGE_NOTICE_SEND
  const sendEmail = options.sendEmail ?? sendTermsChangeNoticeEmail
  // Resend's plan allows 100 emails a day and lib/email-send-guard.ts keeps 80 for sign-up and reset mail.
  const maxSends = options.maxSends ?? 20
  const startedAt = Date.now()
  const pastDeadline = () => options.deadlineMs !== undefined && Date.now() - startedAt > options.deadlineMs

  const where = termsChangeNoticeWhere()
  const result: TermsChangeNoticeResult = {
    version: TERMS_CHANGE_NOTICE.version,
    approved,
    inTime: now.getTime() <= termsChangeNoticeDeadline().getTime(),
    due: await prisma.users.count({ where }),
    sent: 0,
    failed: 0,
  }
  if (!approved || !result.inTime || result.due === 0) return result

  const batch = await prisma.users.findMany({
    where,
    select: { id: true, email: true, username: true, language: true },
    orderBy: { createdAt: 'asc' },
    take: maxSends,
  })

  for (const account of batch) {
    if (pastDeadline()) break
    if (!account.email) continue

    const sent = await sendEmail(account.email, {
      username: account.username,
      language: emailLanguageFromLocale(account.language),
      appliesFrom: startOfDay(TERMS_CHANGE_NOTICE.appliesFrom),
      idempotencyKey: `terms-change-notice/${TERMS_CHANGE_NOTICE.version}/${account.id}`,
    })
    if (!sent.success) {
      result.failed += 1
      log.warn('Terms change notice not sent; the run stops and the next one retries', {
        userId: account.id,
        error: sent.error,
      })
      break
    }

    result.sent += 1
    try {
      await prisma.users.updateMany({
        where: { id: account.id },
        data: { termsNoticeVersion: TERMS_CHANGE_NOTICE.version, termsNoticeSentAt: now },
      })
    } catch (error) {
      log.error('Terms change notice sent but not recorded; it will be sent again', error as Error, {
        userId: account.id,
      })
    }
  }

  return result
}
