import { test, expect } from './support/fixtures'
import { contextForGuest, createGuestLobby } from './support/lobby'

/**
 * An invited friend joins from the link and enters the game when the host
 * starts it, without a reload (#1183).
 *
 * The friend arrives with no identity, types a name and presses Play as Guest,
 * which is the invite path people actually take. The regression was on their
 * side: the start broadcast was applied to the board but not to the game's
 * status, and the snapshot that carried 'playing' was then rejected as stale,
 * so they sat on "Waiting for host to start" until they reloaded.
 *
 * Tic-Tac-Toe switches to its own page when the game starts; Yahtzee stays in
 * the shared shell. Both leave the waiting room on the same status change.
 */
for (const gameType of ['tic_tac_toe', 'yahtzee'] as const) {
  test(`an invited guest enters ${gameType} when the host starts, without a reload`, async ({
    browser,
    request,
    baseURL,
  }) => {
    const url = baseURL!
    // A role per game: one creator may hold only one open lobby.
    const { code, host } = await createGuestLobby(request, gameType, url, 2, undefined, {
      hostRole: `invite-host-${gameType}`,
    })

    const hostContext = await contextForGuest(browser, host)
    const friendContext = await browser.newContext()

    try {
      const hostPage = await hostContext.newPage()
      const friendPage = await friendContext.newPage()

      await hostPage.goto(`/lobby/${code}`)
      await friendPage.goto(`/lobby/${code}?via=invite`)

      await friendPage.getByPlaceholder(/name/i).first().fill('Noah')
      await friendPage.getByRole('button', { name: /play as guest/i }).click()
      const waiting = friendPage.getByText(/waiting for host/i)
      await expect(waiting.first()).toBeVisible({ timeout: 20_000 })

      const start = hostPage.getByRole('button', { name: /start game/i })
      await expect(start).toBeEnabled({ timeout: 20_000 })
      // Let the friend's realtime subscription settle, as it would for a person
      // who takes a moment to look at the waiting room.
      await friendPage.waitForTimeout(3000)

      await start.click()
      const startedAt = Date.now()

      // Broadcast plus one snapshot round trip. The waiting-room poll is every
      // 2 s, so a pass here cannot be a slow recovery either.
      await expect(waiting).toHaveCount(0, { timeout: 5_000 })
      const elapsed = Date.now() - startedAt
      console.log(`${gameType}: friend left the waiting room ${elapsed} ms after start`)
    } finally {
      await Promise.all([hostContext.close(), friendContext.close()])
    }
  })
}
