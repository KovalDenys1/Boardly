'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import GameIcon from '@/components/GameIcon'
import { Icon } from '@/components/icons'
import { getCatalogGames, getGameMetadata } from '@/lib/game-catalog'

/**
 * The preview half of `/dev/theme`: real Boardly surfaces, so a token move is
 * judged on the product rather than on a row of swatches. Nothing here holds
 * colour of its own – every value is `var(--bd-…)` inherited from the panel's
 * wrapper, so the whole tree recolours the moment a slider moves.
 *
 * The contrast read-out at the end is what stops a pretty palette shipping
 * unreadable. It measures the *resolved* colours out of the DOM instead of
 * trusting the panel's state, which means it also catches the pairs the panel
 * cannot see: a hardcoded `white` label on a coral button, `--bd-ink` on a sun
 * sticker, an accent that only fails once `html.dark` is on.
 */

// ---------------------------------------------------------------------------
// WCAG contrast. Kept here on purpose – lib/dev/theme-tokens.ts is the token
// contract and knows nothing about the DOM or about what is drawn on what.
// ---------------------------------------------------------------------------

interface Rgb {
  r: number
  g: number
  b: number
}

/** `getComputedStyle().color` is always `rgb(r, g, b)` or `rgba(r, g, b, a)`. */
function parseComputedColor(value: string): Rgb | null {
  const match = value.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
  if (!match) return null
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) }
}

function channelLuminance(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** WCAG 2.1 relative luminance. */
function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

/** WCAG 2.1 contrast ratio, 1 to 21. Order of the two colours does not matter. */
function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const light = Math.max(la, lb)
  const dark = Math.min(la, lb)
  return (light + 0.05) / (dark + 0.05)
}

const AA_NORMAL = 4.5

interface ContrastPair {
  label: string
  /** Any CSS colour: a token reference, or a literal where the CSS uses one. */
  fg: string
  bg: string
  /** Where this pair actually occurs in the product. */
  where: string
}

interface ContrastGroup {
  title: string
  pairs: ContrastPair[]
}

/**
 * Only pairs that exist in `app/globals.css`. `white` is spelled out where the
 * rule hardcodes it (`.bd-btn-coral`, `.bd-avatar`) – those do not move with a
 * token, so they are the ones a palette change breaks silently. The button rows
 * measure `--bd-btn-ink` rather than `--bd-ink` for the same reason: that is the
 * property `.bd-btn-primary` actually paints with, so if the alias ever stops
 * following the ink, this reads what is on screen instead of what was intended.
 */
const CONTRAST_GROUPS: ContrastGroup[] = [
  {
    title: 'Text on surfaces',
    pairs: [
      { label: 'Body on page', fg: 'var(--bd-ink)', bg: 'var(--bd-bg)', where: '.bd-page' },
      { label: 'Body on card', fg: 'var(--bd-ink)', bg: 'var(--bd-card-warm)', where: '.bd-card' },
      { label: 'Secondary on card', fg: 'var(--bd-ink-soft)', bg: 'var(--bd-card-warm)', where: 'card body copy' },
      { label: 'Hint on well', fg: 'var(--bd-ink-muted)', bg: 'var(--bd-bg2)', where: '.bd-chip, .bd-kicker' },
      { label: 'Value in field', fg: 'var(--bd-ink)', bg: 'var(--bd-input-bg)', where: '.bd-input' },
      { label: 'Placeholder in field', fg: 'var(--bd-ink-muted)', bg: 'var(--bd-input-bg)', where: '.bd-input::placeholder' },
    ],
  },
  {
    title: 'Buttons',
    pairs: [
      { label: 'Primary label', fg: 'var(--bd-bg)', bg: 'var(--bd-btn-ink)', where: '.bd-btn-primary' },
      { label: 'Coral label', fg: 'white', bg: 'var(--bd-coral)', where: '.bd-btn-coral, hardcoded white' },
      { label: 'Ghost on hover', fg: 'var(--bd-bg)', bg: 'var(--bd-btn-ink)', where: '.bd-btn-ghost:hover' },
    ],
  },
  {
    title: 'Ink on an accent fill',
    pairs: [
      { label: 'On coral', fg: 'var(--bd-ink-on-accent)', bg: 'var(--bd-coral)', where: 'tone="on-accent"' },
      { label: 'On mint', fg: 'var(--bd-ink-on-accent)', bg: 'var(--bd-mint)', where: 'tone="on-accent"' },
      { label: 'On sun', fg: 'var(--bd-ink-on-accent)', bg: 'var(--bd-sun)', where: 'tone="on-accent"' },
      { label: 'On lavender', fg: 'var(--bd-ink-on-accent)', bg: 'var(--bd-lav)', where: 'tone="on-accent"' },
      { label: 'On sky', fg: 'var(--bd-ink-on-accent)', bg: 'var(--bd-sky)', where: 'tone="on-accent"' },
      { label: 'On premium', fg: 'var(--bd-ink-on-accent)', bg: 'var(--bd-premium)', where: 'crown on a gold fill' },
      { label: 'Sticker label on sun', fg: 'var(--bd-ink)', bg: 'var(--bd-sun)', where: '.bd-sticker, .bd-avatar-sun – flips in dark' },
      { label: 'Avatar initial on coral', fg: 'white', bg: 'var(--bd-coral)', where: '.bd-avatar, hardcoded white' },
    ],
  },
  {
    title: 'Deep accent text on a card',
    pairs: [
      { label: 'Coral deep', fg: 'var(--bd-coral-deep)', bg: 'var(--bd-card-warm)', where: '.bd-chip-coral' },
      { label: 'Mint deep', fg: 'var(--bd-mint-deep)', bg: 'var(--bd-card-warm)', where: '.bd-chip-mint, .bd-live-dot' },
      { label: 'Sun deep', fg: 'var(--bd-sun-deep)', bg: 'var(--bd-card-warm)', where: '.bd-chip-sun' },
      { label: 'Lavender deep', fg: 'var(--bd-lav-deep)', bg: 'var(--bd-card-warm)', where: '.bd-chip-lav' },
    ],
  },
]

const ALL_PAIRS: ContrastPair[] = CONTRAST_GROUPS.flatMap((group) => group.pairs)
/** Every distinct colour, resolved once per measure rather than once per pair. */
const MEASURED_COLORS: string[] = Array.from(new Set(ALL_PAIRS.flatMap((pair) => [pair.fg, pair.bg])))

// ---------------------------------------------------------------------------
// Real product surfaces
// ---------------------------------------------------------------------------

const ACCENTS = [
  { token: 'var(--bd-coral)', name: '--bd-coral', icon: 'flame' },
  { token: 'var(--bd-mint)', name: '--bd-mint', icon: 'check' },
  { token: 'var(--bd-sun)', name: '--bd-sun', icon: 'star' },
  { token: 'var(--bd-lav)', name: '--bd-lav', icon: 'mask' },
  { token: 'var(--bd-sky)', name: '--bd-sky', icon: 'dice' },
  { token: 'var(--bd-premium)', name: '--bd-premium', icon: 'crown' },
] as const

const PREVIEW_GAMES = [
  { id: 'tic-tac-toe', desc: 'Three in a row, best of five. The fastest game in the catalog.' },
  { id: 'memory', desc: 'Flip two cards, keep the pairs. Four players, one grid.' },
  { id: 'yahtzee', desc: 'Five dice, thirteen rounds, one scorecard nobody agrees on.' },
] as const

interface PreviewGame {
  id: string
  name: string
  accent: string
  players: string
  desc: string
}

function previewGames(): PreviewGame[] {
  const catalog = getCatalogGames()
  return PREVIEW_GAMES.map(({ id, desc }) => {
    const entry = catalog.find((game) => game.id === id)
    const meta = entry?.gameType ? getGameMetadata(entry.gameType) : null
    return {
      id,
      name: meta?.name ?? id,
      accent: meta?.accentColor ?? 'var(--bd-coral)',
      players: entry?.players ?? '2',
      desc,
    }
  })
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="bd-kicker">{title}</h3>
        {hint ? (
          <span style={{ fontSize: 12, color: 'var(--bd-ink-muted)' }}>{hint}</span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

/** A GameRibbon card, same shape as the home page builds it. */
function GameCard({ game }: { game: PreviewGame }) {
  return (
    <div
      style={{
        background: 'var(--bd-card-warm)',
        borderRadius: 24,
        border: '1.5px solid var(--bd-line)',
        boxShadow: '0 6px 0 rgba(31,27,22,0.08), 0 14px 28px -10px rgba(31,27,22,0.18)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          background: `color-mix(in srgb, ${game.accent} 15%, transparent)`,
          padding: '20px 16px',
          height: 132,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <GameIcon gameId={game.id} accentColor={game.accent} size={60} />
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h4
            style={{
              fontFamily: 'var(--bd-font-display)',
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--bd-ink)',
            }}
          >
            {game.name}
          </h4>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: 'rgba(79,201,166,0.18)',
              color: 'var(--bd-mint-deep)',
              whiteSpace: 'nowrap',
            }}
          >
            Play now
          </span>
        </div>

        <p style={{ fontSize: 14, color: 'var(--bd-ink-soft)', lineHeight: 1.5, flex: 1 }}>{game.desc}</p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="bd-chip">
            <Icon name="users" size={12} /> {game.players}
          </span>
          <span className="bd-chip">
            <Icon name="clock" size={12} /> 5 min
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px 20px',
            borderRadius: 14,
            fontWeight: 600,
            fontSize: 15,
            background: 'var(--bd-ink)',
            color: 'var(--bd-bg)',
            boxShadow: '0 4px 0 var(--bd-coral)',
            marginTop: 4,
          }}
        >
          See game
        </div>
      </div>
    </div>
  )
}

function ContrastRow({ pair, ratio }: { pair: ContrastPair; ratio: number | null }) {
  const pass = ratio !== null && ratio >= AA_NORMAL
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 12,
        background: 'var(--bd-bg2)',
        border: '1px solid var(--bd-line)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 36,
          height: 28,
          borderRadius: 8,
          display: 'grid',
          placeItems: 'center',
          background: pair.bg,
          color: pair.fg,
          border: '1px solid var(--bd-line)',
          fontWeight: 700,
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        Aa
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--bd-ink)' }}>{pair.label}</span>
        <span
          style={{
            display: 'block',
            fontSize: 11,
            color: 'var(--bd-ink-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {pair.where}
        </span>
      </span>
      <span
        style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 12,
          fontWeight: 700,
          color: ratio === null ? 'var(--bd-ink-muted)' : pass ? 'var(--bd-mint-deep)' : 'var(--bd-coral-deep)',
        }}
      >
        {ratio === null ? '–' : `${ratio.toFixed(2)}:1`}
      </span>
      {ratio === null ? null : (
        <Icon
          name={pass ? 'check' : 'warning'}
          size={15}
          tone={pass ? 'mint' : 'coral'}
          label={pass ? `${pair.label} passes 4.5 to 1` : `${pair.label} fails 4.5 to 1`}
        />
      )}
    </div>
  )
}

export default function ThemePreview(): React.JSX.Element {
  const probeRef = useRef<HTMLSpanElement>(null)
  const [ratios, setRatios] = useState<number[] | null>(null)
  const games = previewGames()

  /**
   * Resolve every colour through one probe element rather than reading the
   * custom properties as strings: `getComputedStyle().color` hands back
   * `rgb(…)` whatever the author wrote, so a hex, a keyword and a
   * `color-mix()` all measure the same way.
   */
  // Set while the probe is being written to, so the observer below can ignore
  // the mutations this function causes. Without it the observer sees its own
  // twenty style writes, schedules another frame, and the page runs a
  // measure loop forever on an idle screen — about sixty passes a second,
  // each one a forced style recalc.
  const measuring = useRef(false)

  const measure = useCallback(() => {
    const probe = probeRef.current
    if (!probe) return
    measuring.current = true
    const resolved = new Map<string, Rgb | null>()
    for (const color of MEASURED_COLORS) {
      probe.style.color = color
      resolved.set(color, parseComputedColor(window.getComputedStyle(probe).color))
    }
    measuring.current = false
    const next = ALL_PAIRS.map((pair) => {
      const fg = resolved.get(pair.fg)
      const bg = resolved.get(pair.bg)
      return fg && bg ? contrastRatio(fg, bg) : 0
    })
    setRatios((prev) =>
      prev && prev.length === next.length && prev.every((value, i) => Math.abs(value - next[i]) < 0.005)
        ? prev
        : next
    )
  }, [])

  // Re-measure after every render, which covers the ordinary case: the panel
  // re-renders this tree with new custom properties on an ancestor. `useEffect`
  // and not `useLayoutEffect` because this component is server-rendered too,
  // and a layout effect warns there for a frame of accuracy nobody can see.
  useEffect(() => {
    measure()
  })

  // And after any change made without re-rendering us: inline properties
  // written to a ref, the `dark` class on <html>, an injected style tag.
  useEffect(() => {
    let frame = 0
    const schedule = () => {
      if (measuring.current || frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    }
    const attributes = new MutationObserver((records) => {
      // Belt and braces: a record whose target is the probe is our own write,
      // whatever the flag says about timing.
      if (records.every((record) => record.target === probeRef.current)) return
      schedule()
    })
    attributes.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
      subtree: true,
    })
    const stylesheets = new MutationObserver(schedule)
    stylesheets.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => {
      attributes.disconnect()
      stylesheets.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [measure])

  const failures = ratios ? ratios.filter((ratio) => ratio < AA_NORMAL).length : null
  const ratioOf = (pair: ContrastPair): number | null =>
    ratios ? ratios[ALL_PAIRS.indexOf(pair)] : null

  return (
    <div className="flex flex-col gap-8" style={{ color: 'var(--bd-ink)' }}>
      <span
        ref={probeRef}
        aria-hidden="true"
        style={{ position: 'absolute', width: 0, height: 0, visibility: 'hidden', pointerEvents: 'none' }}
      />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="bd-kicker">Live preview</span>
          <p style={{ fontSize: 13, color: 'var(--bd-ink-soft)', marginTop: 2 }}>
            Real Boardly surfaces – judge a palette on the product, not on swatches.
          </p>
        </div>
        <span className={failures === 0 ? 'bd-chip bd-chip-mint' : 'bd-chip bd-chip-coral'}>
          <Icon name={failures === 0 ? 'check' : 'warning'} size={14} />
          {failures === null
            ? `${ALL_PAIRS.length} contrast pairs`
            : failures === 0
              ? `All ${ALL_PAIRS.length} pairs pass 4.5:1`
              : `${failures} of ${ALL_PAIRS.length} pairs under 4.5:1`}
        </span>
      </header>

      <Section title="Game cards" hint="The single best test of an accent – the tile, the band behind it and the CTA all move together.">
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </Section>

      <Section title="Buttons" hint="Every variant in globals.css, disabled included.">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="bd-btn bd-btn-primary">
            Play now
          </button>
          <button type="button" className="bd-btn bd-btn-coral">
            <Icon name="play" size={16} /> Create lobby
          </button>
          <button type="button" className="bd-btn bd-btn-ghost">
            Join with a code
          </button>
          <button type="button" className="bd-btn bd-btn-soft">
            <Icon name="refresh" size={16} /> Refresh
          </button>
          <button type="button" className="bd-btn bd-btn-coral bd-btn-lg">
            Start game
          </button>
          <button type="button" className="bd-btn bd-btn-soft bd-btn-icon">
            <Icon name="gear" size={18} label="Settings" />
          </button>
          <button
            type="button"
            disabled
            className="bd-btn bd-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Waiting for players
          </button>
        </div>
      </Section>

      <Section title="Chips and stickers" hint="Chip fills are hardcoded rgba in globals.css – only the text colour follows the accents.">
        <div className="flex flex-wrap items-center gap-3">
          <span className="bd-chip">
            <Icon name="users" size={12} /> 2-4 players
          </span>
          <span className="bd-chip bd-chip-coral">
            <Icon name="flame" size={12} /> Hot lobby
          </span>
          <span className="bd-chip bd-chip-mint">
            <span className="bd-live-dot" /> Live
          </span>
          <span className="bd-chip bd-chip-sun">
            <Icon name="hourglass" size={12} /> Starting soon
          </span>
          <span className="bd-chip bd-chip-lav">
            <Icon name="mask" size={12} /> Spy round
          </span>
          <span className="bd-sticker">
            <Icon name="trophy" size={14} tone="on-accent" /> Winner
          </span>
        </div>
      </Section>

      <Section title="Avatars" hint="Initials are hardcoded white, except the sun variant which uses ink.">
        <div className="flex flex-wrap items-center gap-3">
          {[
            { cls: 'bd-avatar-coral', initial: 'D' },
            { cls: 'bd-avatar-mint', initial: 'A' },
            { cls: 'bd-avatar-sun', initial: 'M' },
            { cls: 'bd-avatar-lav', initial: 'K' },
            { cls: 'bd-avatar-sky', initial: 'T' },
          ].map(({ cls, initial }) => (
            <span key={cls} className={`bd-avatar ${cls}`} style={{ width: 40, height: 40 }}>
              {initial}
            </span>
          ))}
          <span className="bd-avatar bd-avatar-lav" style={{ width: 40, height: 40 }}>
            <Icon name="robot" size={20} tone="on-accent" />
          </span>
          <span style={{ fontSize: 12, color: 'var(--bd-ink-muted)' }}>Bot seats use an icon, not an initial.</span>
        </div>
      </Section>

      <Section title="Card" hint="Heading, body, hint and hairline – the four ink and line tokens against --bd-card-warm.">
        <div className="bd-card" style={{ padding: 20, maxWidth: 520 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GameIcon gameId="connect-four" accentColor="var(--bd-coral)" size={28} variant="bare" />
            <h4 style={{ fontFamily: 'var(--bd-font-display)', fontSize: 20, fontWeight: 700, color: 'var(--bd-ink)' }}>
              Lobby settings
            </h4>
            <span className="bd-chip bd-chip-mint" style={{ marginLeft: 'auto' }}>
              Open
            </span>
          </div>
          <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.55, color: 'var(--bd-ink-soft)' }}>
            Body copy in --bd-ink-soft. This is the paragraph that carries most of the reading in the product, so it is
            the first thing a darker background breaks.
          </p>
          <div style={{ height: 1, background: 'var(--bd-line)', margin: '14px 0' }} />
          <p style={{ fontSize: 12, color: 'var(--bd-ink-muted)' }}>
            Hint in --bd-ink-muted, above a hairline in --bd-line.
          </p>
        </div>
      </Section>

      <Section
        title="Icons on an accent fill"
        hint='Top row is tone="on-accent", which never flips. Bottom row is the same glyph on a plain surface.'
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start gap-3">
            {ACCENTS.map((accent) => (
              <div key={accent.name} className="flex flex-col items-center gap-1.5" style={{ width: 74 }}>
                <span
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    display: 'grid',
                    placeItems: 'center',
                    background: accent.token,
                    border: '2px solid var(--bd-ink)',
                    boxShadow: '3px 3px 0 var(--bd-ink)',
                  }}
                >
                  <Icon name={accent.icon} size={24} tone="on-accent" />
                </span>
                <code style={{ fontSize: 10, color: 'var(--bd-ink-muted)' }}>{accent.name.replace('--bd-', '')}</code>
              </div>
            ))}
            <GameIcon gameId="spy" accentColor="var(--bd-lav)" size={26} variant="sticker" className="ml-2" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {ACCENTS.map((accent) => (
              <span
                key={accent.name}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--bd-bg2)',
                  border: '1.5px solid var(--bd-line)',
                }}
              >
                <Icon name={accent.icon} size={24} tone="ink" />
              </span>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Input" hint="--bd-input-bg is the only surface that is pure white in light mode.">
        <div style={{ maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label htmlFor="theme-preview-input" className="bd-kicker">
            Lobby code
          </label>
          <input
            id="theme-preview-input"
            className="bd-input"
            defaultValue="BOARDLY"
            spellCheck={false}
            aria-describedby="theme-preview-input-hint"
          />
          <input
            className="bd-input"
            placeholder="Placeholder in --bd-ink-muted"
            aria-label="Empty field showing the placeholder colour"
            readOnly
          />
          <span id="theme-preview-input-hint" style={{ fontSize: 12, color: 'var(--bd-ink-muted)' }}>
            Focus turns the border to --bd-ink.
          </span>
        </div>
      </Section>

      <Section title="Premium" hint="The crown is the one marker that must stay gold in both themes.">
        <div className="flex flex-wrap items-center gap-4">
          <span className="bd-chip">
            <Icon name="crown" size={14} tone="premium" /> Premium
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 999,
              background: 'var(--bd-premium)',
              color: 'var(--bd-ink-on-accent)',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <Icon name="crown" size={16} tone="on-accent" /> Premium lobby
          </span>
          <span className="bd-avatar bd-avatar-sun" style={{ width: 40, height: 40, position: 'relative' }}>
            D
            {/* Gold on gold is invisible: --bd-premium #F59E0B on --bd-sun
                #FFC44D is 1.26:1. The real premium markers in the app sit on
                a neutral surface, so the badge gets one here too, and the
                glyph takes the ink that does not flip. */}
            <span
              style={{
                position: 'absolute', bottom: -4, right: -6,
                display: 'grid', placeItems: 'center',
                width: 22, height: 22, borderRadius: '50%',
                background: 'var(--bd-premium)',
                border: '2px solid var(--bd-card-warm)',
              }}
            >
              <Icon name="crown" size={12} tone="on-accent" />
            </span>
          </span>
        </div>
      </Section>

      <Section
        title="Contrast"
        hint={`WCAG 2.1 ratios measured from the live values. ${AA_NORMAL}:1 is AA for normal text.`}
      >
        <div className="bd-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {CONTRAST_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <h4 className="bd-kicker">{group.title}</h4>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
                {group.pairs.map((pair) => (
                  <ContrastRow key={pair.label} pair={pair} ratio={ratioOf(pair)} />
                ))}
              </div>
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--bd-ink-muted)' }}>
            Pairs marked hardcoded do not move with a token: the label stays white or ink whatever the accent becomes,
            so they are the ones a hue shift breaks without the panel noticing.
          </p>
        </div>
      </Section>
    </div>
  )
}
