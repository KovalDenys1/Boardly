import { test, expect } from '@playwright/test'

/**
 * The result dialog fits every screen (#1578): at each size its card sits inside
 * the viewport and nothing in it scrolls, for every state and for the More view.
 * Runs against the dev-only stage at /dev/result, so it needs no lobby and no
 * database rows.
 */
const SIZES = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
]
const STATES = ['win', 'loss', 'draw', 'standings', 'waiting', 'crowd']
const VIEWS = ['main', 'more'] as const

for (const size of SIZES) {
  test(`the result dialog fits ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size)
    for (const state of STATES) {
      for (const view of VIEWS) {
        await page.goto(`/dev/result?state=${state}${view === 'more' ? '&view=more' : ''}`)
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        if (view === 'more') await expect(page.getByTestId('game-result-more')).toBeVisible()
        // The entrance moves and scales the card; measure where it comes to rest.
        await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'))

        const fit = await dialog.evaluate((panel) => {
          const box = panel.getBoundingClientRect()
          return {
            inside: box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight && box.right <= innerWidth,
            scrolls: panel.scrollHeight > panel.clientHeight + 1,
            pageScrollsSideways: document.documentElement.scrollWidth > innerWidth,
          }
        })
        const where = `${state} ${view} at ${size.width}x${size.height}`
        expect.soft(fit.inside, `${where}: the card leaves the viewport`).toBe(true)
        expect.soft(fit.scrolls, `${where}: the card scrolls`).toBe(false)
        expect.soft(fit.pageScrollsSideways, `${where}: the page scrolls sideways`).toBe(false)
      }
    }
  })
}

test('opening the result dialog writes nothing React has to hydrate, so the page logs no mismatch', async ({ page }) => {
  const hydrationErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrat/i.test(message.text())) hydrationErrors.push(message.text().slice(0, 200))
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dev/result?state=win')
  await expect(page.getByRole('dialog')).toBeVisible()
  // The header and the feedback button hydrate late, behind next/dynamic.
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
  expect(hydrationErrors).toEqual([])
  const devIssues = await page.evaluate(() => document.querySelector('nextjs-portal')?.shadowRoot?.textContent?.match(/\d+\s*Issues?/)?.[0] ?? null)
  expect(devIssues).toBeNull()
})

test('nothing paints above the result scrim: floating chat, the spectators\' chat, the feedback button', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/dev/result?state=standings&floating=1')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByTestId('fixture-floating-chat-ready')).toBeAttached()
  await page.waitForFunction(() => {
    const overlay = document.querySelector('[data-testid="game-result-overlay"]')
    return !!overlay && document.getAnimations().every((animation) => {
      const target = (animation.effect as KeyframeEffect | null)?.target
      return !target || !overlay.contains(target) || animation.playState !== 'running'
    })
  })

  const above = await page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="game-result-overlay"]')!
    // Hit-testing skips inert nodes, which would hide a layer that paints above.
    document.querySelectorAll('[inert]').forEach((el) => !overlay.contains(el) && el.removeAttribute('inert'))
    const layers = [...document.querySelectorAll<HTMLElement>('body *')].filter((el) => {
      if (overlay.contains(el) || el.closest('nextjs-portal')) return false
      // react-hot-toast's layer: toasts may stay above.
      if (el.closest('[data-rht-toaster]') || el.querySelector('[data-rht-toaster]')) return false
      const style = getComputedStyle(el)
      const box = el.getBoundingClientRect()
      return (style.position === 'fixed' || style.position === 'sticky') && style.visibility !== 'hidden' && box.width > 0 && box.height > 0
    })
    return layers
      .map((el) => {
        const box = el.getBoundingClientRect()
        const x = Math.min(Math.max(box.left + box.width / 2, 1), innerWidth - 1)
        const y = Math.min(Math.max(box.top + box.height / 2, 1), innerHeight - 1)
        const hit = document.elementFromPoint(x, y)
        return { layer: `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`, covered: !!hit && overlay.contains(hit) }
      })
      .filter((entry) => !entry.covered)
      .map((entry) => entry.layer)
  })
  expect(above).toEqual([])
})
