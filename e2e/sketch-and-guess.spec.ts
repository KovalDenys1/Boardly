import type { Page } from '@playwright/test'
import { test, expect } from './support/fixtures'
import { contextForGuest, createGuestLobby, joinAsGuest } from './support/lobby'

/**
 * Sketch & Guess, three humans (#1037).
 *
 * Until #1054 this game could not be started at all outside a unit test: it is
 * `in-development` in the catalog, and `isTemporarilyUnavailableGameType` made
 * POST /api/lobby answer 400 for it. So the engine has been covered for weeks
 * while nobody could answer the only question the release turns on - whether a
 * lobby of three people can reach the board and play a round. It needs three
 * humans and has no bots, so no smaller setup can ask it.
 *
 * Run it with ENABLE_IN_DEVELOPMENT_GAMES and NEXT_PUBLIC_ENABLE_IN_DEVELOPMENT_GAMES
 * both set. With neither, the create below stops the run on
 * `400 {"error":"Game type is coming soon"}`; with only the server one the lobby
 * is created and no picker in the browser lists the game.
 *
 * The move under test is the drawer's submitted drawing. It is a POST that
 * moves the round from `drawing` to `guessing` for everyone, and the two
 * guessers learn about it over Supabase Realtime rather than by polling - so
 * the assertion is made on all three screens, not on the drawer's. The second
 * move, a guess, is asserted on a screen that did not make it, which is the
 * only way to see that a guess reaches the rest of the room.
 *
 * Nothing here waits on the phase clock. Drawing is 90s and guessing 60s
 * (SKETCH_PHASE_SECONDS), both far longer than this test takes, and the test
 * asserts state that a move changed rather than anything the clock does.
 */
test('three players reach the board, a drawing is submitted, and the room is asked to guess', async ({
  browser,
  request,
  baseURL,
}) => {
  const url = baseURL!
  // A host of its own, not the shared cached `host`: this test leaves its game
  // in `playing`, and one creator may hold one open lobby, so sharing the
  // identity would hand the next test a 409 out of POST /api/lobby.
  const { code, host } = await createGuestLobby(request, 'sketch_and_guess', url, 3, undefined, {
    hostRole: 'sketch-and-guess-host',
  })
  const second = await joinAsGuest(request, code, url)
  const third = await joinAsGuest(request, code, url)

  const contexts = await Promise.all(
    [host, second, third].map((guest) => contextForGuest(browser, guest))
  )

  try {
    const pages: Page[] = await Promise.all(contexts.map((context) => context.newPage()))
    await Promise.all(pages.map((page) => page.goto(`/lobby/${code}`)))

    const [hostPage] = pages

    // /lobby/{code} is the shared waiting room until the game is under way; the
    // Sketch & Guess screen only takes over from status `playing` (see
    // resolveDedicatedLobbyPageGameType). So the host starts it first.
    await expect(hostPage.getByRole('button', { name: /start game/i })).toBeEnabled({
      timeout: 20_000,
    })
    await hostPage.getByRole('button', { name: /start game/i }).click()

    // The page lays the board out three times, one tree per breakpoint, and CSS
    // shows one (#1034). `sketch-board-card` is the desktop tree's id, which is
    // the one on screen at this viewport, so every query below is scoped to it
    // rather than fishing a hidden copy out of the DOM.
    const boards = pages.map((page) => page.getByTestId('sketch-board-card'))

    // Which seat draws is the engine's call - `drawerOrder` is the player list
    // as the game row holds it, not the join order - so the test finds the
    // drawer rather than assuming the host got it.
    const isDrawer = await Promise.all(
      boards.map(async (board) => {
        const submitDrawing = board.getByRole('button', { name: /submit drawing/i })
        const awaitingDrawer = board.getByText(/is drawing/i)
        await expect(submitDrawing.or(awaitingDrawer)).toBeVisible({ timeout: 30_000 })
        return (await submitDrawing.count()) > 0
      })
    )
    expect(isDrawer.filter(Boolean)).toHaveLength(1)

    const drawerIndex = isDrawer.indexOf(true)
    const drawerPage = pages[drawerIndex]
    const drawerBoard = boards[drawerIndex]
    const guesserPages = pages.filter((_, index) => index !== drawerIndex)
    const guesserBoards = boards.filter((_, index) => index !== drawerIndex)

    // The drawer alone is told the prompt; the other two are shown a blank
    // frame. That is the sanitizer doing its job, and it is worth one line.
    await expect(drawerBoard.getByText('Your prompt')).toBeVisible()
    for (const board of guesserBoards) {
      await expect(board.getByText('Your prompt')).toHaveCount(0)
    }

    // One stroke on the canvas. The board refuses an empty submission, and the
    // engine refuses content under three characters, so the drawing has to be
    // really drawn - pointer down, a few moves apart (points closer than 2.5px
    // are dropped), pointer up.
    const canvas = drawerBoard.locator('canvas')
    const frame = await canvas.boundingBox()
    if (!frame) throw new Error('The drawer has no canvas to draw on')
    await drawerPage.mouse.move(frame.x + frame.width * 0.25, frame.y + frame.height * 0.3)
    await drawerPage.mouse.down()
    await drawerPage.mouse.move(frame.x + frame.width * 0.75, frame.y + frame.height * 0.35, { steps: 10 })
    await drawerPage.mouse.move(frame.x + frame.width * 0.5, frame.y + frame.height * 0.75, { steps: 10 })
    await drawerPage.mouse.up()

    // Wait on the server's answer rather than on the screen. A rejected move
    // leaves the board exactly as it was, so without this the failure would
    // read as "the guess box never appeared" and say nothing about why.
    const drawingAccepted = drawerPage.waitForResponse(
      (response) =>
        response.url().includes('/sketch-and-guess-action') && response.request().method() === 'POST'
    )
    await drawerBoard.getByRole('button', { name: /submit drawing/i }).click()
    const drawingResponse = await drawingAccepted
    expect(
      drawingResponse.status(),
      `submit-drawing was refused: ${await drawingResponse.text()}`
    ).toBe(200)

    // The state change, seen on all three screens. The two guessers were told
    // over realtime; only the drawer made the request.
    for (const board of guesserBoards) {
      await expect(board.getByPlaceholder('Type your guess...')).toBeVisible({ timeout: 20_000 })
    }
    await expect(drawerBoard.getByText('Sit back')).toBeVisible({ timeout: 20_000 })
    await expect(drawerBoard.getByPlaceholder('Type your guess...')).toHaveCount(0)

    // A second real move, asserted on a screen that did not make it. The guess
    // is deliberately wrong: a correct one scores but does not end the phase
    // either, and a test that has to know the prompt to run is a test that
    // breaks when the prompt pool changes.
    const guessAccepted = guesserPages[0].waitForResponse(
      (response) =>
        response.url().includes('/sketch-and-guess-action') && response.request().method() === 'POST'
    )
    await guesserBoards[0].getByPlaceholder('Type your guess...').fill('definitely not that')
    await guesserBoards[0].getByRole('button', { name: /submit guess/i }).click()
    const guessResponse = await guessAccepted
    expect(guessResponse.status(), `submit-guess was refused: ${await guessResponse.text()}`).toBe(200)

    // One of two guesses is in, and the seat that did not send it says so.
    await expect(guesserBoards[1].getByText('1/2 guessed')).toBeVisible({ timeout: 20_000 })
    await expect(drawerBoard.getByText('1/2 guessed')).toBeVisible({ timeout: 20_000 })
    await expect(guesserBoards[0].getByText('Guess submitted')).toBeVisible()
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
