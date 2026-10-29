import type { Locator } from '@playwright/test'
import { test, expect } from './support/fixtures'
import { contextForGuest, createGuest, E2E_LOBBY_MARKER } from './support/lobby'
import { getGameMetadata } from '@/lib/game-catalog'

async function measure(table: Locator) {
  return table.evaluate((sheet) => {
    const shown = (el: Element) => el.getClientRects().length > 0
    const box = sheet.getBoundingClientRect()
    const headers = Array.from(sheet.querySelectorAll('[role="columnheader"]')).filter(shown)
    const fixedEdge = headers[0].getBoundingClientRect().right
    const columns = headers.slice(1).map((header) => {
      const rect = header.getBoundingClientRect()
      return {
        current: header.classList.contains('is-current'),
        visible: rect.left >= fixedEdge - 1 && rect.right <= box.right + 1,
      }
    })
    const totals = Array.from(sheet.querySelectorAll('[data-testid="yahtzee-total"]')).filter(shown)
    const clipped = totals.filter((cell) => {
      const value = cell.firstElementChild!.getBoundingClientRect()
      const frame = cell.getBoundingClientRect()
      return value.left < frame.left - 0.5 || value.right > frame.right + 0.5
    })
    const rowHeader = sheet.querySelector('[role="rowheader"]')!
    return {
      headers: headers.length,
      overflow: sheet.scrollWidth - sheet.clientWidth,
      currentVisible: columns.some((column) => column.current && column.visible),
      visibleColumns: columns.filter((column) => column.visible).length,
      totals: totals.length,
      totalRows: new Set(totals.map((cell) => Math.round(cell.getBoundingClientRect().top))).size,
      clippedTotals: clipped.length,
      categoryOffset: Math.abs(rowHeader.getBoundingClientRect().left - box.left),
    }
  })
}

test('the Yahtzee score table holds the lobby maximum at 390 and 1280', async ({ browser, request, baseURL }) => {
  const url = baseURL!
  const maxPlayers = getGameMetadata('yahtzee')!.maxPlayers
  const host = await createGuest(request, url)
  const headers = { Origin: url, 'X-Guest-Token': host.guestToken }

  // The lobby API refuses a named lobby until its creator has accepted the terms.
  expect((await request.post(`${url}/api/user/accept-terms`, { headers, data: {} })).ok()).toBe(true)
  const created = await request.post(`${url}/api/lobby`, {
    headers,
    data: {
      name: `${E2E_LOBBY_MARKER} yahtzee table`,
      gameType: 'yahtzee',
      maxPlayers,
      turnTimer: 180,
      allowSpectators: false,
      theme: 'default',
      yahtzeeMode: 'classic',
    },
  })
  expect(created.ok(), await created.text()).toBe(true)
  const code: string = (await created.json()).lobby.code
  for (let seat = 1; seat < maxPlayers; seat += 1) {
    const added = await request.post(`${url}/api/lobby/${code}/add-bot`, {
      headers,
      data: { difficulty: ['easy', 'medium', 'hard'][seat % 3] },
    })
    expect(added.ok(), await added.text()).toBe(true)
  }

  const desktop = await contextForGuest(browser, host, { viewport: { width: 1280, height: 800 } })
  const phone = await contextForGuest(browser, host, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  try {
    const page = await desktop.newPage()
    await page.goto(`/lobby/${code}`)
    await page.getByRole('button', { name: /start game/i }).click({ timeout: 30_000 })

    const wide = page.locator('[data-testid="yahtzee-score-table"]:visible')
    await expect(wide).toBeVisible({ timeout: 30_000 })
    const atDesktop = await measure(wide)
    expect(atDesktop.headers).toBe(maxPlayers + 1)
    expect(atDesktop.overflow).toBeLessThanOrEqual(0)
    expect(atDesktop.visibleColumns).toBe(maxPlayers)
    expect(atDesktop.totals).toBe(maxPlayers)
    expect(atDesktop.totalRows).toBe(1)
    expect(atDesktop.clippedTotals).toBe(0)

    const phonePage = await phone.newPage()
    await phonePage.goto(`/lobby/${code}`)
    const narrow = phonePage.locator('[data-testid="yahtzee-score-table"]:visible')
    await expect(narrow).toBeVisible({ timeout: 30_000 })
    const atPhone = await measure(narrow)
    expect(atPhone.headers).toBe(maxPlayers + 1)
    expect(atPhone.currentVisible).toBe(true)
    expect(atPhone.visibleColumns).toBeGreaterThanOrEqual(2)
    expect(atPhone.totals).toBe(maxPlayers)
    expect(atPhone.totalRows).toBe(1)
    expect(atPhone.clippedTotals).toBe(0)

    // Scrolled to the far end, the category column has not moved.
    await narrow.evaluate((sheet) => sheet.scrollTo({ left: sheet.scrollWidth }))
    expect((await measure(narrow)).categoryOffset).toBeLessThanOrEqual(1)
  } finally {
    await Promise.all([desktop.close(), phone.close()])
  }
})
