/**
 * Product screenshots of the seven available games (#932).
 *
 * A script, not a test: `npm run capture:screenshots`. It starts a dev server
 * on a free port, and for each game creates a lobby over the API against the
 * dev database, seats a guest, reaches an in-game state with a few moves made,
 * and captures one frame at 1280×800 and one at 390×844 into
 * public/screenshots/<game>-{desktop,mobile}.png. Nothing a player would see
 * is hidden. Bots fill the seats of the move-based games; Guess the Spy and
 * Alias get real guests joined over /api/lobby/<code>/join-guest, the same way
 * a three-player game is tested by hand (CLAUDE.md).
 *
 * Setup borrows e2e/support: lobbies carry the E2E marker so the suite's
 * teardown removes them. The guests are minted with ordinary display names —
 * "E2Ex7k2q" would be in every screenshot — so the script remembers their ids
 * and deletes them itself.
 *
 * A free port rather than the suite's 3100: the e2e suite of another checkout
 * may be holding it, and reusing somebody else's server would capture their
 * working copy.
 */
import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import path from 'node:path'
import dotenv from 'dotenv'
import sharp from 'sharp'
import {
  chromium,
  request as playwrightRequest,
  type APIRequestContext,
  type Browser,
  type BrowserContextOptions,
  type Locator,
  type Page,
} from '@playwright/test'
import { describeTargetMismatch } from './support/database-target'
import globalTeardown from './support/global-teardown'
import { contextForGuest, createGuest, createGuestLobby, joinAsGuest, type Guest } from './support/lobby'
import { clearLoopbackRateLimits } from './support/rate-limits'

const ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'public', 'screenshots')
const MAX_BYTES = 300 * 1024

const DESKTOP: BrowserContextOptions = { viewport: { width: 1280, height: 800 } }
const MOBILE: BrowserContextOptions = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
}

// Display names for the seats. A name already taken in the database comes
// back suffixed ("Noah-guest-"), which the header would then show, so a guest
// whose name did not survive is dropped and the next name tried.
const NAMES = ['Mia', 'Noah', 'Liv', 'Jonas', 'Emma', 'Oskar', 'Nora', 'Filip', 'Sara', 'Aksel']

for (const file of ['.env.local', '.env']) {
  const file_ = path.resolve(ROOT, file)
  if (existsSync(file_)) dotenv.config({ path: file_, override: false, quiet: true })
}

const mismatch = describeTargetMismatch({ baseUrl: undefined, databaseUrl: process.env.DATABASE_URL })
if (mismatch) throw new Error(mismatch)

interface GameState {
  status: string
  players: Array<{ id: string; name?: string }>
  currentPlayerIndex: number
  data: Record<string, unknown>
}

interface Session {
  request: APIRequestContext
  browser: Browser
  baseURL: string
  host: Guest
  /** Every guest the run minted, deleted at the end. */
  minted: Guest[]
  /** Names not yet handed to a seat. */
  names: string[]
}

interface Frame {
  guest: Guest
  page: Page
}

interface Capture {
  /** File name stem, `public/screenshots/<slug>-desktop.png`. */
  slug: string
  gameType: string
  /** Drive the game to the frame worth capturing; returns whose screen it is, and that screen. */
  play: (session: Session, code: string, page: Page) => Promise<Frame>
  /** Something that is on screen once the in-game view has rendered, in both layouts. */
  ready: (page: Page) => Promise<void>
}

// ---------------------------------------------------------------------------
// Plumbing

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      server.close(() => resolve(port))
    })
  })
}

async function startDevServer(port: number): Promise<() => void> {
  const child = spawn(path.join(ROOT, 'node_modules', '.bin', 'next'), ['dev', '-p', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: true,
  })
  const stop = () => {
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        // Already gone.
      }
    }
  }
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/`)
      if (res.ok) return stop
    } catch {
      // Not listening yet.
    }
    await sleep(1000)
  }
  stop()
  throw new Error(`next dev did not answer on port ${port} within 180s`)
}

/** Whether `locator` becomes visible within `timeoutMs`; isVisible() itself does not wait. */
function appears(locator: Locator, timeoutMs: number): Promise<boolean> {
  return locator.waitFor({ state: 'visible', timeout: timeoutMs }).then(
    () => true,
    () => false
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor<T>(what: string, probe: () => Promise<T | null | undefined | false>, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await probe()
    if (value) return value
    await sleep(400)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

function authHeaders(baseURL: string, guest: Guest): Record<string, string> {
  return { Origin: baseURL, 'X-Guest-Token': guest.guestToken }
}

async function post(session: Session, url: string, guest: Guest, data: unknown): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await session.request.post(`${session.baseURL}${url}`, { headers: authHeaders(session.baseURL, guest), data })
  return { ok: res.ok(), status: res.status(), body: await res.json().catch(() => null) }
}

async function lobbyState(session: Session, code: string): Promise<{ gameId: string; state: GameState }> {
  const res = await session.request.get(`${session.baseURL}/api/lobby/${code}`, {
    headers: authHeaders(session.baseURL, session.host),
  })
  if (!res.ok()) throw new Error(`GET /api/lobby/${code}: ${res.status()}`)
  const body = await res.json()
  const game = body?.activeGame
  if (!game?.id) throw new Error(`Lobby ${code} has no active game`)
  const state = typeof game.state === 'string' ? JSON.parse(game.state) : game.state
  return { gameId: game.id, state }
}

/** Poll the server state until `check` returns a value; the board, not the DOM, says whose turn it is. */
function waitForState<T>(session: Session, code: string, what: string, check: (state: GameState) => T | null | undefined | false, timeoutMs = 45_000): Promise<T> {
  return waitFor(what, async () => check((await lobbyState(session, code)).state), timeoutMs)
}

function isMyTurn(state: GameState, guest: Guest): boolean {
  return state.status === 'playing' && state.players[state.currentPlayerIndex]?.id === guest.guestId
}

async function addBot(session: Session, code: string): Promise<void> {
  const res = await post(session, `/api/lobby/${code}/add-bot`, session.host, { difficulty: 'medium' })
  if (!res.ok) throw new Error(`add-bot on ${code}: ${res.status} ${JSON.stringify(res.body)}`)
}

async function join(session: Session, code: string): Promise<Guest> {
  while (session.names.length > 0) {
    const name = session.names.shift()!
    const guest = await joinAsGuest(session.request, code, session.baseURL, name)
    session.minted.push(guest)
    if (guest.guestName === name) return guest
    await post(session, `/api/lobby/${code}/leave`, guest, {})
  }
  throw new Error('Ran out of display names for the seats')
}

async function mintHost(request: APIRequestContext, baseURL: string, names: string[], minted: Guest[]): Promise<Guest> {
  while (names.length > 0) {
    const name = names.shift()!
    const guest = await createGuest(request, baseURL, name)
    minted.push(guest)
    if (guest.guestName === name) return guest
  }
  throw new Error('Ran out of display names for the host')
}

async function chat(session: Session, code: string, guest: Guest, message: string): Promise<void> {
  await post(session, `/api/lobby/${code}/chat`, guest, { message })
}

async function openLobby(session: Session, guest: Guest, code: string, options: BrowserContextOptions): Promise<Page> {
  const context = await contextForGuest(session.browser, guest, options)
  const page = await context.newPage()
  // Next's dev-tools button is tooling, not something a player sees.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = 'nextjs-portal { display: none !important; }'
      document.head.append(style)
    })
  })
  await page.goto(`${session.baseURL}/lobby/${code}`, { waitUntil: 'domcontentloaded' })
  return page
}

async function startGame(page: Page): Promise<void> {
  const start = page.getByRole('button', { name: /start game/i })
  await start.waitFor({ state: 'visible', timeout: 30_000 })
  await waitFor('the start button to be enabled', async () => start.isEnabled(), 30_000)
  await start.click()
}

async function compressed(png: Buffer): Promise<Buffer> {
  // Palette PNGs are a fraction of the size of RGBA ones for flat UI; the
  // quality steps down only if a frame still misses the budget.
  for (const quality of [90, 80, 70, 60]) {
    const out = await sharp(png).png({ palette: true, quality, compressionLevel: 9, effort: 10 }).toBuffer()
    if (out.byteLength <= MAX_BYTES) return out
  }
  throw new Error(`Frame is over ${MAX_BYTES} bytes even at the lowest palette quality`)
}

async function snap(page: Page, file: string): Promise<void> {
  // Park the pointer so no column or tile is drawn in its hover state, and
  // let the last move's pop animation and the fonts settle.
  await page.mouse.move(0, 0)
  // A click that scrolled a control into view must not leave the frame scrolled.
  await page.evaluate(() => window.scrollTo(0, 0))
  await sleep(1500)
  const png = await page.screenshot({ type: 'png', animations: 'disabled' })
  const out = await compressed(png)
  writeFileSync(path.join(OUT_DIR, file), out)
  console.log(`wrote public/screenshots/${file} (${Math.round(out.byteLength / 1024)} KB)`)
}

// ---------------------------------------------------------------------------
// The games

const CAPTURES: Capture[] = [
  {
    slug: 'tic-tac-toe',
    gameType: 'tic_tac_toe',
    ready: (page) => page.getByRole('button', { name: /^cell /i }).first().waitFor({ state: 'visible', timeout: 30_000 }),
    async play(session, code, page) {
      await addBot(session, code)
      await startGame(page)
      await this.ready(page)
      // Centre, then a corner: two X marks, two O replies, nothing decided yet.
      for (const [coord, marks] of [
        ['B2', 2],
        ['A1', 4],
      ] as const) {
        await waitForState(session, code, 'my turn', (s) => isMyTurn(s, session.host))
        await page.getByRole('button', { name: `cell ${coord}` }).click()
        await waitForState(session, code, `${marks} marks on the board`, (s) => {
          const board = s.data.board as (string | null)[][]
          return board.flat().filter(Boolean).length >= marks && isMyTurn(s, session.host)
        })
      }
      return { guest: session.host, page }
    },
  },
  {
    slug: 'connect-four',
    gameType: 'connect_four',
    ready: (page) => page.getByRole('button', { name: 'column 4' }).first().waitFor({ state: 'visible', timeout: 30_000 }),
    async play(session, code, page) {
      await addBot(session, code)
      await startGame(page)
      await this.ready(page)
      for (const [column, discs] of [
        [4, 2],
        [3, 4],
        [5, 6],
      ] as const) {
        await waitForState(session, code, 'my turn', (s) => isMyTurn(s, session.host))
        // The board's click zone overlays the cells, so the click goes to the
        // cell's position rather than through the button it labels.
        await page.getByRole('button', { name: `column ${column}` }).first().click({ force: true })
        await waitForState(session, code, `${discs} discs dropped`, (s) => {
          const board = s.data.board as (number | null)[][]
          return board.flat().filter((cell) => cell !== null).length >= discs && isMyTurn(s, session.host)
        })
      }
      return { guest: session.host, page }
    },
  },
  {
    slug: 'memory',
    gameType: 'memory',
    // The phone layout keeps a second, hidden grid for landscape, so ask for a visible tile.
    ready: (page) => page.locator('.memory-tile:visible').first().waitFor({ state: 'visible', timeout: 30_000 }),
    async play(session, code, page) {
      await addBot(session, code)
      await startGame(page)
      await this.ready(page)
      // Play it properly: remember every face that has been shown, turn a
      // known pair when there is one, otherwise two new cards. Stop once a
      // pair is on the table so the frame shows a game under way.
      type Card = { id: string; value: string; isMatched: boolean; isFlipped: boolean }
      // A mismatch stays face up until the client sends resolve-mismatch, and
      // only then does the turn pass — so "my turn" means my turn with nothing
      // pending, or the bot's reply would land between the two clicks.
      const myCleanTurn = (s: GameState) =>
        isMyTurn(s, session.host) &&
        (s.data.flippedCardIds as string[]).length === 0 &&
        (s.data.pendingMismatchCardIds as string[]).length === 0
      const seen = new Map<string, string>()
      for (let turn = 0; turn < 8; turn += 1) {
        const state = await waitForState(session, code, 'my turn', (s) => (myCleanTurn(s) ? s : null), 90_000)
        const cards = state.data.cards as Card[]
        for (const card of cards) if (card.value) seen.set(card.id, card.value)
        const open = cards.filter((c) => !c.isMatched && !c.isFlipped)
        const byValue = new Map<string, string[]>()
        for (const card of open) {
          const value = seen.get(card.id)
          if (value) byValue.set(value, [...(byValue.get(value) ?? []), card.id])
        }
        const known = [...byValue.values()].find((ids) => ids.length === 2)
        const unknown = open.filter((c) => !seen.has(c.id)).map((c) => c.id)
        const picks = known ?? [unknown[0] ?? open[0].id, unknown[1] ?? open[1].id]
        const tiles = page.locator('.memory-tile:visible')
        for (const id of picks) {
          const index = cards.findIndex((c) => c.id === id)
          await tiles.nth(index).click()
          // The server echoes the face once the flip lands.
          const shown = await waitForState(session, code, `card ${id} to show`, (s) => {
            const card = (s.data.cards as Card[]).find((c) => c.id === id)
            return card?.value ? card : null
          })
          seen.set(id, shown.value)
        }
        const matched = (await lobbyState(session, code)).state.data.cards as Card[]
        if (matched.filter((c) => c.isMatched).length >= 2) break
      }
      // Come back on the host's turn so a fresh page renders a quiet board.
      await waitForState(session, code, 'my turn', myCleanTurn, 90_000)
      return { guest: session.host, page }
    },
  },
  {
    slug: 'yahtzee',
    gameType: 'yahtzee',
    ready: (page) => page.getByRole('button', { name: /^Roll/ }).first().waitFor({ state: 'visible', timeout: 30_000 }),
    async play(session, code, page) {
      await addBot(session, code)
      await startGame(page)
      await this.ready(page)
      const roll = page.getByRole('button', { name: /^Roll/ }).first()
      await waitForState(session, code, 'my turn', (s) => isMyTurn(s, session.host))
      await roll.click()
      await waitForState(session, code, 'the first roll', (s) => (s.data.rollsLeft as number) === 2)
      // Hold two dice and roll again, then take the best category on offer.
      const dice = page.getByRole('button', { name: /^Dice showing/ })
      await dice.nth(0).click()
      await dice.nth(1).click()
      await waitFor('the roll button', async () => roll.isEnabled(), 15_000)
      await roll.click()
      await waitForState(session, code, 'the second roll', (s) => (s.data.rollsLeft as number) === 1)
      await page.getByRole('button', { name: /: \+\d+$/ }).first().click()
      // The bot takes its turn; then one roll into the second turn is the frame.
      await waitForState(session, code, 'the bot to pass the turn back', (s) => isMyTurn(s, session.host) && (s.data.rollsLeft as number) === 3, 90_000)
      await waitFor('the roll button', async () => roll.isEnabled(), 15_000)
      await roll.click()
      await waitForState(session, code, 'the second turn roll', (s) => (s.data.rollsLeft as number) === 2)
      return { guest: session.host, page }
    },
  },
  {
    slug: 'rock-paper-scissors',
    gameType: 'rock_paper_scissors',
    ready: (page) => page.getByRole('button', { name: 'Rock' }).waitFor({ state: 'visible', timeout: 30_000 }),
    async play(session, code, page) {
      await addBot(session, code)
      await startGame(page)
      await this.ready(page)
      await page.getByRole('button', { name: 'Rock' }).click()
      await page.getByText(/takes the round|won this round|lost this round|round is replayed/i).first().waitFor({ timeout: 20_000 })
      // The reveal plays out, then the next round opens with the score on the board.
      await waitFor('the next round', async () => page.getByRole('button', { name: 'Rock' }).isEnabled(), 20_000)
      return { guest: session.host, page }
    },
  },
  {
    slug: 'spy',
    gameType: 'guess_the_spy',
    ready: (page) => page.getByText(/question round|role assignment/i).first().waitFor({ state: 'visible', timeout: 30_000 }),
    async play(session, code, page) {
      const fillers = [await join(session, code), await join(session, code)]
      await startGame(page)
      // The creator's page initialises the round; everyone then confirms their role.
      const ready = page.getByRole('button', { name: /i'm ready/i })
      await ready.waitFor({ state: 'visible', timeout: 45_000 })
      const { gameId } = await lobbyState(session, code)
      for (const filler of fillers) await post(session, `/api/game/${gameId}/spy-action`, filler, { action: 'player-ready' })
      await ready.click()
      await page.getByText(/question round/i).first().waitFor({ timeout: 30_000 })
      await chat(session, code, fillers[0], 'ok, who is being vague today?')
      await chat(session, code, fillers[1], 'not me, ask away')
      // Whoever asks first: the host through the form, or a filler over the API.
      const question = page.locator('textarea').first()
      const hostAsks = await appears(question, 5_000)
      if (hostAsks) {
        await question.fill('What do people usually wear here?')
        await page.getByRole('button', { name: /^ask$/i }).click()
      } else {
        for (const filler of fillers) {
          const res = await post(session, `/api/game/${gameId}/spy-action`, filler, {
            action: 'ask-question',
            data: { targetId: session.host.guestId, question: 'What do people usually wear here?' },
          })
          if (res.ok) break
        }
      }
      await waitForState(session, code, 'the question to be pending', (s) => Boolean(s.data.pendingQuestion))
      return { guest: session.host, page }
    },
  },
  {
    slug: 'alias',
    gameType: 'alias',
    ready: (page) => page.locator('[data-testid="alias-describer-screen"], [data-testid="alias-guesser-screen"]').first().waitFor({ state: 'visible', timeout: 30_000 }),
    async play(session, code, page) {
      const fillers: Guest[] = []
      for (let seat = 0; seat < 3; seat += 1) fillers.push(await join(session, code))
      await startGame(page)
      await page.getByTestId('alias-team-assignment').waitFor({ timeout: 45_000 })
      await page.getByRole('button', { name: /start rounds/i }).click()
      await this.ready(page)
      await chat(session, code, fillers[0], 'go go go')
      await chat(session, code, fillers[1], 'is it an animal?')
      // The frame is the describer's: word cards and the clock. That is the
      // host on the first turn; if not, the describer's own screen is used.
      let describer = session.host
      let screen = page
      if (!(await appears(page.getByTestId('alias-describer-screen'), 3_000))) {
        for (const filler of fillers) {
          const candidate = await openLobby(session, filler, code, DESKTOP)
          if (await appears(candidate.getByTestId('alias-describer-screen'), 15_000)) {
            describer = filler
            screen = candidate
            break
          }
          await candidate.context().close()
        }
      }
      // Two words guessed, so the score and the pile are not empty.
      for (let i = 0; i < 2; i += 1) {
        const guessed = screen.getByRole('button', { name: /guessed correctly/i }).first()
        await guessed.waitFor({ state: 'visible', timeout: 20_000 })
        await guessed.click()
        await sleep(1200)
      }
      if (screen !== page) await page.context().close()
      return { guest: describer, page: screen }
    },
  },
]

// ---------------------------------------------------------------------------

async function captureGame(session: Session, capture: Capture): Promise<void> {
  const maxPlayers = capture.gameType === 'alias' ? 4 : capture.gameType === 'guess_the_spy' ? 3 : 2
  const { code } = await createGuestLobby(session.request, capture.gameType, session.baseURL, maxPlayers, session.host)
  console.log(`${capture.slug}: lobby ${code}`)

  try {
    const { guest, page: desktop } = await capture.play(session, code, await openLobby(session, session.host, code, DESKTOP))
    await capture.ready(desktop)
    await snap(desktop, `${capture.slug}-desktop.png`)
    await desktop.context().close()

    // The same seat on a phone: the server state renders the same game.
    const mobile = await openLobby(session, guest, code, MOBILE)
    await capture.ready(mobile)
    await snap(mobile, `${capture.slug}-mobile.png`)
    await mobile.context().close()
  } finally {
    // One open lobby per person (#907): the host has to leave this one before
    // the next game's lobby can be created.
    const left = await post(session, `/api/lobby/${code}/leave`, session.host, {})
    if (!left.ok) console.warn(`${capture.slug}: the host could not leave ${code} (${left.status})`)
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })
  const only = process.argv.slice(2)
  const captures = only.length > 0 ? CAPTURES.filter((c) => only.includes(c.slug)) : CAPTURES
  if (captures.length === 0) throw new Error(`No game matches ${only.join(', ')}`)

  const port = await freePort()
  const baseURL = `http://localhost:${port}`
  const stopServer = await startDevServer(port)
  const browser = await chromium.launch()
  const request = await playwrightRequest.newContext()
  const minted: Guest[] = []

  try {
    await clearLoopbackRateLimits().catch(() => 0)
    const names = [...NAMES]
    const host = await mintHost(request, baseURL, names, minted)
    const session: Session = { request, browser, baseURL, host, minted, names }

    const failed: string[] = []
    for (const capture of captures) {
      await clearLoopbackRateLimits().catch(() => 0)
      try {
        await captureGame(session, capture)
      } catch (error) {
        // One game's flow breaking should not cost the other six their frames.
        failed.push(capture.slug)
        console.error(`${capture.slug}: ${error instanceof Error ? error.message : error}`)
      }
    }
    if (failed.length > 0) throw new Error(`No frame for: ${failed.join(', ')}`)
  } finally {
    await request.dispose()
    await browser.close()
    stopServer()
    // Lobbies first (games and players cascade from them), then the guests.
    globalTeardown()
    if (minted.length > 0) {
      try {
        const output = execFileSync('npx', ['tsx', path.join(__dirname, 'support', 'delete-guests.ts'), ...minted.map((g) => g.guestId)], {
          encoding: 'utf8',
          cwd: ROOT,
        })
        process.stdout.write(output)
      } catch (error) {
        console.warn(`capture: could not remove the guests it minted — ${error}`)
      }
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
