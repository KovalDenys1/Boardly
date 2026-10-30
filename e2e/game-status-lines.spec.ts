import { test, expect } from './support/fixtures'

/**
 * The status line reads whole (#1566), measured in a real browser.
 *
 * jsdom does not wrap text, so whether a line fits its banner needs layout. The
 * dev contact sheet (/dev/game-chrome) renders every line the eleven games can
 * show, in a live banner and, for the lines about someone else, a spectator's,
 * each 264px wide: narrower than any game page gives its banner at 320x568 or
 * 844x390. English and German carry the longest strings; a player's name is the
 * longest a username can be.
 */

for (const locale of ['en', 'de']) {
  for (const [width, height] of [[320, 568], [844, 390]]) {
    test(`${locale}: every status line fits its banner, on two lines at most, at ${width}x${height}`, async ({ page }) => {
      await page.addInitScript((language) => window.localStorage.setItem('i18nextLng', language), locale)
      await page.setViewportSize({ width, height })
      await page.goto('/dev/game-chrome')
      const lines = page.getByTestId('status-lines')
      await expect(lines).toHaveAttribute('data-locale', locale)

      const titles = lines.getByTestId('game-status-title')
      expect(await titles.count()).toBeGreaterThan(60)
      const measured = await titles.evaluateAll((elements) => elements.map((element) => ({
        text: element.textContent,
        lines: Math.round(element.scrollHeight / parseFloat(getComputedStyle(element).lineHeight)),
        cut: element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1,
      })))
      expect(measured.filter((title) => title.cut || title.lines > 2)).toEqual([])

      // A name is cut only when the whole name and the action cannot share two lines.
      const names = await lines.locator('.game-status-player').evaluateAll((elements) => elements.map((name) => {
        const title = name.closest<HTMLElement>('.game-status-title')!
        const group = name.closest<HTMLElement>('.game-status-player-group')!
        const cut = name.scrollWidth > name.clientWidth + 1
        const cap = name.style.maxWidth
        name.style.maxWidth = 'none'
        const fitsWhole = title.scrollHeight <= 2 * parseFloat(getComputedStyle(title).lineHeight) + 1
          && group.getBoundingClientRect().width <= title.clientWidth + 1
        name.style.maxWidth = cap
        return { text: title.textContent, width: title.clientWidth, cut, fitsWhole }
      }))
      expect(names.length).toBeGreaterThan(20)
      expect(names.filter((name) => name.cut && name.fitsWhole)).toEqual([])

      // Every live banner is as tall as every other, so nothing moves when the turn passes.
      const heights = await lines.locator('.game-status-banner').evaluateAll((banners) =>
        [...new Set(banners.map((banner) => Math.round(banner.getBoundingClientRect().height)))])
      expect(heights).toHaveLength(1)
    })
  }
}
