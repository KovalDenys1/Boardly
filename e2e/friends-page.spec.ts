import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { test, expect } from './support/fixtures'

/**
 * The friends page's first screen (#1584): a signed-in player with a pending
 * request sees the add-by-code field and that request without scrolling or
 * opening a tab, on a phone and on a desktop, and nothing scrolls sideways.
 * The unit tests prove the parts render; only a browser at a real width can
 * prove they are on the first screen.
 */

const repoRoot = path.join(__dirname, '..')

function fixture(...args: string[]): string {
  return execFileSync('npx', ['tsx', path.join(__dirname, 'support', 'friends-fixture.ts'), ...args], {
    encoding: 'utf8',
    cwd: repoRoot,
  })
}

let account: { email: string; password: string; ids: string[] }

test.beforeAll(() => {
  account = JSON.parse(fixture('seed'))
})

test.afterAll(() => {
  if (account) fixture('cleanup', ...account.ids)
})

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`add-by-code and the pending request are on the first screen at ${viewport.width}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport, baseURL })
    try {
      const csrf = await (await context.request.get('/api/auth/csrf')).json()
      await context.request.post('/api/auth/callback/credentials', {
        form: { csrfToken: csrf.csrfToken, email: account.email, password: account.password, json: 'true' },
      })

      const page = await context.newPage()
      await page.goto('/friends')

      const field = page.getByLabel('Friend code or profile link')
      const accept = page.getByRole('button', { name: 'Accept' })
      await expect(field).toBeVisible({ timeout: 30_000 })
      await expect(accept).toBeVisible()

      for (const element of [field, accept]) {
        const box = await element.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
      }

      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(sideways).toBe(0)
    } finally {
      await context.close()
    }
  })
}
