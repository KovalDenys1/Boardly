import { type Page } from '@playwright/test'
import { test, expect } from './support/fixtures'
import { contextForGuest, createGuestLobby, joinAsGuest, sweepLobby } from './support/lobby'

test.use({ launchOptions: { args: ['--use-mock-keychain'] } })

async function drop(page: Page, column: number, { wins = false } = {}) {
  const button = page.getByRole('button', { name: `column ${column}`, exact: true }).first()
  await expect(button).toBeEnabled({ timeout: 20_000 })
  // C4Board's column overlay sits over the cells and takes a player's click.
  await button.click({ force: true })
  if (!wins) await expect(button).toBeDisabled({ timeout: 20_000 })
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`two friends reopen their closed Connect Four table from the old link at ${viewport.width}px`, async ({
    browser,
    request,
    baseURL,
  }) => {
    const url = baseURL!
    const { code, host } = await createGuestLobby(request, 'connect_four', url, 2, undefined, {
      hostRole: `reopen-host-${viewport.width}`,
    })
    const friend = await joinAsGuest(request, code, url)

    const hostContext = await contextForGuest(browser, host, { viewport })
    const friendContext = await contextForGuest(browser, friend, { viewport })

    try {
      const hostPage = await hostContext.newPage()
      const friendPage = await friendContext.newPage()
      await hostPage.goto(`/lobby/${code}`)
      await friendPage.goto(`/lobby/${code}`)

      const start = hostPage.getByRole('button', { name: /start game/i })
      await expect(start).toBeEnabled({ timeout: 20_000 })
      await start.click()

      // The host moves first; four in column 1 wins on the seventh disc.
      for (let turn = 0; turn < 3; turn += 1) {
        await drop(hostPage, 1)
        await drop(friendPage, 2)
      }
      await drop(hostPage, 1, { wins: true })
      await expect(hostPage.getByTestId('game-result-standings')).toBeVisible()
      await expect(friendPage.getByTestId('game-result-standings')).toBeVisible()
      await hostPage.close()

      sweepLobby(code)

      // The friend comes back later and taps the link they still have.
      await friendPage.goto(`/lobby/${code}`)
      await expect(friendPage.getByRole('heading', { name: /reopen this table/i })).toBeVisible({ timeout: 20_000 })
      await expect(friendPage.getByText(/won/).first()).toBeVisible()
      await friendPage.getByRole('button', { name: /^reopen$/i }).click()
      await expect(friendPage.getByRole('button', { name: /share the link/i })).toBeVisible({ timeout: 20_000 })

      // The old host's old link now joins the reopened table.
      const hostAgain = await hostContext.newPage()
      await hostAgain.goto(`/lobby/${code}`)
      await expect(hostAgain.getByText(/waiting for host/i).first()).toBeVisible({ timeout: 20_000 })

      const startAgain = friendPage.getByRole('button', { name: /start game/i })
      await expect(startAgain).toBeEnabled({ timeout: 20_000 })
      await startAgain.click()

      await expect(friendPage.getByRole('button', { name: 'column 1', exact: true }).first()).toBeVisible({ timeout: 20_000 })
      await expect(hostAgain.getByRole('button', { name: 'column 1', exact: true }).first()).toBeVisible({ timeout: 20_000 })
      await expect(hostAgain.getByRole('heading', { name: /reopen this table/i })).toHaveCount(0)
    } finally {
      await Promise.all([hostContext.close(), friendContext.close()])
    }
  })
}
