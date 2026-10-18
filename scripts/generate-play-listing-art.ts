// Draws the Google Play listing art into android/listing/graphics/; the README there lists every file.
//   npx tsx scripts/generate-play-listing-art.ts                    icon + feature graphics
//   npx tsx scripts/generate-play-listing-art.ts --screenshots      also the phone screenshots, from production
//   ... --screenshots --langs en,no --only checkers,lobby           a subset
//   ... --compose-only                                              re-caption the captures in tmp/play-listing/raw
// The two guests it plays as on production are kept in tmp/play-listing/, so a rerun reuses them.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import sharp from 'sharp'
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { GameGlyph } from '../components/GameIcon'
import en from '../locales/en'
import no from '../locales/no'
import uk from '../locales/uk'
import ru from '../locales/ru'
import de from '../locales/de'
import es from '../locales/es'

const SITE = 'https://boardly.online'
const PLAY_LAUNCH = `${SITE}/?utm_source=android_app&utm_medium=twa`
const OUT = path.join(process.cwd(), 'android', 'listing', 'graphics')
const STATE = path.join(process.cwd(), 'tmp', 'play-listing')
const LOCALES = { en, no, uk, ru, de, es } as const
type Lang = keyof typeof LOCALES
const ALL_LANGS = Object.keys(LOCALES) as Lang[]

// Same ground as the maskable icons in scripts/generate-brand-icons.mjs (--bd-bg).
const PAPER = '#FBF6EE'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
// Bricolage ships Latin only; the site's own Inter carries Cyrillic, where --bd-font-display would fall back to Arial.
const DISPLAY_FONT = "'Bricolage Grotesque', Inter, sans-serif"
const HOST_NAME = 'Mira'
const FRIEND_NAME = 'Jonas'

type ShotId = 'connect-four' | 'lobby' | 'checkers' | 'games' | 'spy' | 'tic-tac-toe'
const SHOTS: { id: ShotId; file: string; caption: string }[] = [
  { id: 'connect-four', file: '01-connect-four', caption: 'home.statsBotsAvailable' },
  { id: 'lobby', file: '02-lobby', caption: 'auth.login.heroChipGuests' },
  { id: 'checkers', file: '03-checkers', caption: 'games.checkers.detail.step4Title' },
  { id: 'games', file: '04-games', caption: 'home.chooseWhatToPlay' },
  { id: 'spy', file: '05-spy-rules', caption: 'home.marquee.findTheSpy' },
  { id: 'tic-tac-toe', file: '06-tic-tac-toe', caption: 'home.marquee.quickTicTacToe' },
]
const FEATURE_GAMES = [
  { svgId: 'connect-four', accent: 'var(--bd-coral)' },
  { svgId: 'yahtzee', accent: 'var(--bd-sky)' },
  { svgId: 'ludo', accent: 'var(--bd-sun)' },
  { svgId: 'spy', accent: 'var(--bd-lav)' },
  { svgId: 'guess-my-drawing', accent: 'var(--bd-mint)' },
  { svgId: 'checkers', accent: 'var(--bd-coral)' },
]

function t(lang: Lang, key: string): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], LOCALES[lang])
  if (typeof value !== 'string') throw new Error(`locales/${lang}.ts has no string at ${key}`)
  return value
}

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const option = (name: string) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const langs = (option('--langs')?.split(',') ?? ALL_LANGS) as Lang[]
const only = new Set((option('--only')?.split(',') ?? SHOTS.map((shot) => shot.id)) as ShotId[])

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const kb = (file: string) => `${(statSync(file).size / 1024).toFixed(0)} KB`
const rel = (file: string) => path.relative(process.cwd(), file)

async function icon() {
  // Play rounds the square itself, so the mark (406 of tile.svg's 512 units) sits on the 384px keyline grid.
  const markSize = Math.round((512 * 0.75 * 512) / 406)
  const mark = await sharp(readFileSync('assets/brand/tile.svg'), { density: 144 }).resize(markSize, markSize).png().toBuffer()
  const file = path.join(OUT, 'icon-512.png')
  await sharp({ create: { width: 512, height: 512, channels: 4, background: PAPER } })
    .composite([{ input: mark, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(file)
  console.log(`${rel(file).padEnd(64)} ${kb(file)}`)
}

function bTile(size: number) {
  const shadow = Math.max(3, Math.round(size / 12))
  return `<span style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.28)}px;background:var(--bd-ink);color:var(--bd-sun);display:grid;place-items:center;font-family:${DISPLAY_FONT};font-weight:800;font-size:${Math.round(size * 0.58)}px;line-height:1;box-shadow:${shadow}px ${shadow}px 0 var(--bd-coral);flex-shrink:0">B</span>`
}

function sticker(svgId: string, accent: string, glyphSize: number, rotate: number) {
  const box = glyphSize + 26
  const lift = Math.max(3, Math.round(box * 0.06))
  const glyph = renderToStaticMarkup(
    createElement(GameGlyph, { gameId: svgId, size: glyphSize, color: 'var(--bd-ink-on-accent)', detailColor: accent, outlineColor: 'transparent', shineColor: 'rgba(255,255,255,0.28)' })
  )
  return `<div style="width:${box}px;height:${box}px;border-radius:${Math.round(box * 0.27)}px;background:${accent};border:3px solid var(--bd-ink);box-shadow:${lift}px ${lift}px 0 var(--bd-ink);transform:rotate(${rotate}deg);display:flex;align-items:center;justify-content:center;flex-shrink:0">${glyph}</div>`
}

function featureMarkup(lang: Lang) {
  const stickers = FEATURE_GAMES.map((game, index) => sticker(game.svgId, game.accent, 58, index % 2 === 0 ? -5 : 4)).join('')
  return `<div id="art" class="bd-dot-grid" style="position:relative;overflow:hidden;box-sizing:border-box;width:1024px;height:500px;background-color:var(--bd-bg);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 72px">
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 6% 0%, color-mix(in srgb, var(--bd-sun) 26%, transparent), transparent 42%),radial-gradient(circle at 100% 100%, color-mix(in srgb, var(--bd-lav) 22%, transparent), transparent 46%)"></div>
    <div style="position:relative;display:flex;align-items:center;gap:22px">${bTile(100)}<span style="font-family:${DISPLAY_FONT};font-weight:800;font-size:96px;line-height:1;letter-spacing:-0.035em;color:var(--bd-ink);padding-bottom:6px">boardly</span></div>
    <p style="position:relative;margin:26px 0 0;max-width:860px;text-align:center;text-wrap:balance;font-family:${DISPLAY_FONT};font-weight:800;font-size:40px;line-height:1.15;letter-spacing:-0.02em;color:var(--bd-coral-deep)">${escapeHtml(t(lang, 'home.heroTagline'))}</p>
    <div style="position:relative;display:flex;gap:30px;margin-top:46px">${stickers}</div>
  </div>`
}

function captionMarkup(caption: string, screenshot: string) {
  // 1080x1920: a caption band of 330px (17%, under Play's 20% for taglines) over the screen.
  return `<div id="art" style="position:relative;overflow:hidden;width:1080px;height:1920px;background:var(--bd-ink)">
    <div style="position:absolute;left:0;right:0;top:0;height:330px;display:flex;align-items:center;justify-content:center;padding:24px 90px 0;box-sizing:border-box">
      <p style="margin:0;text-align:center;text-wrap:balance;font-family:${DISPLAY_FONT};font-weight:800;font-size:82px;line-height:1.04;letter-spacing:-0.025em;color:var(--bd-bg)">${escapeHtml(caption)}</p>
    </div>
    <img src="${screenshot}" width="844" height="1500" style="position:absolute;left:118px;top:340px;display:block;border-radius:44px;box-shadow:18px 18px 0 var(--bd-coral)" />
  </div>`
}

async function artPage(browser: Browser, scale: number, width: number, height: number) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
  await page.goto(`${SITE}/`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  if (!(await page.evaluate(() => document.fonts.check("800 24px 'Bricolage Grotesque'")))) {
    throw new Error('Bricolage Grotesque did not load from boardly.online; the art would be drawn in a fallback font')
  }
  await page.evaluate(() => document.fonts.load('800 40px Inter', 'Привіт'))
  return page
}

async function drawArt(page: Page, markup: string): Promise<Buffer> {
  await page.evaluate((html) => {
    document.documentElement.classList.remove('dark')
    document.body.style.margin = '0'
    document.body.innerHTML = html
  }, markup)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)))
  })
  return page.locator('#art').screenshot({ animations: 'disabled' })
}

async function featureGraphics(browser: Browser) {
  const page = await artPage(browser, 2, 1100, 560)
  for (const lang of langs) {
    const raw = await drawArt(page, featureMarkup(lang))
    const file = path.join(OUT, lang === 'en' ? 'feature-graphic-1024x500.png' : `feature-graphic-1024x500-${lang}.png`)
    await sharp(raw).resize(1024, 500, { kernel: 'lanczos3' }).flatten({ background: PAPER }).removeAlpha().png({ compressionLevel: 9 }).toFile(file)
    console.log(`${rel(file).padEnd(64)} ${kb(file)}`)
  }
  await page.close()
}

const rawFile = (lang: Lang, shot: ShotId) => path.join(STATE, 'raw', lang, `${SHOTS.find((each) => each.id === shot)!.file}.png`)

function hideCss() {
  const feedback = ALL_LANGS.map((lang) => `button[aria-label="${t(lang, 'feedback.buttonAriaLabel')}"]`).join(',')
  // The floating feedback button covers cards at this width; toasts and Google's consent dialog are transient.
  return `${feedback},[data-rht-toaster],.fc-consent-root,.fc-dialog-overlay{display:none!important}`
}

async function newContext(browser: Browser, stateName?: string): Promise<BrowserContext> {
  const statePath = stateName ? path.join(STATE, `${stateName}.json`) : undefined
  const context = await browser.newContext({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: ANDROID_UA,
    storageState: statePath && existsSync(statePath) ? statePath : undefined,
  })
  await context.addInitScript(() => {
    try {
      localStorage.setItem('theme', 'light')
      localStorage.setItem('boardly_onboarding', localStorage.getItem('boardly_onboarding') ?? 'skipped')
      localStorage.setItem('boardly:pwa-install-dismissed:v1', '1')
    } catch {}
  })
  return context
}

async function saveState(context: BrowserContext, name: string) {
  await context.storageState({ path: path.join(STATE, `${name}.json`) })
}

async function setLang(page: Page, lang: Lang) {
  await page.evaluate((value) => {
    localStorage.setItem('i18nextLng', value)
    localStorage.setItem('language', value)
  }, lang)
}

async function openPlayMode(page: Page) {
  await page.goto(PLAY_LAUNCH, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.documentElement.dataset.appShell === 'play', null, { timeout: 20_000 })
}

async function settle(page: Page, lang: Lang, extraMs = 1500) {
  await page.waitForFunction((value) => document.documentElement.lang === value, lang, { timeout: 20_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(extraMs)
  const shell = await page.evaluate(() => document.documentElement.dataset.appShell)
  if (shell !== 'play') throw new Error(`${page.url()} is not in Play mode (data-app-shell=${shell})`)
}

async function capture(page: Page, lang: Lang, shot: ShotId) {
  const file = rawFile(lang, shot)
  mkdirSync(path.dirname(file), { recursive: true })
  await page.mouse.move(0, 0)
  await page.addStyleTag({ content: hideCss() })
  await page.waitForTimeout(200)
  await assertNothingForbidden(page, lang, shot)
  await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' })
  console.log(`  raw ${lang} ${shot}`)
}

/** Play's IP policy: no other company's game name, and no "no download" copy inside an app listing. */
function forbiddenPhrases(lang: Lang) {
  return [
    'Yahtzee',
    'Yatzy',
    t(lang, 'games.yahtzee.name'),
    t(lang, 'home.marquee.playYahtzee'),
    t(lang, 'home.marquee.noDownload'),
    t(lang, 'home.marquee.playInBrowser'),
    t(lang, 'home.statsBrowserNative'),
    t(lang, 'home.heroSubtitle'),
    t(lang, 'home.ctaVisitorBody'),
    t(lang, 'home.howItWorks.step3.description'),
  ]
}

async function assertNothingForbidden(page: Page, lang: Lang, shot: ShotId) {
  const found = await page.evaluate((phrases) => {
    const hits: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? ''
      const parent = node.parentElement
      if (text.length < 3 || !parent) continue
      if (!phrases.some((phrase) => text.includes(phrase) || (phrase.includes(text) && text.length >= phrase.length * 0.6))) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects()) {
        if (rect.width === 0 || rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) continue
        const hit = document.elementFromPoint(Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1), Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1))
        if (hit && (parent.contains(hit) || hit.contains(parent))) hits.push(text.slice(0, 60))
      }
    }
    return hits
  }, forbiddenPhrases(lang))
  if (found.length > 0) throw new Error(`${shot} (${lang}) shows ${JSON.stringify([...new Set(found)])}`)
}

/** Scrolls the window by the smallest offset in [min, max] at which no line of text is cut by the top or bottom edge. */
async function avoidCutLines(page: Page, min: number, max: number) {
  const offset = await page.evaluate(([low, high]) => {
    const header = document.querySelector('header')?.getBoundingClientRect()
    const top = header && header.bottom > 0 ? header.bottom : 0
    const bottom = window.innerHeight
    const lines: { top: number; bottom: number }[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement
      if (!node.textContent?.trim() || !parent || parent.closest('header')) continue
      const style = getComputedStyle(parent)
      if (style.visibility === 'hidden' || style.display === 'none' || style.position === 'fixed') continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects()) {
        if (rect.height > 0 && rect.bottom > top - 400 && rect.top < bottom + 400) lines.push({ top: rect.top, bottom: rect.bottom })
      }
    }
    // No named inner functions here: tsx would wrap them in a __name() helper the page does not have.
    const candidates = Array.from({ length: high - low + 1 }, (_, index) => low + index).sort((a, b) => Math.abs(a) - Math.abs(b))
    return candidates.find((shift) => window.scrollY + shift >= 0 && !lines.some((line) => [top, bottom].some((edge) => line.top - shift < edge - 1 && line.bottom - shift > edge + 1))) ?? 0
  }, [min, max])
  if (offset !== 0) {
    await page.evaluate((shift) => window.scrollBy(0, shift), offset)
    await page.waitForTimeout(500)
  }
}

/** Reloads the current page in each language and captures it; the game state lives on the server. */
async function captureEachLanguage(page: Page, shot: ShotId, prepare?: (lang: Lang) => Promise<void>) {
  for (const lang of langs) {
    await setLang(page, lang)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await settle(page, lang, 2500)
    if (prepare) await prepare(lang)
    await capture(page, lang, shot)
  }
  await setLang(page, 'en')
}

async function spyShots(browser: Browser) {
  if (!only.has('spy')) return
  const context = await newContext(browser)
  const page = await context.newPage()
  await openPlayMode(page)
  for (const lang of langs) {
    await setLang(page, lang)
    await page.goto(`${SITE}/games/spy`, { waitUntil: 'domcontentloaded' })
    await settle(page, lang)
    const heading = page.getByRole('heading', { level: 2, name: t(lang, 'games.howToPlay'), exact: true }).first()
    await heading.waitFor({ timeout: 15_000 })
    await heading.evaluate((element) => {
      const card = element.closest('section, .bd-card') ?? element.parentElement!
      window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 14)
      // The header is sticky only while the body is in view, so on a long page it may still cover the card.
      const header = document.querySelector('header')?.getBoundingClientRect()
      if (header && header.bottom > 0) window.scrollBy(0, -header.bottom)
    })
    await page.waitForTimeout(800)
    await avoidCutLines(page, -160, 40)
    await capture(page, lang, 'spy')
  }
  await context.close()
}

async function guestToken(page: Page) {
  return page.evaluate(() => localStorage.getItem('boardly_guest_token'))
}

/** One open lobby per person (#907): leave whatever a previous run left open. */
async function leaveOpenLobby(page: Page) {
  if (!(await guestToken(page))) return
  const code = await page.evaluate(async () => {
    const response = await fetch('/api/lobby/my-active', { headers: { 'X-Guest-Token': localStorage.getItem('boardly_guest_token') ?? '' }, cache: 'no-store' })
    const body = (await response.json().catch(() => null)) as { lobby?: { code?: string } | null } | null
    return body?.lobby?.code ?? null
  })
  if (!code) return
  await page.goto(`${SITE}/lobby/${code}`, { waitUntil: 'domcontentloaded' })
  await leaveLobby(page)
}

async function leaveLobby(page: Page) {
  await setLang(page, 'en')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page, 'en', 2500)
  const leave = page.locator('button[aria-label="Leave"]:visible').first()
  if (!(await leave.isVisible().catch(() => false))) return
  await leave.click()
  const confirm = page.getByRole('button', { name: 'Confirm', exact: true })
  if (await confirm.isVisible({ timeout: 2500 }).catch(() => false)) await confirm.click()
  await page.waitForURL((url) => !/\/lobby\/[^/]+$/.test(url.pathname), { timeout: 15_000 }).catch(() => undefined)
  console.log('  left the lobby')
}

/** Opens the create page for a game in English; a host without a guest identity gets one through the gate. */
async function openCreatePage(page: Page, gameType: string) {
  await setLang(page, 'en')
  await page.goto(`${SITE}/lobby/create?gameType=${gameType}`, { waitUntil: 'domcontentloaded' })
  await settle(page, 'en')
  const nameInput = page.getByPlaceholder('Your name')
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill(HOST_NAME)
    await page.getByRole('button', { name: 'Play as Guest', exact: true }).click()
    await page.waitForFunction(() => Boolean(localStorage.getItem('boardly_guest_token')), null, { timeout: 30_000 })
    await page.waitForTimeout(1500)
  }
}

async function createLobby(page: Page, gameType: string): Promise<string> {
  await openCreatePage(page, gameType)
  // The longest turn timer the form offers, so six reloads fit inside one turn.
  await page.getByRole('button', { name: /^Lobby settings/ }).click()
  const longestTimer = page.getByRole('button', { name: '120s', exact: true })
  if (await longestTimer.isVisible().catch(() => false)) await longestTimer.click()
  // An unnamed lobby is called "Lobby <code>" in every language; a name keeps English out of the other five.
  await page.locator('#create-lobby-name').fill(`${HOST_NAME} & ${FRIEND_NAME}`)
  await page.getByRole('button', { name: 'Create Lobby', exact: true }).last().click()
  await page.waitForURL(/\/lobby\/[A-Za-z0-9]+$/, { timeout: 30_000 })
  await settle(page, 'en', 2500)
  const code = new URL(page.url()).pathname.split('/').pop()!
  console.log(`  lobby ${code} (${gameType})`)
  return code
}

async function gamesPickerShots(page: Page) {
  // Alias sorts first in all six languages, so the selected row is on screen in every shot.
  await openCreatePage(page, 'alias')
  for (const lang of langs) {
    await setLang(page, lang)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await settle(page, lang)
    await page.getByRole('button', { name: t(lang, 'lobby.create.changeGame'), exact: true }).click()
    await page.waitForTimeout(1200)
    await capture(page, lang, 'games')
  }
  await setLang(page, 'en')
}

async function lobbyShots(browser: Browser, host: Page, code: string) {
  const friendContext = await newContext(browser, 'friend')
  const friend = await friendContext.newPage()
  await openPlayMode(friend)
  await friend.goto(`${SITE}/lobby/${code}`, { waitUntil: 'domcontentloaded' })
  await settle(friend, 'en', 3000)
  const nameInput = friend.locator('input:visible').first()
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill(FRIEND_NAME)
    await friend.getByRole('button', { name: /Play as Guest/ }).click()
  } else {
    const join = friend.getByRole('button', { name: /^Join/ }).first()
    if (await join.isVisible().catch(() => false)) await join.click()
  }
  await host.getByRole('button', { name: 'Chat', exact: true }).waitFor({ timeout: 30_000 })
  await saveState(friendContext, 'friend')
  console.log(`  ${FRIEND_NAME} joined`)

  await captureEachLanguage(host, 'lobby', (lang) => foldBetweenLines(host, t(lang, 'game.ui.howToPlayTitle')))

  await friend.reload({ waitUntil: 'domcontentloaded' })
  await settle(friend, 'en', 2500)
  await friend.locator('button[aria-label="Leave"]:visible').first().click()
  await friend.waitForURL((url) => !url.pathname.startsWith(`/lobby/${code}`), { timeout: 15_000 })
  await friendContext.close()
  await host.reload({ waitUntil: 'domcontentloaded' })
  await settle(host, 'en', 2500)
  await host.getByRole('button', { name: 'Chat', exact: true }).waitFor({ state: 'detached', timeout: 30_000 })
}

async function startGame(page: Page) {
  await page.getByRole('button', { name: 'Start Game', exact: true }).last().click()
  await page.waitForTimeout(5000)
}

async function connectFourShots(page: Page) {
  const column = (n: number) => page.locator(`button[aria-label="column ${n}"]:visible`).first()
  const columnsEnabled = (enabled: boolean, timeout: number) =>
    page.waitForFunction((want) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="column 1"]')].find((each) => each.getBoundingClientRect().width > 0)
      return Boolean(button) && !button!.disabled === want
    }, enabled, { timeout })
  await columnsEnabled(true, 30_000)
  for (const n of [4, 3, 5]) {
    const box = await column(n).boundingBox()
    if (!box) throw new Error(`column ${n} has no box`)
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    await columnsEnabled(false, 8_000).catch(() => undefined)
    await columnsEnabled(true, 30_000)
    await page.waitForTimeout(1500)
  }
  await captureEachLanguage(page, 'connect-four')
}

async function ticTacToeShots(page: Page) {
  const openCells = page.locator('button[aria-label^="cell "]:visible:not([disabled])')
  const waitOpen = (open: boolean, timeout: number) =>
    page.waitForFunction((want) => {
      const cells = [...document.querySelectorAll<HTMLButtonElement>('button[aria-label^="cell "]')].filter((cell) => cell.getBoundingClientRect().width > 0)
      return cells.some((cell) => !cell.disabled) === want
    }, open, { timeout })
  for (let move = 0; move < 2; move++) {
    await waitOpen(true, 30_000)
    await page.waitForTimeout(800)
    const labels = await openCells.evaluateAll((cells) => cells.map((cell) => cell.getAttribute('aria-label')))
    const pick = ['cell B2', 'cell A1', 'cell C3', 'cell A3', 'cell C1'].find((label) => labels.includes(label)) ?? labels[0]
    const box = await page.locator(`button[aria-label="${pick}"]:visible`).first().boundingBox()
    if (!box) throw new Error(`${pick} has no box`)
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    await waitOpen(false, 8_000).catch(() => undefined)
  }
  await waitOpen(true, 30_000)
  await page.waitForTimeout(1500)
  await captureEachLanguage(page, 'tic-tac-toe')
}

async function checkersShots(page: Page) {
  const board = page.locator('[data-testid="checkers-board"]:visible')
  const movable = board.locator('button[data-movable]')
  for (let move = 0; move < 3; move++) {
    await movable.first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForTimeout(800)
    await movable.first().click()
    await board.locator('button[data-destination]').first().click()
    await page.waitForFunction(() => !document.querySelector('[data-testid="checkers-board"] button[data-movable]'), null, { timeout: 8_000 }).catch(() => undefined)
  }
  await movable.first().waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(1500)
  await captureEachLanguage(page, 'checkers')
}

/** The waiting room's player list scrolls under a fixed footer; move the fold into a gap between two lines of text. */
async function foldBetweenLines(page: Page, guideTitle: string) {
  await page.evaluate((title) => {
    const heading = [...document.querySelectorAll<HTMLElement>('section h2')].find((element) => element.textContent?.trim() === title && element.getBoundingClientRect().height > 0)
    const guide = heading?.closest('section')
    if (!guide) return
    const blocks = [...guide.querySelectorAll<HTMLElement>('h2, p, li')].filter((element) => element.getBoundingClientRect().height > 0)
    let scroller: HTMLElement | null = guide.parentElement
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement
    if (!scroller) return
    const fold = scroller.getBoundingClientRect().bottom
    const index = blocks.findIndex((element) => element.getBoundingClientRect().bottom > fold)
    if (index < 0 || blocks[index].getBoundingClientRect().top >= fold) return
    const cut = blocks[index].getBoundingClientRect()
    const next = blocks[index + 1]?.getBoundingClientRect()
    const gap = next ? Math.max(0, next.top - cut.bottom) : 16
    scroller.scrollBy(0, cut.bottom - fold + gap / 2)
  }, guideTitle)
  await page.waitForTimeout(500)
}

async function hostShots(browser: Browser) {
  const wanted = ['games', 'lobby', 'connect-four', 'checkers', 'tic-tac-toe'].filter((id) => only.has(id as ShotId))
  if (wanted.length === 0) return
  const context = await newContext(browser, 'host')
  const page = await context.newPage()
  page.on('dialog', (dialog) => void dialog.accept())
  await openPlayMode(page)
  await leaveOpenLobby(page)
  try {
    if (only.has('games')) await gamesPickerShots(page)
    await saveState(context, 'host')
    if (only.has('lobby') || only.has('connect-four')) {
      const code = await createLobby(page, 'connect_four')
      await saveState(context, 'host')
      if (only.has('lobby')) await lobbyShots(browser, page, code)
      if (only.has('connect-four')) {
        await startGame(page)
        await connectFourShots(page)
      }
      await leaveLobby(page)
    }
    if (only.has('checkers')) {
      await createLobby(page, 'checkers')
      await startGame(page)
      await checkersShots(page)
      await leaveLobby(page)
    }
    if (only.has('tic-tac-toe')) {
      await createLobby(page, 'tic_tac_toe')
      await startGame(page)
      await ticTacToeShots(page)
      await leaveLobby(page)
    }
  } finally {
    await saveState(context, 'host')
    await context.close()
  }
}

async function composeScreenshots(browser: Browser) {
  const page = await artPage(browser, 1, 1080, 1920)
  for (const lang of langs) {
    for (const shot of SHOTS.filter((each) => only.has(each.id))) {
      const source = rawFile(lang, shot.id)
      if (!existsSync(source)) throw new Error(`missing ${rel(source)}; run with --screenshots first`)
      const scaled = await sharp(source).resize(844, 1500, { kernel: 'lanczos3' }).png().toBuffer()
      const raw = await drawArt(page, captionMarkup(t(lang, shot.caption), `data:image/png;base64,${scaled.toString('base64')}`))
      const file = path.join(OUT, 'screenshots', lang, `${shot.file}.png`)
      mkdirSync(path.dirname(file), { recursive: true })
      await sharp(raw).flatten({ background: '#1F1B16' }).removeAlpha().png({ compressionLevel: 9 }).toFile(file)
      console.log(`${rel(file).padEnd(64)} ${kb(file)}`)
    }
  }
  await page.close()
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  mkdirSync(STATE, { recursive: true })
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain'] })
  try {
    if (flag('--compose-only')) {
      await composeScreenshots(browser)
      return
    }
    await icon()
    await featureGraphics(browser)
    if (flag('--screenshots')) {
      await spyShots(browser)
      await hostShots(browser)
      await composeScreenshots(browser)
    }
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
