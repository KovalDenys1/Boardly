import { test, expect, type Page } from '@playwright/test'

// Layout is the subject, so the session and the API answers come from page.route rather than accounts and tokens in the database.
const USER = { id: 'e2e-auth-reach', name: 'Reach Check', email: 'reach-check@example.test' }

type State = {
  name: string
  path: string
  signedIn?: boolean
  mock?: (page: Page) => Promise<void>
  /** Brings the page into the state; resolves once its heading is drawn. */
  reach?: (page: Page) => Promise<void>
}

const answer = (path: string, status: number, json: unknown) => async (page: Page) => {
  await page.route(`**${path}`, (route) => route.fulfill({ status, json }))
}

async function confirmDeletion(page: Page) {
  await page.locator('main input').fill('DELETE')
  await page.locator('main button').first().click()
  await expect(page.locator('main input')).toHaveCount(0)
}

const STATES: State[] = [
  { name: 'delete-account without a token', path: '/auth/delete-account' },
  {
    name: 'delete-account asking for confirmation',
    path: '/auth/delete-account?token=e2e-reach',
    reach: (page) => expect(page.locator('main input')).toBeVisible(),
  },
  {
    name: 'delete-account with an expired token',
    path: '/auth/delete-account?token=e2e-reach',
    mock: answer('/api/user/delete-account', 400, { error: 'Token expired' }),
    reach: confirmDeletion,
  },
  {
    name: 'delete-account once deleted',
    path: '/auth/delete-account?token=e2e-reach',
    mock: answer('/api/user/delete-account', 200, { success: true }),
    reach: confirmDeletion,
  },
  { name: 'verify-email without a token', path: '/auth/verify-email' },
  {
    name: 'verify-email after a verified link',
    path: '/auth/verify-email?token=e2e-reach',
    mock: answer('/api/auth/verify-email', 200, { success: true, signedOut: true }),
  },
  {
    name: 'verify-email after a failed link',
    path: '/auth/verify-email?token=e2e-reach',
    mock: answer('/api/auth/verify-email', 400, { error: 'Invalid or expired verification link' }),
  },
  { name: 'error-oauth signed out', path: '/auth/error-oauth?error=OAuthAccountNotLinked&provider=discord' },
  { name: 'error-oauth signed in', path: '/auth/error-oauth?error=OAuthAccountNotLinked&provider=discord', signedIn: true },
  { name: 'login', path: '/auth/login' },
  { name: 'register', path: '/auth/register' },
  { name: 'forgot-password', path: '/auth/forgot-password' },
  { name: 'reset-password without a token', path: '/auth/reset-password' },
  { name: 'reset-password with a token', path: '/auth/reset-password?token=e2e-reach' },
]

/**
 * Every control, line of text and card on the page, named, that a visitor cannot scroll to: past the document's scroll
 * range, cut off by a container that cannot scroll, or above the start of one that can (a centred column taller
 * than its box). Also every button or link whose label is wider than itself, which spills past its background.
 */
async function unreachableContent(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = []
    const range = document.scrollingElement!.scrollHeight
    const selector = 'a[href], button, input, select, textarea, [tabindex], h1, h2, h3, p, li, label, main [class*="card"]'
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const box = el.getBoundingClientRect()
      // 1px boxes are visually hidden on purpose, like the skip link until it takes focus.
      if (box.width <= 1 || box.height <= 1 || getComputedStyle(el).visibility === 'hidden') continue
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().slice(0, 40)
      if (box.top + window.scrollY < -1 || box.bottom + window.scrollY > range + 1) found.push(`${name}: outside the page's scroll range`)
      if (el.matches('a[href], button') && el.scrollWidth > el.clientWidth + 1) found.push(`${name}: label wider than its control`)
      for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const overflow = getComputedStyle(parent).overflowY
        if (overflow === 'visible') continue
        const frame = parent.getBoundingClientRect()
        if (overflow === 'hidden' || overflow === 'clip') {
          if (box.top < frame.top - 1 || box.bottom > frame.bottom + 1) found.push(`${name}: cut off by a box that cannot scroll`)
        } else if (box.top - frame.top + parent.scrollTop < -1) {
          found.push(`${name}: above the start of its scroll box`)
        }
      }
    }
    return found
  })
}

for (const locale of ['en', 'no', 'ru', 'uk', 'de', 'es']) {
  for (const state of STATES) {
    test(`${state.name} can scroll to all of its content at 320x568 in ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 })
      await page.addInitScript((language) => {
        localStorage.setItem('i18nextLng', language)
        localStorage.setItem('language', language)
      }, locale)
      await page.route('**/api/auth/session', (route) =>
        route.fulfill({ json: state.signedIn ? { user: USER, expires: '2099-01-01T00:00:00.000Z' } : {} })
      )
      await state.mock?.(page)

      await page.goto(state.path)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await state.reach?.(page)
      await expect(page.locator('main h1')).toBeVisible()

      expect(await unreachableContent(page)).toEqual([])
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth)).toBeLessThanOrEqual(320)
    })
  }
}
