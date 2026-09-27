import { render, screen } from '@testing-library/react'
import PrivacyNotice from '@/app/privacy/PrivacyNotice'
import { SUPPORT_EMAIL } from '@/lib/organization-json-ld'
import { RETENTION_RULES } from '@/lib/data-retention'
import { CHAT_RETENTION_HOURS, RETENTION_DAYS } from '@/lib/retention-periods'
import { PRIVACY_UPDATED } from '@/lib/terms-version'

// The English bundle, with {{var}} interpolation, the way FaqSection's tests read it.
jest.mock('@/lib/i18n-helpers', () => {
  const english = require('@/locales/en').default
  return {
    useTranslation: () => ({
      i18n: { language: 'en' },
      t: (key: string, vars?: Record<string, string | number>) => {
        const raw = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], english)
        if (typeof raw !== 'string') throw new Error(`missing locale key ${key}`)
        return vars
          ? raw.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))
          : raw
      },
    }),
  }
})

jest.mock('@/lib/db', () => ({ prisma: {} }))

jest.mock('@/lib/consent', () => ({ reopenGoogleConsentMessage: jest.fn() }))

jest.mock('@/lib/feature-flags', () => ({
  ...jest.requireActual('@/lib/feature-flags'),
  isProductionDeployment: jest.fn(() => false),
}))

describe('privacy notice: consent withdrawal and processor locations', () => {
  const { isProductionDeployment } = jest.requireMock('@/lib/feature-flags')
  const { reopenGoogleConsentMessage } = jest.requireMock('@/lib/consent')

  it('offers the consent control on the page itself in production (GDPR Art. 7(3))', () => {
    isProductionDeployment.mockReturnValue(true)
    render(<PrivacyNotice controller={null} />)

    screen.getByRole('button', { name: 'Privacy and cookie settings' }).click()
    expect(reopenGoogleConsentMessage).toHaveBeenCalledTimes(1)
  })

  it('hides it where the consent message does not load', () => {
    isProductionDeployment.mockReturnValue(false)
    render(<PrivacyNotice controller={null} />)

    expect(screen.queryByRole('button', { name: 'Privacy and cookie settings' })).toBeNull()
  })

  it('places Vercel functions and Sentry reports in Frankfurt, not the USA', () => {
    const { container } = render(<PrivacyNotice controller={null} />)
    const text = container.textContent ?? ''
    expect(text).not.toContain('Washington')
    expect(text).toContain('Our server code runs in Frankfurt, Germany')
    expect(text).toContain('Stored in Sentry\'s EU data region in Frankfurt, Germany')
  })
})

describe('privacy notice (#1126)', () => {
  it('names the controller, the contact address and the complaint authority', () => {
    const { container } = render(<PrivacyNotice controller={{ name: 'Test Person', address: 'Street 1, 8500 Narvik' }} />)
    const text = container.textContent ?? ''
    expect(text).toContain('Test Person, Street 1, 8500 Narvik, Norway')
    expect(text).toContain(SUPPORT_EMAIL)
    expect(text).toContain('Datatilsynet')
    expect(screen.getByRole('link', { name: 'datatilsynet.no' })).toHaveAttribute('href', 'https://www.datatilsynet.no')
  })

  it('still renders a contact line when the controller env vars are unset', () => {
    const { container } = render(<PrivacyNotice controller={null} />)
    expect(container.textContent).toContain(SUPPORT_EMAIL)
    expect(container.textContent).not.toContain('{{')
  })

  it('prints the retention periods the cleanup jobs enforce, and no unfilled placeholder', () => {
    const { container } = render(<PrivacyNotice controller={null} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\{\{\w+\}\}/)
    expect(text).toContain(`deleted after ${RETENTION_DAYS.unverifiedAccounts} days`)
    expect(text).toContain(`after ${RETENTION_DAYS.guestIdle} days without activity`)
    expect(text).toContain(`Replays: ${RETENTION_DAYS.replays} days`)
    expect(text).toContain(`Lobby chat: ${CHAT_RETENTION_HOURS} hours`)
    expect(text).toContain(`Games: 12 months after the game ends, we remove the names`)
    expect(text).toContain(`blocked-content reports: ${RETENTION_DAYS.operationalEvents} days`)
    expect(text).toContain(`Administrator log: 24 months`)
    expect(text).toContain(`${RETENTION_DAYS.guestIdentityToken} days from your last visit`)
  })

  // #1130, decision 2026-09-27: games are pseudonymised, not deleted; a lobby in which no
  // game started goes with its games. Inactive accounts are NOT deleted while the Terms do
  // not allow it (TERMS_ALLOW_INACTIVITY_DELETION), so the notice must not say they are.
  it('says games lose their names but keep their results, and that unused accounts are kept', () => {
    const { container } = render(<PrivacyNotice controller={null} />)
    const text = container.textContent ?? ''
    expect(text).toContain('the scores and results stay, tied to a player id instead of a name')
    expect(text).toContain('an inactive lobby in which no game ever started is deleted together with those games')
    expect(text).toContain('its code is released for new lobbies')
    expect(text).toContain('We do not delete an account because it has not been used')
    expect(text).toContain('at least 30 days before it applies')
    expect(text).toContain('is kept until you delete it')
    expect(text).not.toMatch(/inactivity|24 months: we then delete/)

    const locales = {
      en: require('@/locales/en').default,
      no: require('@/locales/no').default,
      ru: require('@/locales/ru').default,
      uk: require('@/locales/uk').default,
    }
    for (const [name, locale] of Object.entries(locales)) {
      const { account, games } = locale.privacyPolicy.purposes
      for (const [field, value, needle] of [
        ['account.retention', account.retention, '30'],
        ['games.retention', games.retention, '{{gamesMonths}}'],
        ['games.retention', games.retention, '{{lobbiesMonths}}'],
      ]) {
        expect({ name, field, ok: value.includes(needle) }).toEqual({ name, field, ok: true })
      }
    }
  })

  // #1226: the leaderboard lists every account, private ones included, and the notice
  // must not still promise that a private profile keeps its name off it.
  it('says the leaderboard shows every username and results, and the picture only where the profile can be seen', () => {
    const { container } = render(<PrivacyNotice controller={null} />)
    const text = container.textContent ?? ''
    expect(text).toContain('shows the username and game results of every account with enough finished games')
    expect(text).toContain('Your picture appears on the leaderboard only to those who can see your profile')
    expect(text).not.toContain('appear on the public leaderboard unless your profile is private')

    const stale = {
      no: 'med mindre profilen er privat.',
      ru: 'видны в общем рейтинге, если профиль не закрыт.',
      uk: 'видно в загальному рейтингу, якщо профіль не закритий.',
    }
    for (const [name, needle] of Object.entries(stale)) {
      const { account } = require(`@/locales/${name}`).default.privacyPolicy.purposes
      expect({ name, stale: account.extra.includes(needle) }).toEqual({ name, stale: false })
    }
  })

  // #1172: player reports keep a copy of what was reported, past the chat TTL and past
  // its author's account, so the notice has to say so in every language.
  it('describes player reports: what is kept, why, who sees it and for how long', () => {
    const { container } = render(<PrivacyNotice controller={null} />)
    const text = container.textContent ?? ''
    expect(text).toContain('Reports of chat, drawings and profiles')
    expect(text).toContain('Reports, including their notification in our Discord feedback channel: 12 months')
    expect(text).toContain('We never tell the reported player who reported them')
    expect(text).toContain('ehandelsloven, section 18')
    expect(text).toContain('the report then loses its link to that account')
    expect(text).toContain(`Lobby chat: ${CHAT_RETENTION_HOURS} hours, except a message someone reports`)

    const locales = {
      en: require('@/locales/en').default,
      no: require('@/locales/no').default,
      ru: require('@/locales/ru').default,
      uk: require('@/locales/uk').default,
    }
    for (const [name, locale] of Object.entries(locales)) {
      const reports = locale.privacyPolicy.purposes.reports
      expect({ name, ok: reports.retention.includes('{{reportsMonths}}') }).toEqual({ name, ok: true })
      expect({ name, ok: reports.basis.includes('ehandelsloven') }).toEqual({ name, ok: true })
      expect({ name, ok: reports.data.includes('Discord') }).toEqual({ name, ok: true })
    }
  })

  it('reads the same numbers the maintenance cron deletes by', () => {
    for (const rule of Object.values(RETENTION_RULES)) {
      expect(rule.days).toBe(RETENTION_DAYS[rule.key])
    }
  })

  it('dates itself from the hand-bumped constant, not the render date', () => {
    const { container } = render(<PrivacyNotice controller={null} />)
    const expected = new Date(`${PRIVACY_UPDATED}T00:00:00Z`).toLocaleDateString('en', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    })
    expect(container.textContent).toContain(`Last updated: ${expected}`)
  })

  it('names Link as merchant of record for Premium, on its own account, with the US transfer (#1179)', () => {
    const { container } = render(<PrivacyNotice controller={null} />)
    const text = container.textContent ?? ''
    expect(text).toContain('Stripe / Link (Sold through Link, LLC)')
    expect(text).toContain(
      'Its affiliate Sold through Link, LLC is the merchant of record for Premium and acts on its own account'
    )
    expect(text).toContain('Sold through Link, LLC: in the USA, so your order data is transferred there')
    expect(text).toContain('Link collects your name, billing address and any tax ID at checkout')
    expect(text).toContain('it shares the order information with us')

    const locales = {
      en: require('@/locales/en').default,
      no: require('@/locales/no').default,
      ru: require('@/locales/ru').default,
      uk: require('@/locales/uk').default,
    }
    for (const [name, locale] of Object.entries(locales)) {
      const recipient = locale.privacyPolicy.recipients.stripe
      const premium = locale.privacyPolicy.purposes.premium
      expect({ name, ok: recipient.purpose.includes('Sold through Link, LLC') }).toEqual({ name, ok: true })
      expect({ name, ok: recipient.where.includes('Sold through Link, LLC') }).toEqual({ name, ok: true })
      expect({ name, ok: premium.data.includes('Sold through Link, LLC') }).toEqual({ name, ok: true })
      expect({ name, ok: premium.retention.includes('Link') }).toEqual({ name, ok: true })
    }
  })

  it('names every processor the code uses, and Discord Linked Roles', () => {
    const { container } = render(<PrivacyNotice controller={null} />)
    const text = container.textContent ?? ''
    for (const name of ['Supabase', 'Vercel', 'Upstash', 'Resend', 'Stripe', 'Sentry', 'Discord', 'Google', 'GitHub']) {
      expect(text).toContain(name)
    }
    expect(text).toContain('Linked Roles')
  })
})
