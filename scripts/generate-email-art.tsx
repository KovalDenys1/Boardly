// Regenerates every image a Boardly mail shows, into public/email/: the logo lockup and one
// hero per mail, each in a light and a dark version. They are drawn from the product's own
// pieces (GameGlyph, Icon, the B tile, Phosphor glyphs in the fill weight Icon uses) inside
// the live home page, so the fonts and the --bd-* tokens are boardly.online's, and html.dark
// gives the dark set. Sizes come from lib/email-art.ts, which the mails read too.
//   npx tsx scripts/generate-email-art.tsx
import type { ComponentType, ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import path from 'path'
import {
  Archive,
  ArrowRight,
  ArrowsLeftRight,
  CalendarBlank,
  Check,
  Clock,
  DiscordLogo,
  EnvelopeSimple,
  FileText,
  GithubLogo,
  GoogleLogo,
  Hourglass,
  Key,
  LinkSimple,
  LockKey,
  Pause,
  PencilSimple,
  Shield,
  ShieldCheck,
  User,
} from '@phosphor-icons/react/dist/ssr'
import { GameGlyph } from '../components/GameIcon'
import { Icon } from '../components/icons'
import {
  EMAIL_ART_SCALE,
  EMAIL_HERO_SIZE,
  EMAIL_LOGO_SIZE,
  INVITE_HERO_GAMES,
  allEmailArtFiles,
  type EmailHero,
} from '../lib/email-art'

const OUT_DIR = path.join(process.cwd(), 'public', 'email')
type Theme = 'light' | 'dark'
type Glyph = ComponentType<{ size?: number; weight?: 'fill' | 'bold'; color?: string }>

const html = (element: ReactElement) => renderToStaticMarkup(element)
const phosphor = (G: Glyph, size: number, color: string, weight: 'fill' | 'bold' = 'fill') =>
  html(<G size={size} weight={weight} color={color} />)

function glyph(svgId: string, size: number, color: string, detail: string, outline = 'transparent') {
  return html(
    <GameGlyph gameId={svgId} size={size} color={color} detailColor={detail} outlineColor={outline} shineColor="rgba(255,255,255,0.3)" />
  )
}

/** The sticker frame from GameIcon: accent tile, ink border, hard ink shadow, tilted. */
function sticker(svgId: string, accent: string, glyphSize: number, rotate: number, x: number, y: number) {
  const box = glyphSize + 24
  const lift = Math.max(3, Math.round(box * 0.06))
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${box}px;height:${box}px;border-radius:${Math.round(box * 0.27)}px;background:${accent};border:2.5px solid var(--bd-ink);box-shadow:${lift}px ${lift}px 0 var(--bd-ink);transform:rotate(${rotate}deg);display:flex;align-items:center;justify-content:center">${glyph(svgId, glyphSize, 'var(--bd-ink-on-accent)', accent)}</div>`
}

/** A motif tile: a rounded square with the ink border and hard shadow of the B tile and the stickers. */
function tile(o: { x: number; y: number; size: number; fill: string; inner: string; rotate?: number; shadow?: string; round?: boolean }) {
  const lift = Math.max(3, Math.round(o.size * 0.06))
  return `<div style="position:absolute;left:${o.x}px;top:${o.y}px;width:${o.size}px;height:${o.size}px;box-sizing:border-box;border-radius:${o.round ? '50%' : `${Math.round(o.size * 0.27)}px`};background:${o.fill};border:2.5px solid var(--bd-ink);box-shadow:${lift}px ${lift}px 0 ${o.shadow ?? 'var(--bd-ink)'};transform:rotate(${o.rotate ?? 0}deg);display:grid;place-items:center">${o.inner}</div>`
}

function confetti(x: number, y: number, size: number, color: string, rotate: number) {
  return `<span style="position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:${Math.round(size / 3.5)}px;background:${color};border:2px solid var(--bd-ink);transform:rotate(${rotate}deg)"></span>`
}

function squiggle(x: number, y: number, color: string) {
  return `<svg style="position:absolute;left:${x}px;top:${y}px" width="74" height="18" viewBox="0 0 74 18"><path d="M3 9c6-8 12-8 17 0s11 8 17 0 11-8 17 0 11 8 17 0" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/></svg>`
}

/** Quiet shapes for the calm notices: soft rings in the line colour, nothing that moves the eye. */
function rings() {
  const ring = (x: number, y: number, size: number) =>
    `<span style="position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:50%;border:3px solid color-mix(in srgb, var(--bd-ink) 9%, transparent)"></span>`
  return ring(-40, 96, 150) + ring(430, -50, 160) + ring(176, 28, 188)
}

function bTile(size: number, rotate = 0, x = 0, y = 0, positioned = false) {
  const font = Math.round(size * 0.58)
  const shadow = Math.max(3, Math.round(size / 12))
  const place = positioned ? `position:absolute;left:${x}px;top:${y}px;` : ''
  return `<span style="${place}width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.28)}px;background:var(--bd-ink);color:var(--bd-sun);display:grid;place-items:center;font-family:var(--bd-font-display);font-weight:800;font-size:${font}px;line-height:1;box-shadow:${shadow}px ${shadow}px 0 var(--bd-coral);transform:rotate(${rotate}deg);flex-shrink:0">B</span>`
}

function panel(tint: string, inner: string, strength = 22) {
  const { width, height } = EMAIL_HERO_SIZE
  return `<div id="art" style="position:relative;overflow:hidden;width:${width}px;height:${height}px;border-radius:22px;background:color-mix(in srgb, ${tint} ${strength}%, var(--bd-card-warm))">${inner}</div>`
}

function logo() {
  const { width, height } = EMAIL_LOGO_SIZE
  // The B tile starts at x = 0, so the picture's left edge is the lockup's left edge.
  return `<div id="art" style="box-sizing:border-box;width:${width}px;height:${height}px;display:flex;align-items:center;gap:9px;padding-bottom:3px;font-family:var(--bd-font-display);font-weight:800;font-size:24px;letter-spacing:-0.03em;line-height:1;color:var(--bd-ink)">${bTile(36)}boardly</div>`
}

/** Confetti, a squiggle and a sparkle around the centre: the friendly mails' frame, as on the Premium hero. */
function party(squiggleColor: string, squiggleAt: [number, number] = [380, 40]) {
  return (
    confetti(60, 34, 16, 'var(--bd-coral)', 20) +
    confetti(456, 138, 18, 'var(--bd-lav)', -12) +
    confetti(110, 140, 12, 'var(--bd-mint)', 35) +
    confetti(470, 34, 12, 'var(--bd-sun)', 28) +
    squiggle(squiggleAt[0], squiggleAt[1], squiggleColor)
  )
}

/** The friendly motif: one big accent tile in the middle and a small badge on its corner. */
function friendly(o: {
  tint: string
  fill: string
  main: string
  badge?: { fill: string; inner: string }
  extra?: string
  squiggle: string
  sparkle?: boolean
}) {
  return panel(
    o.tint,
    party(o.squiggle) +
      (o.extra ?? '') +
      tile({ x: 216, y: 44, size: 108, fill: o.fill, inner: o.main, rotate: -6 }) +
      (o.badge ? tile({ x: 296, y: 104, size: 50, fill: o.badge.fill, inner: o.badge.inner, rotate: 8, round: true }) : '') +
      (o.sparkle === false
        ? ''
        : `<div style="position:absolute;left:150px;top:92px;color:var(--bd-sun-deep)">${html(<Icon name="sparkle" size={30} />)}</div>`)
  )
}

/** The calm motif: a quiet tile, no tilt, no confetti, the accent kept to the small badge. */
function calm(o: { tint: string; main: string; badge?: { fill: string; inner: string } }) {
  return panel(
    o.tint,
    rings() +
      tile({ x: 216, y: 42, size: 108, fill: 'var(--bd-card-warm)', inner: o.main }) +
      (o.badge ? tile({ x: 298, y: 106, size: 48, fill: o.badge.fill, inner: o.badge.inner, round: true }) : ''),
    16
  )
}

const INK = 'var(--bd-ink)'
const ON_ACCENT = 'var(--bd-ink-on-accent)'

function welcomeHero() {
  return panel(
    'var(--bd-sky)',
    party('var(--bd-lav-deep)') +
      sticker('yahtzee', 'var(--bd-sky)', 34, -10, 104, 26) +
      sticker('tic-tac-toe', 'var(--bd-coral)', 34, 8, 128, 112) +
      sticker('spy', 'var(--bd-lav)', 34, -6, 360, 24) +
      sticker('memory', 'var(--bd-mint)', 34, 10, 338, 110) +
      bTile(100, -6, 220, 50, true)
  )
}

function premiumHero() {
  return panel(
    'var(--bd-sun)',
    confetti(60, 34, 16, 'var(--bd-coral)', 20) +
      confetti(456, 138, 18, 'var(--bd-lav)', -12) +
      confetti(110, 140, 12, 'var(--bd-mint)', 35) +
      squiggle(380, 40, 'var(--bd-coral-deep)') +
      `<div style="position:absolute;left:214px;top:22px;color:var(--bd-sun-deep);transform:rotate(-12deg)">${html(<Icon name="crown" size={58} />)}</div>` +
      bTile(96, -6, 222, 66, true) +
      `<div style="position:absolute;left:152px;top:96px;color:var(--bd-sun-deep)">${html(<Icon name="sparkle" size={34} />)}</div>` +
      `<div style="position:absolute;left:348px;top:118px;color:var(--bd-coral)">${html(<Icon name="star" size={30} />)}</div>`
  )
}

function inviteHero(svgId: string, accent: string) {
  const token = (x: number, y: number, color: string) =>
    `<div style="position:absolute;left:${x}px;top:${y}px;width:46px;height:46px;border-radius:50%;background:${color};border:2.5px solid var(--bd-ink);box-shadow:3px 3px 0 var(--bd-ink);display:grid;place-items:center">${phosphor(User, 24, ON_ACCENT)}</div>`
  return panel(
    accent,
    party('var(--bd-lav-deep)', [222, 170]) +
      tile({ x: 106, y: 74, size: 54, fill: 'var(--bd-coral)', inner: phosphor(ArrowRight, 30, ON_ACCENT, 'bold'), round: true }) +
      sticker(svgId, accent, 96, -6, 196, 30) +
      token(366, 46, 'var(--bd-sun)') +
      token(398, 102, 'var(--bd-mint)') +
      token(350, 120, 'var(--bd-lav)')
  )
}

const PROVIDER_GLYPHS: Record<string, Glyph> = { discord: DiscordLogo, google: GoogleLogo, github: GithubLogo }

function hero(kind: EmailHero): string {
  switch (kind) {
    case 'welcome':
      return welcomeHero()
    case 'premium':
      return premiumHero()
    case 'verify':
      return friendly({
        tint: 'var(--bd-sky)',
        fill: 'var(--bd-sky)',
        main: phosphor(EnvelopeSimple, 64, ON_ACCENT),
        badge: { fill: 'var(--bd-mint)', inner: phosphor(Check, 28, ON_ACCENT, 'bold') },
        squiggle: 'var(--bd-lav-deep)',
      })
    case 'reset':
      return friendly({
        tint: 'var(--bd-mint)',
        fill: 'var(--bd-mint)',
        main: phosphor(Key, 64, ON_ACCENT),
        badge: { fill: 'var(--bd-sun)', inner: phosphor(LockKey, 26, ON_ACCENT) },
        squiggle: 'var(--bd-coral-deep)',
      })
    case 'email-change':
      return friendly({
        tint: 'var(--bd-lav)',
        fill: 'var(--bd-lav)',
        main: phosphor(EnvelopeSimple, 64, ON_ACCENT),
        badge: { fill: 'var(--bd-sun)', inner: phosphor(ArrowsLeftRight, 28, ON_ACCENT, 'bold') },
        extra: `<div style="position:absolute;left:150px;top:54px;opacity:.5">${tile({ x: 0, y: 0, size: 70, fill: 'var(--bd-sky)', inner: phosphor(EnvelopeSimple, 40, ON_ACCENT), rotate: -14 })}</div>`,
        squiggle: 'var(--bd-coral-deep)',
        sparkle: false,
      })
    case 'subscription':
      return friendly({
        tint: 'var(--bd-sun)',
        fill: 'var(--bd-sun)',
        main: phosphor(CalendarBlank, 64, ON_ACCENT),
        badge: { fill: 'var(--bd-ink-on-accent)', inner: `<span style="font-family:var(--bd-font-display);font-weight:800;font-size:26px;line-height:1;color:var(--bd-sun)">B</span>` },
        squiggle: 'var(--bd-coral-deep)',
      })
    case 'security':
      return calm({ tint: 'var(--bd-lav)', main: phosphor(LockKey, 62, INK), badge: { fill: 'var(--bd-lav)', inner: phosphor(ShieldCheck, 26, ON_ACCENT) } })
    case 'unverified':
      return calm({ tint: 'var(--bd-sun)', main: phosphor(EnvelopeSimple, 62, INK), badge: { fill: 'var(--bd-sun)', inner: phosphor(Clock, 28, ON_ACCENT) } })
    case 'deletion':
      return calm({ tint: 'var(--bd-ink-muted)', main: phosphor(Archive, 62, INK) })
    case 'inactive':
      return calm({ tint: 'var(--bd-sun)', main: phosphor(Hourglass, 62, INK) })
    case 'terms':
      return calm({ tint: 'var(--bd-sky)', main: phosphor(FileText, 62, INK), badge: { fill: 'var(--bd-sky)', inner: phosphor(PencilSimple, 26, ON_ACCENT) } })
    case 'suspension':
      return calm({
        tint: 'var(--bd-ink-muted)',
        main: `<div style="position:relative;width:64px;height:64px">${phosphor(Shield, 64, INK)}<div style="position:absolute;left:18px;top:16px">${phosphor(Pause, 28, 'var(--bd-card-warm)')}</div></div>`,
      })
    case 'provider-discord':
    case 'provider-google':
    case 'provider-github': {
      const provider = PROVIDER_GLYPHS[kind.slice('provider-'.length)]
      return calm({ tint: 'var(--bd-lav)', main: phosphor(LinkSimple, 62, INK), badge: { fill: 'var(--bd-card-warm)', inner: phosphor(provider, 28, INK) } })
    }
  }
}

type Piece = { file: string; markup: string; scale: number }

function pieces(): Piece[] {
  const list: Piece[] = [{ file: 'logo', markup: logo(), scale: EMAIL_ART_SCALE.logo }]
  for (const kind of [
    'welcome', 'premium', 'verify', 'reset', 'security', 'email-change', 'unverified', 'deletion',
    'subscription', 'inactive', 'terms', 'suspension', 'provider-discord', 'provider-google', 'provider-github',
  ] as EmailHero[]) {
    list.push({ file: `hero-${kind}`, markup: hero(kind), scale: EMAIL_ART_SCALE.hero })
  }
  for (const game of Object.values(INVITE_HERO_GAMES)) {
    list.push({ file: `hero-invite-${game.svgId}`, markup: inviteHero(game.svgId, game.accent), scale: EMAIL_ART_SCALE.hero })
  }
  return list
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain'] })
  try {
    for (const scale of [...new Set(Object.values(EMAIL_ART_SCALE))]) {
      const page = await browser.newPage({ viewport: { width: 700, height: 400 }, deviceScaleFactor: scale })
      await page.goto('https://boardly.online/', { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      if (!(await page.evaluate(() => document.fonts.check("800 24px 'Bricolage Grotesque'")))) {
        throw new Error('Bricolage Grotesque did not load from boardly.online; the art would be drawn in a fallback font')
      }
      for (const piece of pieces().filter((each) => each.scale === scale)) {
        for (const theme of ['light', 'dark'] as Theme[]) {
          await page.evaluate(
            ({ markup, dark }) => {
              document.documentElement.classList.toggle('dark', dark)
              document.body.style.background = 'transparent'
              document.body.style.margin = '0'
              document.body.innerHTML = `<div style="padding:20px">${markup}</div>`
            },
            { markup: piece.markup, dark: theme === 'dark' }
          )
          const raw = await page.locator('#art').screenshot({ omitBackground: true, animations: 'disabled' })
          const file = path.join(OUT_DIR, `${piece.file}-${theme}.png`)
          await sharp(raw).png({ palette: true, quality: 95, effort: 10, compressionLevel: 9 }).toFile(file)
          console.log(`${path.relative(process.cwd(), file).padEnd(52)} ${(statSync(file).size / 1024).toFixed(1)} KB`)
        }
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }

  const wanted = new Set(allEmailArtFiles())
  for (const name of readdirSync(OUT_DIR)) {
    if (name.endsWith('.png') && !wanted.has(name)) {
      unlinkSync(path.join(OUT_DIR, name))
      console.log(`removed public/email/${name}, which no mail uses`)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
