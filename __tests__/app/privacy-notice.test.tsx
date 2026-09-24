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
    expect(text).toContain(`Games: 12 months after the game ends`)
    expect(text).toContain(`blocked-content reports: ${RETENTION_DAYS.operationalEvents} days`)
    expect(text).toContain(`Administrator log: 24 months`)
    expect(text).toContain(`${RETENTION_DAYS.guestIdentityToken} days from your last visit`)
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

  it('names every processor the code uses, and Discord Linked Roles', () => {
    const { container } = render(<PrivacyNotice controller={null} />)
    const text = container.textContent ?? ''
    for (const name of ['Supabase', 'Vercel', 'Upstash', 'Resend', 'Stripe', 'Sentry', 'Discord', 'Google', 'GitHub']) {
      expect(text).toContain(name)
    }
    expect(text).toContain('Linked Roles')
  })
})
