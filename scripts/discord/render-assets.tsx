/**
 * Renders the Discord asset set from Boardly's own icon system (#942).
 *
 *   npx tsx scripts/discord/render-assets.tsx --out ../boardly-discord/assets/out/code
 *   npm run discord:assets
 *
 * Everything is drawn from the same sources the site uses: `GAME_GLYPHS` in
 * components/GameIcon.tsx (through `GameGlyph` + renderToStaticMarkup), the
 * chrome glyphs behind components/icons/Icon.tsx (named through its `IconName`
 * union, so a rename on the site breaks the build here), and the light values
 * of lib/dev/theme-tokens.ts. The sticker variant of GameIcon (accent tile,
 * 27 % radius, 2.5 px ink border, hard ink offset shadow at 6 %, rotate −6°,
 * ink glyph with the detail in the accent, 28 % white shine) is reimplemented
 * as plain SVG so sharp can rasterise it – librsvg does not read CSS custom
 * properties, so `var(--gi-*)` is substituted before rendering.
 *
 * Text (the "B", the wordmark, labels) goes through next/og's ImageResponse
 * with the vendored Bricolage Grotesque ExtraBold buffer: sharp's prebuilt
 * libvips on macOS ignores a custom fontconfig file, so SVG <text> cannot be
 * trusted to pick the font up. ImageResponse outputs PNG with alpha, which
 * sharp then composites onto the SVG-drawn tiles.
 *
 * Outputs (all under --out):
 *   emoji/bd_<name>.png       128×128, alpha, palette PNG, ≤ 256 KiB
 *   emoji/bd_<name>.gif       128×128 animated, ≤ 256 KiB (dropped when over)
 *   icon/icon-512.png         the B-tile at ~70 % on opaque paper
 *   roles/<role>-64.png       role icons (Level 2, prepared only)
 *   stickers/<name>-320.png   code-drawn sticker fallbacks, ≤ 512 KiB
 *   thumbs/<gameId>-256.png   tile on the dark band, for the LFG embeds
 *   palette/palette-card.png  1024×512, the 16 token swatches with names
 *   boost/banner-960x540.png, boost/splash-1920x1080.png (prepared only)
 *   games.json                the seven public games, pinned
 *   sheets/code-<date>.png    contact sheet (name, WxH, KiB, alpha)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { ImageResponse } from 'next/og'
import sharp from 'sharp'
import { GameGlyph } from '@/components/GameIcon'
import Icon from '@/components/icons/Icon'
import type { IconName } from '@/components/icons/names'
import { THEME_TOKENS } from '@/lib/dev/theme-tokens'

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const FONT_PATH = path.join(REPO_ROOT, 'assets', 'fonts', 'BricolageGrotesque-ExtraBold.ttf')

/** Light values of the design tokens, by name without the `bd-` prefix. */
const T: Record<string, string> = Object.fromEntries(
  THEME_TOKENS.map((token) => [token.name.replace(/^bd-/, ''), token.light.toUpperCase()])
)
const INK = T.ink
const PAPER = T.bg
const DARK_BAND = '#1E1B17' // bd-bg in html.dark, the LFG embed ground

/** The 16 swatches on the palette card (Gemini style reference). */
const PALETTE_CARD_TOKENS = [
  'coral', 'coral-deep', 'mint', 'mint-deep', 'sun', 'sun-deep', 'lav', 'lav-mid',
  'lav-deep', 'sky', 'premium', 'ink', 'ink-soft', 'ink-muted', 'bg', 'bg2',
] as const

interface PublicGame {
  id: string
  gameType: string
  name: string
  minPlayers: number
  maxPlayers: number
  supportsBots: boolean
  accentHex: string
  emojiName: string
  route: string
  lobbiesRoute: string
}

/**
 * The seven public games, pinned. Values copied from lib/game-catalog.ts
 * (`GAME_METADATA` for name, players and bots, `FEATURED_GAME_CATALOG` for the
 * routes) on 2026-09-15 rather than imported, because the catalog module pulls
 * in feature flags and this list must never follow a runtime flag. The two
 * `-deep` accents are Discord-only overrides so three coral tiles do not
 * collide in an emoji picker.
 */
const GAMES: readonly PublicGame[] = [
  { id: 'yahtzee', gameType: 'yahtzee', name: 'Yahtzee', minPlayers: 1, maxPlayers: 4, supportsBots: true, accentHex: T.sky, emojiName: 'bd_yahtzee', route: '/games/yahtzee', lobbiesRoute: '/games/yahtzee/lobbies' },
  { id: 'spy', gameType: 'guess_the_spy', name: 'Guess the Spy', minPlayers: 3, maxPlayers: 10, supportsBots: false, accentHex: T.lav, emojiName: 'bd_spy', route: '/games/spy', lobbiesRoute: '/games/spy/lobbies' },
  { id: 'tic-tac-toe', gameType: 'tic_tac_toe', name: 'Tic Tac Toe', minPlayers: 2, maxPlayers: 2, supportsBots: true, accentHex: T.coral, emojiName: 'bd_tictactoe', route: '/games/tic-tac-toe', lobbiesRoute: '/games/tic-tac-toe/lobbies' },
  { id: 'memory', gameType: 'memory', name: 'Memory', minPlayers: 2, maxPlayers: 4, supportsBots: true, accentHex: T.mint, emojiName: 'bd_memory', route: '/games/memory', lobbiesRoute: '/games/memory/lobbies' },
  { id: 'connect-four', gameType: 'connect_four', name: 'Connect Four', minPlayers: 2, maxPlayers: 2, supportsBots: true, accentHex: T['coral-deep'], emojiName: 'bd_connectfour', route: '/games/connect-four', lobbiesRoute: '/games/connect-four/lobbies' },
  { id: 'alias', gameType: 'alias', name: 'Alias', minPlayers: 3, maxPlayers: 16, supportsBots: false, accentHex: T['lav-deep'], emojiName: 'bd_alias', route: '/games/alias', lobbiesRoute: '/games/alias/lobbies' },
  { id: 'rps', gameType: 'rock_paper_scissors', name: 'Rock Paper Scissors', minPlayers: 2, maxPlayers: 2, supportsBots: true, accentHex: T.sun, emojiName: 'bd_rps', route: '/games/rock-paper-scissors', lobbiesRoute: '/games/rock-paper-scissors/lobbies' },
]

/**
 * The 30 chrome emoji: Phosphor fill glyph (the same component Icon.tsx maps
 * the name to), one accent each, no ground. Accent groups follow the community
 * design: coral for actions and heat, mint for confirmation and people, sun for
 * rewards, premium for the crown and the gem, lav for bots and masks, sky for
 * time and information. `heart` is coral rather than sky because a blue heart
 * reads as a different emoji in a picker.
 */
const CHROME: ReadonlyArray<{ name: string; icon: IconName; accent: string }> = [
  { name: 'check', icon: 'check', accent: T.mint },
  { name: 'crown', icon: 'crown', accent: T.premium },
  { name: 'trophy', icon: 'trophy', accent: T.sun },
  { name: 'dice', icon: 'dice', accent: T.sky },
  { name: 'party', icon: 'party', accent: T.sun },
  { name: 'sparkle', icon: 'sparkle', accent: T.sun },
  { name: 'chat', icon: 'chat', accent: T.sky },
  { name: 'link', icon: 'link', accent: T.mint },
  { name: 'users', icon: 'users', accent: T.mint },
  { name: 'robot', icon: 'robot', accent: T.lav },
  { name: 'bot_easy', icon: 'bot-easy', accent: T.lav },
  { name: 'bot_medium', icon: 'bot-medium', accent: T.lav },
  { name: 'bot_hard', icon: 'bot-hard', accent: T.lav },
  { name: 'mask', icon: 'mask', accent: T.lav },
  { name: 'clock', icon: 'clock', accent: T.sky },
  { name: 'hourglass', icon: 'hourglass', accent: T.sky },
  { name: 'info', icon: 'info', accent: T.sky },
  { name: 'question', icon: 'question', accent: T.sky },
  { name: 'globe', icon: 'globe', accent: T.sky },
  { name: 'bulb', icon: 'bulb', accent: T.sun },
  { name: 'pencil', icon: 'pencil', accent: T.sky },
  { name: 'rocket', icon: 'rocket', accent: T.sky },
  { name: 'heart', icon: 'heart', accent: T.coral },
  { name: 'star', icon: 'star', accent: T.sun },
  { name: 'medal', icon: 'medal', accent: T.sun },
  { name: 'flame', icon: 'flame', accent: T.coral },
  { name: 'megaphone', icon: 'megaphone', accent: T.coral },
  { name: 'gem', icon: 'gem', accent: T.premium },
  { name: 'eye', icon: 'eye', accent: T.lav },
  { name: 'play', icon: 'play', accent: T.coral },
]

/** Role icons (Level 2, prepared only): role → glyph and colour. */
const ROLE_ICONS: ReadonlyArray<{ role: string; icon: IconName; accent: string }> = [
  { role: 'premium', icon: 'crown', accent: T.premium },
  { role: 'regular', icon: 'star', accent: T.sun },
  { role: 'verified', icon: 'check', accent: T.mint },
  { role: 'staff', icon: 'shield', accent: T['lav-deep'] },
  { role: 'booster', icon: 'gem', accent: T.lav },
]

const EMOJI_NAME = /^[a-z0-9_]{2,32}$/
const KIB = 1024
const CAP_EMOJI = 256 * KIB
const CAP_STICKER = 512 * KIB

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

const rad = (deg: number) => (deg * Math.PI) / 180

/** Static markup of a GameGlyph with the CSS custom properties resolved to colours. */
function gameGlyphSvg(gameId: string, size: number, colors: { ink: string; detail: string; shine?: string }): string {
  const shine = colors.shine ?? 'rgba(255,255,255,0.28)'
  return renderToStaticMarkup(
    <GameGlyph gameId={gameId} size={size} color={colors.ink} detailColor={colors.detail} outlineColor="transparent" shineColor={shine} />
  )
    .replace(/var\(--gi-detail\)/g, colors.detail)
    .replace(/var\(--gi-outline\)/g, 'transparent')
    .replace(/var\(--gi-shine\)/g, shine)
    .replace(/currentColor/g, colors.ink)
}

/**
 * Static markup of a chrome glyph in the fill weight, the house style.
 *
 * It goes through components/icons/Icon.tsx rather than the Phosphor component
 * directly, so the names below are the `IconName` union: renaming or dropping a
 * glyph on the site is a type error here instead of a silently wrong emoji.
 *
 * Phosphor carries the colour as `fill` on the root <svg>, which `nest()`
 * rewrites away, so it is re-applied on a <g> around the paths.
 */
function chromeSvg(name: IconName, size: number, color: string): string {
  return renderToStaticMarkup(<Icon name={name} size={size} weight="fill" />)
    .replace(/(<svg [^>]*>)([\s\S]*)(<\/svg>)$/, `$1<g fill="${color}">$2</g>$3`)
    .replace(/currentColor/g, color)
}

/** Re-anchors a standalone <svg> so it can be nested at x/y with a given size. */
function nest(markup: string, x: number, y: number, size: number): string {
  const viewBox = markup.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 48 48'
  return markup.replace(/<svg [^>]*>/, `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${viewBox}">`)
}

interface TileSpec {
  /** Canvas size in px (square). */
  canvas: number
  /** Tile side in px before rotation. */
  side: number
  fill: string
  /** Shadow colour – ink for game tiles, coral for the B-tile. */
  shadow?: string
  /** Border colour; `null` for no border (the B-tile is ink on ink). */
  border?: string | null
  rotate?: number
  /** SVG fragment drawn in the tile's local frame, origin at the tile centre. */
  inner?: string
  /** SVG fragment placed before the tile (background, dot grid). */
  behind?: string
  /** Extra <defs>. */
  defs?: string
}

/** The tile geometry, mirroring GameIcon's sticker variant (see file header). */
function tileGeometry(side: number) {
  return {
    lift: Math.max(3, Math.round(side * 0.06)),
    radius: Math.round(side * 0.27),
    stroke: Math.max(2.5, (2.5 * side) / 104),
  }
}

function tileSvg(spec: TileSpec): string {
  const { canvas, side, fill } = spec
  const { lift, radius, stroke } = tileGeometry(side)
  const rotate = spec.rotate ?? -6
  const shadow = spec.shadow ?? INK
  const border = spec.border === undefined ? INK : spec.border
  const half = side / 2
  // Tile and shadow together span side + lift; centre that union on the canvas.
  const group = `translate(${canvas / 2} ${canvas / 2}) rotate(${rotate}) translate(${-lift / 2} ${-lift / 2})`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
  ${spec.defs ?? ''}
  ${spec.behind ?? ''}
  <g transform="${group}">
    <rect x="${-half + lift}" y="${-half + lift}" width="${side}" height="${side}" rx="${radius}" fill="${shadow}"/>
    <rect x="${-half}" y="${-half}" width="${side}" height="${side}" rx="${radius}" fill="${fill}"${border ? ` stroke="${border}" stroke-width="${stroke}"` : ''}/>
    ${spec.inner ?? ''}
  </g>
</svg>`
}

/** Where the tile centre lands on the canvas after the rotate/lift transform. */
function tileCentre(canvas: number, side: number, rotate = -6): { x: number; y: number } {
  const { lift } = tileGeometry(side)
  const o = -lift / 2
  const c = Math.cos(rad(rotate))
  const s = Math.sin(rad(rotate))
  return { x: canvas / 2 + o * c - o * s, y: canvas / 2 + o * s + o * c }
}

/** A game tile in the sticker language, at any canvas size. */
function gameTileSvg(game: { id: string; accentHex: string }, canvas: number, side: number, extra: Partial<TileSpec> = {}): string {
  const glyph = Math.round(side - 24 * (side / 104)) // GameIcon: box = size + 24, at the 104 px emoji tile
  const inner = nest(gameGlyphSvg(game.id, glyph, { ink: INK, detail: game.accentHex }), -glyph / 2, -glyph / 2, glyph)
  return tileSvg({ canvas, side, fill: game.accentHex, inner, ...extra })
}

/** The dot grid from opengraph-image.tsx, as an SVG pattern. */
function dotGrid(id: string, dot: string, spacing = 32, radius = 1.5): { defs: string; rect: (w: number, h: number) => string } {
  return {
    defs: `<pattern id="${id}" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse"><circle cx="${spacing / 2}" cy="${spacing / 2}" r="${radius}" fill="${dot}"/></pattern>`,
    rect: (w, h) => `<rect width="${w}" height="${h}" fill="url(#${id})"/>`,
  }
}

async function svgToPng(svg: string, opts: { palette?: boolean } = {}): Promise<Buffer> {
  const pipeline = sharp(Buffer.from(svg))
  return opts.palette === false
    ? pipeline.png({ compressionLevel: 9 }).toBuffer()
    : pipeline.png({ palette: true, quality: 90, effort: 7, compressionLevel: 9 }).toBuffer()
}

async function quantise(png: Buffer): Promise<Buffer> {
  return sharp(png).png({ palette: true, quality: 90, effort: 7, compressionLevel: 9 }).toBuffer()
}

// ---------------------------------------------------------------------------
// Text through next/og (satori + resvg) with the vendored Bricolage buffer
// ---------------------------------------------------------------------------

let fontData: Buffer | null = null

async function og(element: ReactElement, width: number, height: number): Promise<Buffer> {
  fontData ??= await readFile(FONT_PATH)
  const response = new ImageResponse(element, {
    width,
    height,
    fonts: [{ name: 'Bricolage', data: fontData, weight: 800, style: 'normal' }],
  })
  return Buffer.from(await response.arrayBuffer())
}

interface TextSpec {
  text: string
  size: number
  color: string
  canvas: number
  /** Where the visual centre of the text should land (canvas px). */
  at: { x: number; y: number }
  rotate?: number
  /** Cap-height correction: Bricolage's caps sit low in the line box. */
  nudge?: number
}

/** Transparent canvas with one word centred at `at`, rotated with the tile. */
function textLayer(spec: TextSpec): Promise<Buffer> {
  const { canvas, at, size } = spec
  const nudge = spec.nudge ?? -size * 0.04
  const dx = at.x - canvas / 2
  const dy = at.y - canvas / 2 + nudge
  return og(
    <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
      <span
        style={{
          fontFamily: 'Bricolage',
          fontSize: size,
          fontWeight: 800,
          lineHeight: 1,
          color: spec.color,
          letterSpacing: -size * 0.02,
          marginLeft: dx * 2,
          marginTop: dy * 2,
          transform: `rotate(${spec.rotate ?? -6}deg)`,
          whiteSpace: 'pre',
        }}
      >
        {spec.text}
      </span>
    </div>,
    canvas,
    canvas
  )
}

// ---------------------------------------------------------------------------
// The B-tile (canonical: ink tile, Bricolage "B" in sun, coral hard offset)
// ---------------------------------------------------------------------------

async function bTile(canvas: number, side: number, opts: { behind?: string; defs?: string; palette?: boolean } = {}): Promise<Buffer> {
  // rotate: 0 – the B-tile is upright everywhere since #1030; the game tiles keep the -6deg sticker tilt.
  const svg = tileSvg({ canvas, side, rotate: 0, fill: INK, shadow: T.coral, border: null, behind: opts.behind, defs: opts.defs })
  const base = await svgToPng(svg, { palette: false })
  const letter = await textLayer({ text: 'B', size: Math.round(side * 0.66), color: T.sun, canvas, at: tileCentre(canvas, side, 0) })
  const out = await sharp(base).composite([{ input: letter }]).png().toBuffer()
  return opts.palette === false ? out : quantise(out)
}

// ---------------------------------------------------------------------------
// Animated emoji: frame stacks → sharp's GIF encoder
// ---------------------------------------------------------------------------

async function gifFromFrames(frames: Buffer[], delay: number | number[]): Promise<Buffer> {
  return sharp(frames, { join: { animated: true } })
    .gif({ delay, loop: 0, effort: 7, colours: 128 })
    .toBuffer()
}

/** The pip layout of a die face on a 3×3 grid, as [col,row] pairs. */
const PIPS: Record<number, Array<[number, number]>> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
}

async function animDiceRoll(canvas: number): Promise<Buffer> {
  const frames: Buffer[] = []
  const side = 84
  for (let i = 0; i < 6; i++) {
    const face = i + 1
    const angle = -6 + Math.sin((i / 6) * Math.PI * 2) * 14
    const pips = PIPS[face]
      .map(([c, r]) => `<circle cx="${(c - 1) * 22}" cy="${(r - 1) * 22}" r="7" fill="${INK}"/>`)
      .join('')
    frames.push(await svgToPng(tileSvg({ canvas, side, fill: T.sun, rotate: angle, inner: pips }), { palette: false }))
  }
  return gifFromFrames(frames, 110)
}

async function animC4Drop(canvas: number): Promise<Buffer> {
  const frames: Buffer[] = []
  const side = 104
  const cells = [-28, 0, 28]
  const holes = cells.flatMap((x) => cells.map((y) => `<circle cx="${x}" cy="${y + 4}" r="10" fill="${T['coral-deep']}"/>`)).join('')
  const grid = `<rect x="-46" y="-32" width="92" height="76" rx="14" fill="${INK}"/>${holes}`
  const { radius } = tileGeometry(side)
  const steps = 8
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const y = -72 + (32 - -72) * t * t // eased fall, lands in the bottom middle hole
    const disc = `<circle cx="0" cy="${y}" r="10" fill="${T.sun}" stroke="${INK}" stroke-width="2"/>`
    const inner = `<clipPath id="tile"><rect x="${-side / 2}" y="${-side / 2}" width="${side}" height="${side}" rx="${radius}"/></clipPath>${grid}<g clip-path="url(#tile)">${disc}</g>`
    frames.push(await svgToPng(tileSvg({ canvas, side, fill: T['coral-deep'], inner }), { palette: false }))
  }
  const delays = Array.from({ length: steps }, (_, i) => (i === steps - 1 ? 600 : 70))
  return gifFromFrames(frames, delays)
}

async function animHourglassFlip(canvas: number): Promise<Buffer> {
  const frames: Buffer[] = []
  const side = 104
  const glyph = 72
  const markup = chromeSvg('hourglass', glyph, INK)
  const steps = 10
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const angle = 180 * (1 - Math.cos(t * Math.PI)) / 2
    const inner = `<g transform="rotate(${angle})">${nest(markup, -glyph / 2, -glyph / 2, glyph)}</g>`
    frames.push(await svgToPng(tileSvg({ canvas, side, fill: T.sky, inner }), { palette: false }))
  }
  const delays = Array.from({ length: steps }, (_, i) => (i === 0 || i === steps - 1 ? 700 : 60))
  return gifFromFrames(frames, delays)
}

async function animSpyPeek(canvas: number): Promise<Buffer> {
  const frames: Buffer[] = []
  const side = 104
  const glyph = 80
  const markup = gameGlyphSvg('spy', glyph, { ink: INK, detail: T.lav })
  const { radius } = tileGeometry(side)
  const offsets = [80, 52, 26, 6, 0, 0, 0, 0, 12, 40, 80]
  for (const dy of offsets) {
    const inner = `<clipPath id="tile"><rect x="${-side / 2}" y="${-side / 2}" width="${side}" height="${side}" rx="${radius}"/></clipPath><g clip-path="url(#tile)">${nest(markup, -glyph / 2, -glyph / 2 + dy, glyph)}</g>`
    frames.push(await svgToPng(tileSvg({ canvas, side, fill: T.lav, inner }), { palette: false }))
  }
  const delays = offsets.map((_, i) => (i === 7 ? 500 : i === offsets.length - 1 ? 400 : 70))
  return gifFromFrames(frames, delays)
}

async function animBBounce(canvas: number): Promise<Buffer> {
  const side = 92
  const pad = 14
  const base = await bTile(canvas, side, { palette: false })
  const tall = await sharp(base)
    .extend({ top: pad, bottom: pad, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  const steps = 10
  const frames: Buffer[] = []
  for (let i = 0; i < steps; i++) {
    const dy = Math.round(-Math.abs(Math.sin((i / steps) * Math.PI)) * 10)
    frames.push(await sharp(tall).extract({ left: 0, top: pad + dy, width: canvas, height: canvas }).png().toBuffer())
  }
  return gifFromFrames(frames, 70)
}

async function animAliasTalk(canvas: number): Promise<Buffer> {
  const frames: Buffer[] = []
  const side = 104
  const glyph = 80
  const markup = gameGlyphSvg('alias', glyph, { ink: INK, detail: T['lav-deep'] })
  const steps = 8
  for (let i = 0; i < steps; i++) {
    const scale = 1 + Math.sin((i / steps) * Math.PI) * 0.1
    const inner = `<g transform="scale(${scale.toFixed(3)})">${nest(markup, -glyph / 2, -glyph / 2, glyph)}</g>`
    frames.push(await svgToPng(tileSvg({ canvas, side, fill: T['lav-deep'], inner }), { palette: false }))
  }
  return gifFromFrames(frames, 90)
}

// ---------------------------------------------------------------------------
// Stickers (code-drawn fallbacks, 320×320)
// ---------------------------------------------------------------------------

async function stickerGg(canvas: number, side: number): Promise<Buffer> {
  const confetti = [
    `<rect x="-96" y="-80" width="22" height="10" rx="5" fill="${T.mint}" transform="rotate(-30 -85 -75)"/>`,
    `<circle cx="92" cy="-70" r="9" fill="${T.mint}"/>`,
    `<rect x="70" y="74" width="22" height="10" rx="5" fill="${T.mint}" transform="rotate(25 81 79)"/>`,
  ].join('')
  const base = await svgToPng(tileSvg({ canvas, side, fill: T.coral, inner: confetti }), { palette: false })
  const word = await textLayer({ text: 'GG', size: Math.round(side * 0.52), color: INK, canvas, at: tileCentre(canvas, side) })
  return quantise(await sharp(base).composite([{ input: word }]).png().toBuffer())
}

async function stickerOneMore(canvas: number, side: number): Promise<Buffer> {
  const glyph = Math.round(side * 0.6)
  const people = nest(chromeSvg('users', glyph, INK), -glyph / 2 - 12, -glyph / 2 + 10, glyph)
  const badgeR = Math.round(side * 0.17)
  const badge = `<circle cx="${side * 0.3}" cy="${-side * 0.3}" r="${badgeR}" fill="${T.coral}" stroke="${INK}" stroke-width="5"/>`
  const base = await svgToPng(tileSvg({ canvas, side, fill: T.sun, inner: people + badge }), { palette: false })
  const c = tileCentre(canvas, side)
  const a = rad(-6)
  const bx = side * 0.3
  const by = -side * 0.3
  const at = { x: c.x + bx * Math.cos(a) - by * Math.sin(a), y: c.y + bx * Math.sin(a) + by * Math.cos(a) }
  const plus = await textLayer({ text: '+1', size: Math.round(badgeR * 1.2), color: INK, canvas, at })
  return quantise(await sharp(base).composite([{ input: plus }]).png().toBuffer())
}

async function stickerGame(gameId: string, accent: string, canvas: number, side: number): Promise<Buffer> {
  return svgToPng(gameTileSvg({ id: gameId, accentHex: accent }, canvas, side))
}

async function stickerYourTurn(canvas: number, side: number): Promise<Buffer> {
  const glyph = Math.round(side * 0.46)
  const hourglass = nest(chromeSvg('hourglass', glyph, INK), -glyph / 2, -side * 0.42, glyph)
  const sand = `<path d="M-13 ${-side * 0.42 + glyph * 0.62}h26l-13 14z" fill="${T.sun}"/>`
  const finger = Math.round(side * 0.24)
  const point = `<g transform="translate(${side * 0.26} ${-side * 0.34}) rotate(20)">${nest(chromeSvg('point', finger, INK), -finger / 2, -finger / 2, finger)}</g>`
  const base = await svgToPng(tileSvg({ canvas, side, fill: T.coral, inner: hourglass + sand + point }), { palette: false })
  const c = tileCentre(canvas, side)
  const a = rad(-6)
  const ty = side * 0.2
  const at = { x: c.x - ty * Math.sin(a), y: c.y + ty * Math.cos(a) }
  const words = await textLayer({ text: 'YOUR\nTURN', size: Math.round(side * 0.19), color: INK, canvas, at })
  return quantise(await sharp(base).composite([{ input: words }]).png().toBuffer())
}

// ---------------------------------------------------------------------------
// Larger compositions: palette card, banner and splash
// ---------------------------------------------------------------------------

function paletteCard(width: number, height: number): Promise<Buffer> {
  const cols = 4
  const gap = 20
  const pad = 36
  const cellW = (width - pad * 2 - gap * (cols - 1)) / cols
  const cellH = (height - pad * 2 - 56 - gap * 3) / 4
  return og(
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: PAPER, padding: pad, fontFamily: 'Bricolage', color: INK }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 16 }}>
        <span style={{ fontSize: 34, letterSpacing: -1 }}>Boardly palette</span>
        <span style={{ fontSize: 18, color: T['ink-muted'] }}>light values of lib/dev/theme-tokens.ts</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap }}>
        {PALETTE_CARD_TOKENS.map((name) => {
          const hex = T[name]
          const dark = ['ink', 'ink-soft', 'coral-deep', 'lav-deep', 'mint-deep'].includes(name)
          return (
            <div key={name} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: cellW, height: cellH, background: hex, borderRadius: 18, border: `2px solid ${INK}`, padding: 12 }}>
              <span style={{ fontSize: 20, color: dark ? PAPER : INK, lineHeight: 1 }}>{name}</span>
              <span style={{ fontSize: 15, color: dark ? T.line : T['ink-soft'], lineHeight: 1, marginTop: 4 }}>{hex}</span>
            </div>
          )
        })}
      </div>
    </div>,
    width,
    height
  )
}

/** The opengraph-image.tsx composition (dot grid, blobs, B-tile, wordmark, tagline, chips) at any 16:9 size. */
function brandBoard(width: number, height: number): Promise<Buffer> {
  const k = height / 630 // the OG image is 1200×630; scale from its height
  const tile = Math.round(100 * k)
  return og(
    <div style={{ background: PAPER, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Bricolage', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle, ${INK}18 ${1.5 * k}px, transparent ${1.5 * k}px)`, backgroundSize: `${32 * k}px ${32 * k}px` }} />
      <div style={{ position: 'absolute', top: -80 * k, right: -80 * k, width: 360 * k, height: 360 * k, borderRadius: '50%', background: `${T.coral}22`, display: 'flex' }} />
      <div style={{ position: 'absolute', bottom: -60 * k, left: -60 * k, width: 280 * k, height: 280 * k, borderRadius: '50%', background: `${T.sun}22`, display: 'flex' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: tile, height: tile, borderRadius: Math.round(tile * 0.27), background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `${6 * k}px ${6 * k}px 0 ${T.coral}`, marginBottom: 32 * k, transform: 'rotate(-6deg)' }}>
          <span style={{ fontSize: Math.round(tile * 0.66), color: T.sun, lineHeight: 1, marginTop: -tile * 0.04 }}>B</span>
        </div>
        <div style={{ fontSize: 88 * k, color: INK, letterSpacing: -4 * k, lineHeight: 1, marginBottom: 18 * k }}>boardly</div>
        <div style={{ fontSize: 30 * k, color: T['ink-soft'], textAlign: 'center', maxWidth: 760 * k, lineHeight: 1.35, marginBottom: 40 * k }}>
          Play board games online with friends – free, no download needed.
        </div>
        <div style={{ display: 'flex', gap: 14 * k }}>
          {['Yahtzee', 'Guess the Spy', 'Memory', 'Connect Four'].map((name) => (
            <div key={name} style={{ fontSize: 21 * k, color: INK, background: T.bg2, padding: `${9 * k}px ${20 * k}px`, borderRadius: 999, border: `${1.5 * k}px solid ${INK}20` }}>
              {name}
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 30 * k, fontSize: 21 * k, color: T['ink-muted'] }}>boardly.online</div>
    </div>,
    width,
    height
  )
}

// ---------------------------------------------------------------------------
// Output bookkeeping, verification and the contact sheet
// ---------------------------------------------------------------------------

interface Asset {
  rel: string
  bytes: number
  width: number
  height: number
  alpha: boolean
  pages: number
  cap: number | null
  expect: { width: number; height: number; alpha: boolean }
}

const assets: Asset[] = []
const problems: string[] = []
const dropped: string[] = []

async function emit(outDir: string, rel: string, buf: Buffer, expect: Asset['expect'], cap: number | null): Promise<void> {
  const file = path.join(outDir, rel)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, buf)
  const meta = await sharp(buf, { animated: true }).metadata()
  const pages = meta.pages ?? 1
  const height = pages > 1 && meta.pageHeight ? meta.pageHeight : meta.height ?? 0
  const asset: Asset = { rel, bytes: buf.length, width: meta.width ?? 0, height, alpha: meta.hasAlpha === true, pages, cap, expect }
  assets.push(asset)
  if (asset.width !== expect.width || asset.height !== expect.height) problems.push(`${rel}: ${asset.width}×${asset.height}, expected ${expect.width}×${expect.height}`)
  if (asset.alpha !== expect.alpha) problems.push(`${rel}: alpha ${asset.alpha}, expected ${expect.alpha}`)
  if (cap !== null && buf.length > cap) problems.push(`${rel}: ${buf.length} B over the ${cap / KIB} KiB cap`)
}

function checkName(name: string): string {
  if (!EMOJI_NAME.test(name)) throw new Error(`emoji name "${name}" does not match ${EMOJI_NAME}`)
  return name
}

async function contactSheet(outDir: string, date: string): Promise<void> {
  const cols = 6
  const cellW = 200
  const cellH = 250
  const thumb = 128
  const pad = 24
  const items = assets.filter((a) => !a.rel.startsWith('sheets/'))
  const rows = Math.ceil(items.length / cols)
  const width = pad * 2 + cols * cellW
  const height = pad * 2 + 60 + rows * cellH
  const checker = `<pattern id="chk" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${T.line}"/><rect x="8" y="8" width="8" height="8" fill="${T.line}"/></pattern>`
  const boxes = items
    .map((_, i) => {
      const x = pad + (i % cols) * cellW + (cellW - thumb) / 2
      const y = pad + 60 + Math.floor(i / cols) * cellH
      return `<rect x="${x}" y="${y}" width="${thumb}" height="${thumb}" rx="10" fill="url(#chk)" stroke="${T.line}"/>`
    })
    .join('')
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs>${checker}</defs><rect width="${width}" height="${height}" fill="${PAPER}"/>${boxes}</svg>`

  const thumbs = await Promise.all(
    items.map(async (a, i) => {
      const buf = await readFile(path.join(outDir, a.rel))
      const img = await sharp(buf).resize(thumb - 8, thumb - 8, { fit: 'inside' }).png().toBuffer()
      const meta = await sharp(img).metadata()
      const x = pad + (i % cols) * cellW + (cellW - thumb) / 2 + Math.round((thumb - (meta.width ?? 0)) / 2)
      const y = pad + 60 + Math.floor(i / cols) * cellH + Math.round((thumb - (meta.height ?? 0)) / 2)
      return { input: img, left: x, top: y }
    })
  )

  const labels = await og(
    <div style={{ display: 'flex', width: '100%', height: '100%', position: 'relative', fontFamily: 'Bricolage', color: INK }}>
      <div style={{ position: 'absolute', left: pad, top: pad, display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontSize: 28 }}>Boardly Discord – code-drawn set</span>
        <span style={{ fontSize: 16, color: T['ink-muted'] }}>{date} · {items.length} files · scripts/discord/render-assets.tsx</span>
      </div>
      {items.map((a, i) => {
        const x = pad + (i % cols) * cellW
        const y = pad + 60 + Math.floor(i / cols) * cellH + thumb + 8
        const over = a.cap !== null && a.bytes > a.cap
        return (
          <div key={a.rel} style={{ position: 'absolute', left: x, top: y, width: cellW, display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 13, lineHeight: 1.3 }}>
            <span style={{ fontSize: 14 }}>{path.basename(a.rel)}</span>
            <span style={{ color: T['ink-soft'] }}>{a.width}×{a.height}{a.pages > 1 ? ` · ${a.pages} frames` : ''}</span>
            <span style={{ color: over ? T['coral-deep'] : T['ink-soft'] }}>{(a.bytes / KIB).toFixed(1)} KiB</span>
            <span style={{ color: a.alpha ? T['mint-deep'] : T['ink-muted'] }}>{a.alpha ? 'alpha' : 'opaque'}</span>
          </div>
        )
      })}
    </div>,
    width,
    height
  )

  // Two stages: sharp runs flatten before composite whatever the call order,
  // and the composited layers would bring the alpha channel back.
  const composed = await sharp(Buffer.from(bg)).composite([...thumbs, { input: labels }]).png().toBuffer()
  const sheet = await sharp(composed).flatten({ background: PAPER }).png({ compressionLevel: 9 }).toBuffer()
  await emit(outDir, `sheets/code-${date}.png`, sheet, { width, height, alpha: false }, null)
}

function printTable(): void {
  const w = Math.max(...assets.map((a) => a.rel.length))
  console.log(`\n${'file'.padEnd(w)}  ${'size'.padStart(9)}  ${'KiB'.padStart(7)}  alpha  frames`)
  for (const a of assets) {
    console.log(`${a.rel.padEnd(w)}  ${`${a.width}x${a.height}`.padStart(9)}  ${(a.bytes / KIB).toFixed(1).padStart(7)}  ${a.alpha ? 'yes ' : 'no  '}  ${a.pages > 1 ? a.pages : ''}`)
  }
  console.log(`\n${assets.length} files, ${(assets.reduce((n, a) => n + a.bytes, 0) / KIB).toFixed(0)} KiB`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i === -1 ? undefined : process.argv[i + 1]
}

async function main(): Promise<void> {
  const outDir = path.resolve(argValue('--out') ?? path.join(REPO_ROOT, '..', 'boardly-discord', 'assets', 'out', 'code'))
  const date = new Date().toISOString().slice(0, 10)
  await mkdir(outDir, { recursive: true })
  console.log(`rendering into ${outDir}`)

  const alpha = (width: number, height = width) => ({ width, height, alpha: true })
  const opaque = (width: number, height = width) => ({ width, height, alpha: false })

  // Emoji: seven game tiles, the B-tile, thirty chrome glyphs.
  const E = 128
  for (const game of GAMES) {
    const name = checkName(game.emojiName)
    await emit(outDir, `emoji/${name}.png`, await svgToPng(gameTileSvg(game, E, 104)), alpha(E), CAP_EMOJI)
  }
  await emit(outDir, `emoji/${checkName('bd_b')}.png`, await bTile(E, 104), alpha(E), CAP_EMOJI)
  for (const { name, icon, accent } of CHROME) {
    const size = 112
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${E}" height="${E}">${nest(chromeSvg(icon, size, accent), (E - size) / 2, (E - size) / 2, size)}</svg>`
    await emit(outDir, `emoji/${checkName(`bd_${name}`)}.png`, await svgToPng(svg), alpha(E), CAP_EMOJI)
  }

  // Animated emoji: kept only when they fit the 256 KiB cap.
  const animated: Array<[string, () => Promise<Buffer>]> = [
    ['bd_dice_roll', () => animDiceRoll(E)],
    ['bd_c4_drop', () => animC4Drop(E)],
    ['bd_hourglass_flip', () => animHourglassFlip(E)],
    ['bd_spy_peek', () => animSpyPeek(E)],
    ['bd_b_bounce', () => animBBounce(E)],
    ['bd_alias_talk', () => animAliasTalk(E)],
  ]
  for (const [name, render] of animated) {
    const gif = await render()
    if (gif.length > CAP_EMOJI) {
      dropped.push(`${name}.gif (${(gif.length / KIB).toFixed(0)} KiB)`)
      continue
    }
    await emit(outDir, `emoji/${checkName(name)}.gif`, gif, alpha(E), CAP_EMOJI)
  }

  // Server icon: the B-tile at ~70 % on opaque paper (the circular crop keeps the corners).
  {
    const S = 512
    const behind = `<rect width="${S}" height="${S}" fill="${PAPER}"/>`
    const png = await bTile(S, 340, { behind })
    await emit(outDir, 'icon/icon-512.png', await sharp(png).flatten({ background: PAPER }).png({ palette: true, quality: 90, effort: 7 }).toBuffer(), opaque(S), null)
  }

  // Role icons (Level 2, prepared only).
  for (const { role, icon, accent } of ROLE_ICONS) {
    const size = 56
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">${nest(chromeSvg(icon, size, accent), 4, 4, size)}</svg>`
    await emit(outDir, `roles/${role}-64.png`, await svgToPng(svg), alpha(64), CAP_EMOJI)
  }

  // Stickers: code-drawn fallbacks for the five slots.
  {
    const S = 320
    const side = 248
    await emit(outDir, 'stickers/bd_gg-320.png', await stickerGg(S, side), alpha(S), CAP_STICKER)
    await emit(outDir, 'stickers/bd_one_more-320.png', await stickerOneMore(S, side), alpha(S), CAP_STICKER)
    await emit(outDir, 'stickers/bd_spy-320.png', await stickerGame('spy', T.lav, S, side), alpha(S), CAP_STICKER)
    await emit(outDir, 'stickers/bd_yahtzee-320.png', await stickerGame('yahtzee', T.sky, S, side), alpha(S), CAP_STICKER)
    await emit(outDir, 'stickers/bd_your_turn-320.png', await stickerYourTurn(S, side), alpha(S), CAP_STICKER)
  }

  // Per-game thumbnails on the dark band, for the LFG embeds.
  for (const game of GAMES) {
    const S = 256
    const grid = dotGrid('dots', '#F0E8DB1A', 24, 1.4)
    const behind = `<rect width="${S}" height="${S}" fill="${DARK_BAND}"/>${grid.rect(S, S)}`
    const svg = gameTileSvg(game, S, 168, { behind, defs: grid.defs })
    await emit(outDir, `thumbs/${game.id}-256.png`, await svgToPng(svg), opaque(S), null)
  }

  // Palette card, banner and splash.
  await emit(outDir, 'palette/palette-card.png', await quantise(await paletteCard(1024, 512)), opaque(1024, 512), null)
  await emit(outDir, 'boost/banner-960x540.png', await quantise(await brandBoard(960, 540)), opaque(960, 540), null)
  await emit(outDir, 'boost/splash-1920x1080.png', await quantise(await brandBoard(1920, 1080)), opaque(1920, 1080), null)

  // games.json, pinned.
  await writeFile(path.join(outDir, 'games.json'), JSON.stringify(GAMES, null, 2) + '\n')

  // Contact sheet last, over everything above.
  await contactSheet(outDir, date)

  printTable()
  if (dropped.length) console.log(`\ndropped (over the emoji cap): ${dropped.join(', ')}`)
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`)
    process.exitCode = 1
  } else {
    console.log('\nall sizes, dimensions and alpha channels verified')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
