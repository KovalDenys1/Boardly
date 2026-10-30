import { test, expect, type Page } from '@playwright/test'

// Layout only: two public, prerendered pages, nothing in the database.
test.use({ isMobile: true, hasTouch: true })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('boardly_onboarding', 'completed')
    } catch {
      // Storage off: the welcome sheet may open, which changes no card's box.
    }
  })
})

async function headingLines(page: Page): Promise<number> {
  return page.locator('h1').first().evaluate((h1) => {
    const lineHeight = parseFloat(getComputedStyle(h1).lineHeight)
    return Math.round(h1.getBoundingClientRect().height / lineHeight)
  })
}

// #1560: a phone shows several games per screen.
test.describe('game cards on a phone', () => {
  test('/games at 320x640: the heading takes two lines and a whole game card is in the first screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto('/games')

    const card = page.locator('[data-game-card]').first()
    await expect(card).toBeVisible()
    expect(await headingLines(page)).toBeLessThanOrEqual(2)
    const box = await card.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(640)
  })

  test('home at 390x844: every game card is a short row', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    const cards = page.locator('[data-game-card]')
    await expect(cards.first()).toBeAttached()
    const heights = await cards.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
    expect(heights.length).toBeGreaterThanOrEqual(11)
    for (const height of heights) expect(height).toBeLessThanOrEqual(140)
  })
})
