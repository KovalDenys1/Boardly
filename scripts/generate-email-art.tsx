// Regenerates every image a Boardly mail shows, into public/email/: the logo lockup, the
// hero pictures and the notice icons, each in a light and a dark version. They are drawn
// from the product's own pieces (GameGlyph, Icon, the B tile) inside the live home page,
// so the fonts and the --bd-* tokens are boardly.online's, and html.dark gives the dark
// set. Sizes come from lib/email-art.ts, which the mails read too.
//   npx tsx scripts/generate-email-art.tsx
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { mkdirSync, statSync } from 'fs'
import path from 'path'
import { GameGlyph } from '../components/GameIcon'
import { Icon } from '../components/icons'
import {
  EMAIL_ART_SCALE,
  EMAIL_HERO_SIZE,
  EMAIL_ICON_SIZE,
  EMAIL_LOGO_SIZE,
  EMAIL_NOTICE_ICONS,
  INVITE_HERO_GAMES,
  type EmailNoticeIcon,
} from '../lib/email-art'

const OUT_DIR = path.join(process.cwd(), 'public', 'email')
type Theme = 'light' | 'dark'

const html = (element: ReactElement) => renderToStaticMarkup(element)

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

function confetti(x: number, y: number, size: number, color: string, rotate: number) {
  return `<span style="position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:${Math.round(size / 3.5)}px;background:${color};border:2px solid var(--bd-ink);transform:rotate(${rotate}deg)"></span>`
}

function squiggle(x: number, y: number, color: string) {
  return `<svg style="position:absolute;left:${x}px;top:${y}px" width="74" height="18" viewBox="0 0 74 18"><path d="M3 9c6-8 12-8 17 0s11 8 17 0 11-8 17 0 11 8 17 0" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/></svg>`
}

function bTile(size: number, rotate = 0, x = 0, y = 0, positioned = false) {
  const font = Math.round(size * 0.58)
  const shadow = Math.max(3, Math.round(size / 12))
  const place = positioned ? `position:absolute;left:${x}px;top:${y}px;` : ''
  return `<span style="${place}width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.28)}px;background:var(--bd-ink);color:var(--bd-sun);display:grid;place-items:center;font-family:var(--bd-font-display);font-weight:800;font-size:${font}px;line-height:1;box-shadow:${shadow}px ${shadow}px 0 var(--bd-coral);transform:rotate(${rotate}deg);flex-shrink:0">B</span>`
}

function panel(tint: string, inner: string) {
  const { width, height } = EMAIL_HERO_SIZE
  return `<div id="art" style="position:relative;overflow:hidden;width:${width}px;height:${height}px;border-radius:22px;background:color-mix(in srgb, ${tint} 22%, var(--bd-card-warm))">${inner}</div>`
}

function logo() {
  const { width, height } = EMAIL_LOGO_SIZE
  // The B tile starts at x = 0, so the picture's left edge is the lockup's left edge.
  return `<div id="art" style="box-sizing:border-box;width:${width}px;height:${height}px;display:flex;align-items:center;gap:9px;padding-bottom:3px;font-family:var(--bd-font-display);font-weight:800;font-size:24px;letter-spacing:-0.03em;line-height:1;color:var(--bd-ink)">${bTile(36)}boardly</div>`
}

function welcomeHero() {
  return panel(
    'var(--bd-sky)',
    confetti(38, 26, 18, 'var(--bd-lav)', 18) +
      confetti(488, 140, 16, 'var(--bd-coral)', -14) +
      confetti(470, 30, 12, 'var(--bd-mint)', 30) +
      squiggle(222, 162, 'var(--bd-lav-deep)') +
      sticker('yahtzee', 'var(--bd-sky)', 58, -8, 54, 64) +
      sticker('tic-tac-toe', 'var(--bd-coral)', 58, 6, 158, 40) +
      sticker('spy', 'var(--bd-lav)', 58, -4, 262, 70) +
      sticker('memory', 'var(--bd-mint)', 58, 9, 366, 44)
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
    `<div style="position:absolute;left:${x}px;top:${y}px;width:46px;height:46px;border-radius:50%;background:${color};border:2.5px solid var(--bd-ink);box-shadow:3px 3px 0 var(--bd-ink);display:grid;place-items:center;color:var(--bd-ink-on-accent)">${html(<Icon name="user" size={24} />)}</div>`
  return panel(
    accent,
    confetti(40, 30, 16, 'var(--bd-sun)', 18) +
      confetti(486, 146, 16, 'var(--bd-coral)', -12) +
      squiggle(48, 150, 'var(--bd-lav-deep)') +
      sticker(svgId, accent, 84, -6, 202, 32) +
      token(370, 46, 'var(--bd-sun)') +
      token(400, 100, 'var(--bd-mint)') +
      token(352, 116, 'var(--bd-lav)')
  )
}

const CALM_ICONS = new Set<EmailNoticeIcon>(['suspension', 'deletion', 'inactive', 'terms', 'security', 'unverified'])

function noticeIcon(kind: EmailNoticeIcon) {
  const { name, accent } = EMAIL_NOTICE_ICONS[kind]
  const { width } = EMAIL_ICON_SIZE
  // Calm notices: a quiet tile, ink glyph, no tilt and no shadow. The rest: the accent tile.
  const calm = CALM_ICONS.has(kind)
  const fill = calm ? 'var(--bd-bg2)' : accent
  const ink = calm ? 'var(--bd-ink)' : 'var(--bd-ink-on-accent)'
  const shadow = calm ? 'none' : '3px 3px 0 var(--bd-ink)'
  return `<div id="art" style="box-sizing:border-box;width:${width}px;height:${width}px;padding:0 4px 4px 0"><div style="width:${width - 4}px;height:${width - 4}px;box-sizing:border-box;border-radius:15px;background:${fill};border:2px solid var(--bd-ink);box-shadow:${shadow};display:grid;place-items:center;color:${ink}">${html(<Icon name={name} size={26} />)}</div></div>`
}

type Piece = { file: string; markup: string; scale: number }

function pieces(): Piece[] {
  const list: Piece[] = [
    { file: 'logo', markup: logo(), scale: EMAIL_ART_SCALE.logo },
    { file: 'hero-welcome', markup: welcomeHero(), scale: EMAIL_ART_SCALE.hero },
    { file: 'hero-premium', markup: premiumHero(), scale: EMAIL_ART_SCALE.hero },
  ]
  for (const game of Object.values(INVITE_HERO_GAMES)) {
    list.push({ file: `hero-invite-${game.svgId}`, markup: inviteHero(game.svgId, game.accent), scale: EMAIL_ART_SCALE.hero })
  }
  for (const kind of Object.keys(EMAIL_NOTICE_ICONS) as EmailNoticeIcon[]) {
    list.push({ file: `icon-${kind}`, markup: noticeIcon(kind), scale: EMAIL_ART_SCALE.icon })
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
          console.log(`${path.relative(process.cwd(), file).padEnd(48)} ${(statSync(file).size / 1024).toFixed(1)} KB`)
        }
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
