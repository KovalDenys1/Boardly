import type { Locator, Page } from '@playwright/test'
import { test, expect } from './support/fixtures'
import { contextForGuest, createGuestLobby, joinAsGuest } from './support/lobby'

/**
 * Sketch & Guess, three humans (#1037).
 *
 * This game has had its own release flag since it was built - `ENABLE_SKETCH_AND_GUESS`
 * / `NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS`, which `getCatalogGames` reads on its own
 * branch (lib/game-catalog.ts) - so it was reachable before #1054 and this spec would
 * have run against that flag alone. What #1054 added is the one pair of variables that
 * opens every in-development game at once, which is what the run recipe below uses; for
 * Liar's Party, with no per-game flag, that pair is the only way in.
 *
 * Run it with ENABLE_IN_DEVELOPMENT_GAMES and NEXT_PUBLIC_ENABLE_IN_DEVELOPMENT_GAMES
 * both set, or with the two ENABLE_SKETCH_AND_GUESS halves. With none of them the
 * create below stops the run on `400 {"error":"Game type is coming soon"}`; with only a
 * server-side one the lobby is created and no picker in the browser lists the game.
 *
 * The move under test is the drawer's submitted drawing. It is a POST that moves the
 * round from `drawing` to `guessing` for everyone, and the two guessers learn about it
 * over Supabase Realtime rather than by polling - so the assertion is made on all three
 * screens, not on the drawer's, and the strokes are read back off the guessers' own
 * canvases. The second move, a guess, is asserted on a screen that did not make it,
 * which is the only way to see that a guess reaches the rest of the room.
 *
 * Nothing here waits on the phase clock. Drawing is 90s and guessing 60s
 * (SKETCH_PHASE_SECONDS), both far longer than this test takes, and the test asserts
 * state that a move changed rather than anything the clock does.
 */

/**
 * Everything a browser was handed, kept verbatim.
 *
 * The prompt assertion below is about a leak, and a leak is a property of the wire,
 * not of the screen: the round's secret can be sitting in a payload the client simply
 * chose not to render. #1032 leaked it three times through three different routes -
 * the viewer-sanitized snapshot from GET /api/lobby/[code], the shared `game-update`
 * state broadcast, and the `sketch-and-guess-action` event's own move payload - and
 * each one was found only by reading the route rather than the board. So every `/api/`
 * body and every Supabase Realtime frame a guesser's browser is handed is recorded from
 * before the first navigation and searched at the end, alongside a snapshot the test
 * asks for outright as that guesser.
 *
 * Only `/api/` responses, deliberately: the prompt pool is server-side, but a JS chunk
 * or a source map is a corpus this assertion would have to reason about for no gain.
 */
interface ReceivedTraffic {
  apiBodies: Promise<string>[]
  realtimeFrames: string[]
}

function recordTraffic(page: Page): ReceivedTraffic {
  const apiBodies: Promise<string>[] = []
  const realtimeFrames: string[] = []

  page.on('response', (response) => {
    if (!response.url().includes('/api/')) return
    // Resolved at the end of the test: a body read here would race the page.
    apiBodies.push(response.text().catch(() => ''))
  })

  page.on('websocket', (socket) => {
    socket.on('framereceived', (frame) => {
      realtimeFrames.push(
        typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8')
      )
    })
  })

  return { apiBodies, realtimeFrames }
}

async function settleTraffic(traffic: ReceivedTraffic): Promise<{ http: string[]; realtime: string[] }> {
  return {
    http: await Promise.all(traffic.apiBodies),
    realtime: [...traffic.realtimeFrames],
  }
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Ink on a canvas, measured in the 0-480 coordinate space the strokes are stored in. */
interface InkBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
  pixels: number
}

async function readInkBox(board: Locator): Promise<InkBox | null> {
  return board.locator('canvas').first().evaluate((element) => {
    const canvas = element as HTMLCanvasElement
    const context = canvas.getContext('2d')
    if (!context || canvas.width === 0 || canvas.height === 0) return null

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    const ratio = window.devicePixelRatio || 1
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    let pixels = 0

    for (let index = 0; index < data.length; index += 4) {
      // The canvas paints itself solid white first, so anything that is neither
      // white nor transparent is a stroke.
      if (data[index + 3] < 128) continue
      if (data[index] > 220 && data[index + 1] > 220 && data[index + 2] > 220) continue

      const pixel = index / 4
      const x = (pixel % canvas.width) / ratio
      const y = Math.floor(pixel / canvas.width) / ratio
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      pixels += 1
    }

    return pixels === 0 ? null : { minX, minY, maxX, maxY, pixels }
  })
}

interface SubmittedStroke {
  width: number
  points: { x: number; y: number }[]
}

/** The box the submitted strokes should paint, widened by half a brush. */
function expectedInkBox(strokes: SubmittedStroke[]): InkBox {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const stroke of strokes) {
    const halfBrush = stroke.width / 2
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x - halfBrush)
      minY = Math.min(minY, point.y - halfBrush)
      maxX = Math.max(maxX, point.x + halfBrush)
      maxY = Math.max(maxY, point.y + halfBrush)
    }
  }

  return { minX, minY, maxX, maxY, pixels: 0 }
}

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
    // Before the first navigation, so the snapshot fetched on load is recorded too.
    const traffic = pages.map((page) => recordTraffic(page))
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
    const guesserTraffic = traffic.filter((_, index) => index !== drawerIndex)

    // The word itself, taken off the one screen that is allowed to have it. The
    // prompt renders as the paragraph next to the "Your prompt" label
    // (SketchAndGuessGameBoard.tsx, DrawerCanvasView), so the label locates it
    // rather than standing in for it.
    await expect(drawerBoard.getByText('Your prompt')).toBeVisible()
    const prompt = (
      await drawerBoard.getByText('Your prompt').locator('xpath=following-sibling::p').first().innerText()
    ).trim()
    // If this ever reads empty the leak assertions below would pass on nothing.
    expect(prompt.length, 'the drawer was not shown a prompt to keep secret').toBeGreaterThanOrEqual(3)

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

    // The drawing itself, on the guessers' canvases.
    //
    // The phase flip above says the server accepted the move; it says nothing
    // about whether the strokes survived it. A server that dropped
    // `drawingContent` would leave every guesser in front of a blank white
    // square with a guess box under it, which is the one outcome this game
    // cannot survive, so the pixels are read back and compared with the strokes
    // the drawer actually sent. `parseDrawingContent` yields no strokes when the
    // content is missing and SketchCanvas then paints white, so a blank canvas
    // is exactly what a discarded drawing looks like.
    const submittedBody = drawingResponse.request().postDataJSON() as { data: { content: string } }
    const submittedStrokes = (JSON.parse(submittedBody.data.content) as { strokes: SubmittedStroke[] })
      .strokes
    expect(submittedStrokes.length, 'the drawer submitted no strokes').toBeGreaterThan(0)
    const expectedBox = expectedInkBox(submittedStrokes)

    for (const [index, board] of guesserBoards.entries()) {
      // Painting is a React effect on the arriving state, so poll rather than
      // read once.
      await expect
        .poll(async () => (await readInkBox(board))?.pixels ?? 0, {
          timeout: 20_000,
          message: `guesser ${index} was left with a blank canvas - the drawing did not reach them`,
        })
        .toBeGreaterThan(0)

      const box = await readInkBox(board)
      if (!box) throw new Error(`guesser ${index} was left with a blank canvas`)
      // Antialiasing spreads a stroke by well under a pixel; 3 is slack, not a
      // tolerance that would let a different drawing through.
      const slack = 3
      expect(Math.abs(box.minX - expectedBox.minX), `guesser ${index}: left edge of the drawing`).toBeLessThanOrEqual(slack)
      expect(Math.abs(box.minY - expectedBox.minY), `guesser ${index}: top edge of the drawing`).toBeLessThanOrEqual(slack)
      expect(Math.abs(box.maxX - expectedBox.maxX), `guesser ${index}: right edge of the drawing`).toBeLessThanOrEqual(slack)
      expect(Math.abs(box.maxY - expectedBox.maxY), `guesser ${index}: bottom edge of the drawing`).toBeLessThanOrEqual(slack)
    }

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

    // The prompt, against every route it could have arrived by.
    //
    // The round never reaches `reveal` here, so for a guesser the word is a
    // secret for the whole test and must not appear in anything their browser
    // was sent. Each corpus is first proved to carry this round - a payload
    // holding `drawerId` is the round's state - because an absence asserted
    // against an empty corpus is not an assertion at all.
    const promptPattern = new RegExp(`\\b${escapeForRegExp(prompt)}\\b`, 'i')

    for (const [index, page] of guesserPages.entries()) {
      // Route one: the viewer-sanitized snapshot. Asked for from inside the
      // guesser's own page, with their own guest token, so it is the same
      // request the app makes (lib/auth-headers.ts) answered for the same
      // identity. Asking for it rather than waiting for one is what makes this
      // check deterministic: a guesser can get through a whole round on
      // realtime alone and never refetch.
      const snapshot = await page.evaluate(async (lobbyCode) => {
        const token = window.localStorage.getItem('boardly_guest_token')
        const response = await fetch(`/api/lobby/${lobbyCode}`, {
          headers: token ? { 'X-Guest-Token': token } : {},
        })
        return response.text()
      }, code)

      expect(
        snapshot.includes('drawerId'),
        `guesser ${index} got no round state back from GET /api/lobby/${code}, so this check proves nothing`
      ).toBe(true)
      expect(
        promptPattern.test(snapshot),
        `guesser ${index} was handed the prompt "${prompt}" by GET /api/lobby/${code}`
      ).toBe(false)
    }

    for (const [index, recorded] of guesserTraffic.entries()) {
      const { http, realtime } = await settleTraffic(recorded)

      // Route two: the shared broadcasts. `drawerId` only occurs inside a
      // round, so a payload carrying it is this round arriving over realtime.
      // Unquoted, because the snapshot carries the state as an escaped JSON
      // string while a broadcast carries it as an object.
      const stateFrames = realtime.filter((frame) => frame.includes('drawerId'))
      expect(
        stateFrames.length,
        `guesser ${index} never received this round over realtime, so the realtime leak check proves nothing`
      ).toBeGreaterThan(0)

      const leakedOverRealtime = realtime.filter((frame) => promptPattern.test(frame))
      expect(
        leakedOverRealtime.length,
        `guesser ${index} was handed the prompt "${prompt}" over realtime: ${leakedOverRealtime[0]?.slice(0, 500)}`
      ).toBe(0)

      // Route three, and anything else: a sweep over every `/api/` body this
      // browser was handed, move responses and action payloads included. No
      // corpus proof is needed here - the snapshot above is the HTTP path's
      // proof, and this is the net around it.
      const leakedOverHttp = http.filter((body) => promptPattern.test(body))
      expect(
        leakedOverHttp.length,
        `guesser ${index} was handed the prompt "${prompt}" over HTTP: ${leakedOverHttp[0]?.slice(0, 500)}`
      ).toBe(0)
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
