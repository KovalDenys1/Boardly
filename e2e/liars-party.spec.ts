import type { Page } from '@playwright/test'
import { test, expect } from './support/fixtures'
import { contextForGuest, createGuestLobby, joinAsGuest } from './support/lobby'

/**
 * A move leaving this page, so the test can wait on the server's answer.
 *
 * Liar's Party posts every move to the shared `/api/game/{id}/state` route and
 * not to `/api/game/{id}/liars-party-action`, which the page never calls - so a
 * matcher written from the route's name waits for a request that is never made.
 */
function isLiarsPartyMove(response: { url(): string; request(): { method(): string } }): boolean {
  return (
    response.request().method() === 'POST' &&
    response.url().includes('/api/game/') &&
    response.url().endsWith('/state')
  )
}

/**
 * Liar's Party, four humans (#1042).
 *
 * Four seats is the minimum the engine will start on and there are no bots, so
 * this game has never been played anywhere but in unit tests - and until #1054
 * it could not be started at all, because `in-development` made POST /api/lobby
 * answer 400 for it. Run it with ENABLE_IN_DEVELOPMENT_GAMES and
 * NEXT_PUBLIC_ENABLE_IN_DEVELOPMENT_GAMES both set; with neither, the create
 * below stops the run on `400 {"error":"Game type is coming soon"}`.
 *
 * Two moves, each asserted on screens that did not make it: the claimant's
 * claim, which moves the whole room from `claim` to `challenge`, and one
 * voter's Believe, which the other three learn about over Supabase Realtime.
 *
 * The lobby's turn timer is raised to the maximum the API allows. Unlike
 * Sketch & Guess, this engine measures its phase deadline against that number,
 * and `applyTimeoutFallback` runs before every move: on the default 60s a slow
 * page load would auto-play the claim and the test's own claim would come back
 * 400 "Invalid move" with nothing on screen to explain it.
 *
 * Leaving is deliberately not covered here. The engine's leave path needs five
 * seats to reach at all - lib/lobby-leave.ts returns early once the remaining
 * count drops under minPlayers, which is 4 - so it belongs in its own test with
 * its own setup rather than as a tail on this one.
 */
test('four players reach the table, a claim is made, and the room is asked to vote', async ({
  browser,
  request,
  baseURL,
}) => {
  const url = baseURL!
  // A host of its own, not the shared cached `host`: this test leaves its game
  // in `playing`, and one creator may hold one open lobby, so sharing the
  // identity would hand the next test a 409 out of POST /api/lobby.
  const { code, host } = await createGuestLobby(request, 'liars_party', url, 4, undefined, {
    hostRole: 'liars-party-host',
    turnTimer: 180,
  })
  const second = await joinAsGuest(request, code, url)
  const third = await joinAsGuest(request, code, url)
  const fourth = await joinAsGuest(request, code, url)

  const contexts = await Promise.all(
    [host, second, third, fourth].map((guest) => contextForGuest(browser, guest))
  )

  try {
    const pages: Page[] = await Promise.all(contexts.map((context) => context.newPage()))
    await Promise.all(pages.map((page) => page.goto(`/lobby/${code}`)))

    const [hostPage] = pages

    // The waiting room is the shared shell; the Liar's Party screen takes over
    // from status `playing` (see resolveDedicatedLobbyPageGameType), so the
    // host starts the game first.
    await expect(hostPage.getByRole('button', { name: /start game/i })).toBeEnabled({
      timeout: 20_000,
    })
    await hostPage.getByRole('button', { name: /start game/i }).click()

    // The screen carries its phase as its own test id, so this is the phase
    // itself rather than an inference from whatever happens to be rendered.
    for (const page of pages) {
      await expect(page.getByTestId('liars-party-claim-screen')).toBeVisible({ timeout: 30_000 })
    }

    // The page mounts the phase card once per breakpoint and CSS shows one
    // (#1034), so each tree tags its copy. `-desktop` is the one on screen at
    // this viewport; every query below is scoped to it.
    const claimCards = pages.map((page) => page.getByTestId('liars-party-claim-screen-desktop'))

    // Who claims first is `claimantOrder[0]`, the player list as the game row
    // holds it rather than the join order, so the test finds the claimant. The
    // rules panel is on every seat's card in round one, and the claim form is
    // only on the claimant's.
    const isClaimant = await Promise.all(
      claimCards.map(async (card) => {
        await expect(card.getByText('Rules').first()).toBeVisible({ timeout: 30_000 })
        return (await card.getByRole('button', { name: 'Submit Claim' }).count()) > 0
      })
    )
    expect(isClaimant.filter(Boolean)).toHaveLength(1)

    const claimantIndex = isClaimant.indexOf(true)
    const claimantPage = pages[claimantIndex]
    const claimantCard = claimCards[claimantIndex]
    const voterIndexes = pages.map((_, index) => index).filter((index) => index !== claimantIndex)

    // A claim under five characters is refused by the engine, and Submit stays
    // disabled until the claimant has also said whether it is true or a bluff.
    // The text is unique, so what the other three are shown can only be this.
    const claim = `E2E claim ${Date.now()}`
    await claimantCard.getByPlaceholder('Write your claim...').fill(claim)
    await claimantCard.getByRole('button', { name: 'Truth' }).click()

    // Wait on the server's answer rather than on the screen: a refused move
    // leaves the table as it was, and the failure would otherwise read as "the
    // vote buttons never appeared" and say nothing about why.
    const claimAccepted = claimantPage.waitForResponse(isLiarsPartyMove)
    await claimantCard.getByRole('button', { name: 'Submit Claim' }).click()
    const claimResponse = await claimAccepted
    expect(claimResponse.status(), `submit-claim was refused: ${await claimResponse.text()}`).toBe(
      200
    )

    // The state change, on all four screens. Only the claimant made a request;
    // the other three were told over realtime.
    for (const page of pages) {
      await expect(page.getByTestId('liars-party-challenge-screen')).toBeVisible({ timeout: 20_000 })
    }
    const challengeCards = pages.map((page) =>
      page.getByTestId('liars-party-challenge-screen-desktop')
    )
    for (const card of challengeCards) {
      await expect(card.getByText(claim)).toBeVisible()
    }

    // The claimant does not vote on their own claim; the other three are asked.
    await expect(challengeCards[claimantIndex].getByRole('button', { name: 'Believe' })).toHaveCount(0)
    for (const index of voterIndexes) {
      await expect(challengeCards[index].getByRole('button', { name: 'Believe' })).toBeVisible()
    }

    const firstVoterIndex = voterIndexes[0]
    const voteAccepted = pages[firstVoterIndex].waitForResponse(isLiarsPartyMove)
    await challengeCards[firstVoterIndex].getByRole('button', { name: 'Believe' }).click()
    const voteResponse = await voteAccepted
    expect(
      voteResponse.status(),
      `submit-challenge was refused: ${await voteResponse.text()}`
    ).toBe(200)

    // One of three votes is in, read off screens that did not cast it. The
    // phase only moves once all three are in, so this is the vote landing
    // rather than the round ending.
    await expect(challengeCards[claimantIndex].getByText('1/3 voted')).toBeVisible({ timeout: 20_000 })
    await expect(challengeCards[voterIndexes[1]].getByText('1/3 voted')).toBeVisible({ timeout: 20_000 })
    await expect(challengeCards[firstVoterIndex].getByText('You voted')).toBeVisible()
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
