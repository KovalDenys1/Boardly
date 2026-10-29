import type { Page } from '@playwright/test'
import { test, expect } from './support/fixtures'
import { contextForGuest, createGuest, E2E_LOBBY_MARKER } from './support/lobby'

/**
 * No board overflows its card on a short phone (#1577, #1566).
 *
 * At 320x568 the header, the banner and the tabs leave the board card under
 * 200px, and a board whose cell has a fixed floor came out taller than that:
 * Connect Four's bottom row and Checkers' top rank were cut off. The card is
 * a size container, so only a real browser can say what is left in it.
 */
const SHORT_PHONE = { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true }

const GAMES = [
  { gameType: 'connect_four', seats: 2, board: '.ttt-board-card .ttt-board-surface > div' },
  { gameType: 'checkers', seats: 2, board: '[data-testid="checkers-board"]' },
  { gameType: 'ludo', seats: 4, board: '[data-testid="ludo-board"]' },
] as const

async function overflow(page: Page, selector: string) {
  const board = page.locator(selector).filter({ visible: true }).first()
  await expect(board).toBeVisible({ timeout: 45_000 })
  // The board's own entrance motion settles before it is measured.
  await page.waitForTimeout(1500)
  return board.evaluate((el) => {
    const card = el.closest('.ttt-board-card')!
    const b = el.getBoundingClientRect()
    const c = card.getBoundingClientRect()
    const past = (px: number) => Math.round(Math.max(0, px) * 10) / 10
    return {
      top: past(c.top - b.top),
      bottom: past(b.bottom - c.bottom),
      left: past(c.left - b.left),
      right: past(b.right - c.right),
    }
  })
}

for (const game of GAMES) {
  test(`${game.gameType} with ${game.seats} seats: the board fits its card at 320x568`, async ({ browser, request, baseURL }) => {
    const url = baseURL!
    const host = await createGuest(request, url)
    const headers = { Origin: url, 'X-Guest-Token': host.guestToken }
    expect((await request.post(`${url}/api/user/accept-terms`, { headers, data: {} })).ok()).toBe(true)
    const created = await request.post(`${url}/api/lobby`, {
      headers,
      data: {
        name: `${E2E_LOBBY_MARKER} board fits ${game.gameType}`,
        gameType: game.gameType,
        maxPlayers: game.seats,
        turnTimer: 180,
        allowSpectators: false,
        theme: 'default',
      },
    })
    expect(created.ok(), await created.text()).toBe(true)
    const code: string = (await created.json()).lobby.code
    for (let seat = 1; seat < game.seats; seat += 1) {
      const added = await request.post(`${url}/api/lobby/${code}/add-bot`, { headers, data: { difficulty: 'easy' } })
      expect(added.ok(), await added.text()).toBe(true)
    }

    const phone = await contextForGuest(browser, host, SHORT_PHONE)
    try {
      const page = await phone.newPage()
      await page.goto(`/lobby/${code}`)
      const start = page.getByRole('button', { name: /start game/i })
      await expect(start).toBeEnabled({ timeout: 30_000 })
      await start.click()

      const past = await overflow(page, game.board)
      expect(Math.max(past.top, past.bottom, past.left, past.right), JSON.stringify(past)).toBeLessThanOrEqual(0.5)
    } finally {
      await phone.close()
    }
  })
}
