import { test, expect, type Page } from '@playwright/test'

// Layout is the subject, so the session and the stats come from page.route rather than an account in the database.
const USER_ID = 'e2e-stats-layout'

const game = (gameType: string, played: number, wins: number, losses: number, draws: number, score: number | null) => ({
  gameType,
  gamesPlayed: played,
  wins,
  losses,
  draws,
  winRate: Math.round((wins / played) * 100),
  avgScore: score,
  bestScore: score === null ? null : score + 41,
  lastPlayed: '2026-10-28T18:00:00.000Z',
})

const STATS = {
  userId: USER_ID,
  overall: {
    totalGames: 61,
    wins: 30,
    losses: 25,
    draws: 6,
    winRate: 49,
    avgGameDurationMinutes: 6,
    favoriteGame: 'rock_paper_scissors',
    currentWinStreak: 2,
    longestWinStreak: 5,
  },
  byGame: [
    game('rock_paper_scissors', 21, 11, 8, 2, null),
    game('yahtzee', 12, 7, 5, 0, 212),
    game('tic_tac_toe', 10, 4, 3, 3, null),
    game('memory', 8, 4, 4, 0, 14),
    game('guess_the_spy', 6, 2, 4, 0, null),
    game('connect_four', 4, 2, 1, 1, null),
  ],
  trends: null,
  generatedAt: '2026-10-29T12:00:00.000Z',
}

async function signedInWithStats(page: Page) {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      json: { user: { id: USER_ID, name: 'Layout Check', email: 'layout-check@example.test' }, expires: '2099-01-01T00:00:00.000Z' },
    })
  )
  await page.route('**/api/user/**', (route) => {
    const { pathname } = new URL(route.request().url())
    if (pathname === `/api/user/${USER_ID}/stats`) return route.fulfill({ json: STATS })
    if (pathname === '/api/user/profile') {
      return route.fulfill({
        json: { user: { id: USER_ID, username: 'layoutcheck', email: 'layout-check@example.test', createdAt: '2026-01-01T00:00:00.000Z' } },
      })
    }
    return route.fulfill({ json: {} })
  })
}

async function columnEdges(page: Page) {
  return page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h4')).find((el) => el.textContent?.trim() === 'Quick facts')
    const right = heading?.parentElement
    const left = right?.parentElement?.firstElementChild
    if (!right || !left || left === right) return null
    const rightBox = right.getBoundingClientRect()
    const firstCard = left.firstElementChild!.getBoundingClientRect()
    const lastCard = left.lastElementChild!.getBoundingClientRect()
    return {
      twoColumns: lastCard.right <= rightBox.left,
      top: Math.abs(firstCard.top - rightBox.top),
      bottom: Math.abs(lastCard.bottom - rightBox.bottom),
    }
  })
}

for (const width of [1280, 1440, 1920]) {
  test(`Game analytics columns share top and bottom edges at ${width}px for every game`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signedInWithStats(page)
    await page.goto('/profile?tab=stats')

    const picker = page.getByRole('button', { name: 'Game', exact: true })
    await expect(picker).toBeVisible({ timeout: 60_000 })

    for (const entry of STATS.byGame) {
      await picker.click()
      await page.getByRole('option').filter({ hasText: String(entry.gamesPlayed) }).first().click()
      await expect(page.getByRole('option')).toHaveCount(0)

      const edges = await columnEdges(page)
      expect(edges, `${entry.gameType} at ${width}px`).not.toBeNull()
      expect(edges!.twoColumns, `${entry.gameType} at ${width}px`).toBe(true)
      expect(edges!.top, `top edges, ${entry.gameType} at ${width}px`).toBeLessThanOrEqual(1)
      expect(edges!.bottom, `bottom edges, ${entry.gameType} at ${width}px`).toBeLessThanOrEqual(1)
    }
  })
}
