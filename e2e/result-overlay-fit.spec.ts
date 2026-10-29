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
