import type { Locator, Page } from '@playwright/test'
import { test, expect } from './support/fixtures'

/**
 * The one in-game header (#1577), measured in a real browser.
 *
 * Which actions show and whether they fit on one row is decided by container
 * queries on the header's own width, which jsdom does not evaluate. The dev
 * contact sheet (/dev/game-chrome) renders the shared header with two seats
 * and with six, so the check needs no lobby and no second player.
 */

type Box = { x: number; y: number; width: number; height: number }

async function visibleBoxes(scope: Locator): Promise<Box[]> {
  const boxes: Box[] = []
  for (const item of await scope.locator(':scope > *').all()) {
    if (!(await item.isVisible())) continue
    const box = await item.boundingBox()
    if (box && box.width > 0) boxes.push(box)
  }
  return boxes
}

async function header(page: Page, id: string): Promise<Locator> {
  const found = page.getByTestId(`chrome-${id}`).locator('.game-header')
  await expect(found).toBeVisible()
  return found
}

const overlapVertically = (a: Box, b: Box) => a.y < b.y + b.height && b.y < a.y + a.height

for (const width of [320, 390, 1280]) {
  for (const id of ['two', 'players-6']) {
    test(`${id}: title and actions share one row with no wrapped action at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/dev/game-chrome')
      const root = await header(page, id)

      const actions = root.locator('.game-header__actions')
      const inline = actions.locator('.game-header__actions-inline')
      const menu = actions.locator('.game-header__actions-menu')
      const shown = (await inline.isVisible()) ? inline : menu
      // Three actions (sound, invite, leave) fold into the menu below a 420px header.
      if (width <= 390) {
        await expect(menu).toBeVisible()
        await expect(inline).toBeHidden()
      } else {
        await expect(inline).toBeVisible()
        await expect(menu).toBeHidden()
      }

      const items = await visibleBoxes(shown)
      expect(items.length).toBeGreaterThan(0)
      for (const item of items) {
        // One line of a 44px control; a wrapped label or a control pushed to a
        // second line makes the box or the row taller than that.
        expect(item.height).toBeLessThanOrEqual(48)
        expect(Math.abs(item.y - items[0].y)).toBeLessThanOrEqual(1)
      }

      const title = (await root.locator('.game-header__title').boundingBox())!
      const actionsBox = (await actions.boundingBox())!
      expect(overlapVertically(title, actionsBox)).toBe(true)

      const headerBox = (await root.boundingBox())!
      expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual(headerBox.x + headerBox.width + 0.5)
    })
  }

  test(`keeps the header height when the turn passes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/dev/game-chrome')
    for (const [before, after] of [['two', 'two-turn-passed'], ['players-4', 'players-4-turn-passed']]) {
      const a = (await (await header(page, before)).boundingBox())!
      const b = (await (await header(page, after)).boundingBox())!
      expect(b.height).toBeCloseTo(a.height, 0)
    }
  })
}

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 800]]) {
  test(`a spectator's header leaves the seats at least the room a player's does at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/dev/game-chrome')
    const seatsWidth = async (id: string) =>
      (await (await header(page, id)).locator('.game-scoreboard-header').boundingBox())!.width
    expect(await seatsWidth('spectator')).toBeGreaterThanOrEqual((await seatsWidth('two')) - 0.5)

    const name = (await header(page, 'spectator')).locator('.game-header__name')
    expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  })
}

for (const width of [320, 390]) {
  test(`a spectator's sound and way back fold into the menu below a 420px header at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/dev/game-chrome')
    const root = await header(page, 'spectator')

    await expect(root.locator('.game-header__actions-inline')).toBeHidden()
    await root.locator('.game-header__more').click()
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitemcheckbox')).toBeVisible()
    await expect(menu.locator('a[role="menuitem"]')).toHaveAttribute('href', /^\/lobby\/[^/]+$/)
  })
}
