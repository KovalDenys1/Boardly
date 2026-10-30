import { test, expect, type Page } from '@playwright/test'

/**
 * Every dialog drawn by components/Modal fits its screen (#1549): its scroll body never
 * scrolls sideways and does not scroll at all while its content fits, and a sheet spans a
 * phone's width. A header menu paints above the page's floating controls (#1556). Runs
 * against /dev/dialogs, and /games for the two that open on any page; every API a dialog
 * reads is answered here, so the run writes nothing.
 */
const NOW = '2026-10-30T12:00:00.000Z'
const API: Record<string, unknown> = {
  '**/api/friends': { friends: [{ id: 'f1', username: 'Alice', avatar: null }, { id: 'f2', username: 'Bob', avatar: null }] },
  '**/api/auth/guest-session': { guestId: 'fit-guest', guestName: 'Fit', guestToken: 'fit-token' },
  '**/api/users/fixture/card': {
    userId: 'fixture', username: 'Fixture player', image: null, publicProfileId: null, isGuest: false, isPremium: false,
    gamesPlayed: 12, wins: 7, winRate: 58, favouriteGame: 'yahtzee', relation: 'can_send',
  },
  '**/api/game/fixture/results': {
    id: 'fixture', lobbyCode: 'FIXTURE', lobbyName: 'Fixture table', gameType: 'yahtzee', status: 'finished',
    createdAt: NOW, updatedAt: NOW, finishedAt: NOW, endedAt: NOW, durationMs: 420000, abandonedAt: null,
    hasReplay: false, replayStepCount: 0, state: {},
    players: [
      { id: 'p1', username: 'Alice', avatar: null, isBot: false, score: 231, finalScore: 231, placement: 1, isWinner: true },
      { id: 'p2', username: 'Bob', avatar: null, isBot: false, score: 187, finalScore: 187, placement: 2, isWinner: false },
    ],
  },
}

type Opener = { name: string; sheet?: boolean; open: (page: Page) => Promise<void> }

const fixture = (o: string, ready?: (page: Page) => Promise<void>): Opener => ({
  name: o,
  async open(page) {
    await page.goto(`/dev/dialogs?o=${o}`)
    if (ready) await ready(page)
  },
})

const DIALOGS: Opener[] = [
  fixture('auth-gate'),
  fixture('friends', (page) => page.getByText('Alice').waitFor()),
  fixture('interrupted'),
  fixture('confirm'),
  fixture('report'),
  fixture('admin-watch'),
  fixture('results', (page) => page.getByRole('dialog').getByText('Alice').first().waitFor()),
  fixture('profile', (page) => page.getByRole('dialog').getByText('Fixture player').first().waitFor()),
  fixture('custom-words', (page) => page.getByTestId('sketch-custom-words-row').click()),
  fixture('quick-play'),
  {
    name: 'onboarding',
    sheet: true,
    async open(page) {
      await page.addInitScript(() => {
        localStorage.setItem('boardly_guest_id', 'fit-guest')
        localStorage.setItem('boardly_guest_name', 'Fit')
        localStorage.setItem('boardly_guest_token', 'fit-token')
      })
      await page.goto('/games')
      await page.getByRole('dialog', { name: 'Welcome to Boardly!' }).waitFor()
    },
  },
  {
    name: 'feedback',
    sheet: true,
    async open(page) {
      await page.goto('/games')
      await page.evaluate(() => window.dispatchEvent(new Event('open-feedback')))
    },
  },
]

async function answerApis(page: Page) {
  for (const [url, json] of Object.entries(API)) await page.route(url, (route) => route.fulfill({ json }))
}

async function settle(page: Page) {
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running' || animation.effect?.getTiming().iterations === Infinity)
  )
}

for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  for (const dialog of DIALOGS) {
    if (size.width === 390 && !dialog.sheet) continue
    test(`${dialog.name} fits ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size)
      await answerApis(page)
      await dialog.open(page)
      await settle(page)

      const fit = await page.getByRole('dialog').evaluate((panel) => {
        const body = panel.querySelector(':scope > .overflow-y-auto') as HTMLElement
        const box = panel.getBoundingClientRect()
        return {
          bodySideways: body.scrollWidth - body.clientWidth,
          bodyDown: body.scrollHeight - body.clientHeight,
          panelSideways: panel.scrollWidth - panel.clientWidth,
          capped: box.height >= parseFloat(getComputedStyle(panel).maxHeight) - 1,
          width: box.width,
        }
      })
      expect.soft(fit.bodySideways, 'the body scrolls sideways').toBeLessThanOrEqual(0)
      expect.soft(fit.panelSideways, 'the panel scrolls sideways').toBeLessThanOrEqual(0)
      if (!fit.capped) expect.soft(fit.bodyDown, 'the body scrolls while its content fits').toBeLessThanOrEqual(1)
      if (dialog.sheet && size.width < 640) expect.soft(fit.width, 'a sheet spans the phone').toBe(size.width)
      if (dialog.sheet && size.width >= 640) expect.soft(fit.width, 'a sheet keeps its width on a large screen').toBeLessThanOrEqual(448)
    })
  }
}

/** Puts `mover` (a fixed element) where `target` is and reports whether `target` is what a tap there hits. */
async function wins(page: Page, target: string, mover: string): Promise<boolean> {
  return page.evaluate(
    ([targetSelector, moverSelector]) => {
      const over = document.querySelector(targetSelector) as HTMLElement
      const under = document.querySelector(moverSelector) as HTMLElement
      const box = over.getBoundingClientRect()
      const x = box.left + box.width / 2
      const y = box.top + box.height / 2
      Object.assign(under.style, { left: `${x - 20}px`, top: `${y - 20}px`, right: 'auto', bottom: 'auto' })
      return over.contains(document.elementFromPoint(x, y))
    },
    [target, mover]
  )
}

const FEEDBACK_BUTTON = 'button[aria-label="Send feedback"]'
const INSTALL_PROMPT = '[data-fit-install]'

/** A returning visitor on /games whom the browser offers to install the app. */
async function showInstallPrompt(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(() => localStorage.setItem('boardly:first-visit:v1', String(Date.now() - 24 * 60 * 60 * 1000)))
  await page.goto('/games')
  await expect(async () => {
    await page.evaluate(() => {
      const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () => {},
        userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
      })
      window.dispatchEvent(offer)
    })
    await expect(page.getByText('Install Boardly')).toBeVisible({ timeout: 1000 })
  }).toPass()
  await page.evaluate(() => {
    const title = [...document.querySelectorAll('p')].find((p) => p.textContent === 'Install Boardly')!
    title.closest('.fixed')!.setAttribute('data-fit-install', '')
  })
}

test('a header menu paints above the feedback button and the install prompt', async ({ page }) => {
  await showInstallPrompt(page)
  await page.locator('header').getByRole('button', { name: 'Language' }).click()
  await expect(page.getByRole('menu')).toBeVisible()

  expect(await wins(page, '[role="menu"]', FEEDBACK_BUTTON), 'the feedback button covers the menu').toBe(true)
  expect(await wins(page, '[role="menu"]', INSTALL_PROMPT), 'the install prompt covers the menu').toBe(true)
})

test('the install prompt paints above the feedback button', async ({ page }) => {
  await showInstallPrompt(page)

  expect(await wins(page, INSTALL_PROMPT, FEEDBACK_BUTTON), 'the feedback button covers the install prompt').toBe(true)
})
