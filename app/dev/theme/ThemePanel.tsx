'use client'

/**
 * `/dev/theme` — move Boardly's colour tokens and watch real UI follow, then
 * copy the CSS diff into `app/globals.css`.
 *
 * The tool is only a tool because of that last step: everything here ends in
 * `toCss()`, which is the committable artefact. The live preview is how you
 * decide what to commit, not the product.
 *
 * All colour maths, the token list and the export live in
 * `lib/dev/theme-tokens.ts`; this file is state, controls and layout.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Icon } from '@/components/icons'
import {
  GROUP_LABELS,
  THEME_TOKENS,
  adjust,
  changedTokens,
  defaultValue,
  hexToHsl,
  hslToHex,
  isHexColor,
  isThemeScoped,
  toCss,
  type Hsl,
  type ThemeToken,
  type ThemeValues,
  type ThemeVariant,
  type TokenGroup,
} from '@/lib/dev/theme-tokens'
import ThemePreview from './ThemePreview'

const STORAGE_KEY = 'boardly:dev-theme:v1'
const GROUP_ORDER: readonly TokenGroup[] = ['accent', 'ink', 'surface']

/** Hue rotation is a full turn either way; saturation scales from flat grey to double. */
const HUE_RANGE = 180
const SAT_MAX_PERCENT = 200

/**
 * One editable state, not two half-states.
 *
 * - `light` / `dark` are the per-token values the user has actually set. Every
 *   token is always present in both, so nothing downstream has to handle a hole.
 * - `accentHue` / `accentSat` are a *lens* over the accent tokens, held apart
 *   from the values rather than written into them. That is what makes the
 *   global sliders composable: the shifted colour is computed on the way to the
 *   screen, so dragging back to 0 and x1.00 does not "undo" anything, it simply
 *   stops applying, and the values underneath are byte-identical to before.
 *   Baking the shift into the values on every drag would round-trip through
 *   hex 200 times and drift; this cannot drift, because nothing was overwritten.
 * - The lens is shared by both variants on purpose: all eleven accents are
 *   `dark: null` in the contract, i.e. `html.dark` does not redefine them, so a
 *   per-variant accent shift would describe a palette that CSS cannot express.
 */
interface ThemeState {
  light: ThemeValues
  dark: ThemeValues
  accentHue: number
  accentSat: number
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

function defaultsFor(variant: ThemeVariant): ThemeValues {
  const values: ThemeValues = {}
  for (const token of THEME_TOKENS) values[token.name] = defaultValue(token, variant)
  return values
}

/** `#abc` and `#AABBCC` both become `#AABBCC`, so comparisons and the export agree. */
function normalizeHex(value: string): string {
  const clean = value.trim().replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  return `#${full.toUpperCase()}`
}

function isNeutralShift(hue: number, sat: number): boolean {
  return hue === 0 && sat === 1
}

/**
 * The lens. Identity when the sliders are neutral — an explicit short-circuit,
 * not an accident of the maths: `adjust()` round-trips hex through integer HSL,
 * which can land a channel one step away. Returning the input untouched is what
 * makes "drag back to zero" mean *exactly* where he started.
 */
function withAccentShift(values: ThemeValues, hue: number, sat: number): ThemeValues {
  if (isNeutralShift(hue, sat)) return values
  const shifted: ThemeValues = { ...values }
  for (const token of THEME_TOKENS) {
    if (token.group !== 'accent') continue
    shifted[token.name] = adjust(values[token.name], hue, sat)
  }
  return shifted
}

/** Flatten the lens into the values and return the sliders to neutral. */
function bakeShift(state: ThemeState): ThemeState {
  return {
    light: withAccentShift(state.light, state.accentHue, state.accentSat),
    dark: withAccentShift(state.dark, state.accentHue, state.accentSat),
    accentHue: 0,
    accentSat: 1,
  }
}

// ---------------------------------------------------------------------------
// Persistence — every call sits in a try/catch because a private window throws
// on the very first `localStorage` access, and a dev tool that white-screens
// there is worse than one that forgets.
// ---------------------------------------------------------------------------

function readNumber(raw: unknown, min: number, max: number, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback
  return Math.min(max, Math.max(min, raw))
}

/**
 * Rebuilds a variant map from whatever was stored. It is driven by
 * `THEME_TOKENS`, never by the stored keys, so a token added to the contract
 * gets its default and a token removed from it is simply never looked up — the
 * stored blob can be older than the token list and still restore cleanly.
 */
function readValues(raw: unknown, variant: ThemeVariant): ThemeValues {
  const stored = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const values: ThemeValues = {}
  for (const token of THEME_TOKENS) {
    const value = stored[token.name]
    values[token.name] =
      typeof value === 'string' && isHexColor(value) ? normalizeHex(value) : defaultValue(token, variant)
  }
  return values
}

function readStoredState(): ThemeState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    const light = readValues(record.light, 'light')
    const dark = readValues(record.dark, 'dark')
    // A token `html.dark` does not redefine has one value, not two. Editing
    // keeps the maps in step, but a blob written by an older build — or by hand
    // — can disagree, and a disagreement here has no meaning in CSS. Light
    // wins, because that is the block a shared token exports to.
    for (const token of THEME_TOKENS) {
      if (!isThemeScoped(token)) dark[token.name] = light[token.name]
    }
    return {
      light,
      dark,
      accentHue: readNumber(record.accentHue, -HUE_RANGE, HUE_RANGE, 0),
      accentSat: readNumber(record.accentSat, 0, SAT_MAX_PERCENT / 100, 1),
    }
  } catch {
    // Unreadable or unparseable: fall back to the defaults rather than fail.
    return null
  }
}

// ---------------------------------------------------------------------------
// Small controls
// ---------------------------------------------------------------------------

function Slider({
  label,
  ariaLabel,
  value,
  min,
  max,
  readout,
  accent,
  onChange,
}: {
  label: string
  ariaLabel: string
  value: number
  min: number
  max: number
  readout: string
  accent: string
  onChange: (next: number) => void
}) {
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="w-3 shrink-0 text-[11px] font-bold" style={{ color: 'var(--bd-ink-muted)' }}>
        {label}
      </span>
      <input
        type="range"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-4 min-w-0 flex-1 cursor-pointer"
        style={{ accentColor: accent }}
      />
      <span
        className="w-12 shrink-0 text-right text-[11px] tabular-nums"
        style={{ color: 'var(--bd-ink-muted)' }}
      >
        {readout}
      </span>
    </label>
  )
}

function Swatch({ color, size = 34 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="block shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        background: color,
        border: '1.5px solid var(--bd-line)',
        boxShadow: 'inset 0 0 0 1px rgba(31,27,22,0.06)',
      }}
    />
  )
}

function SmallButton({
  onClick,
  icon,
  children,
  disabled,
  title,
}: {
  onClick: () => void
  icon: 'refresh' | 'copy' | 'check' | 'sparkle'
  children: string
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="bd-btn bd-btn-soft"
      style={{ padding: '7px 12px', fontSize: 12, borderRadius: 10, opacity: disabled ? 0.45 : 1 }}
    >
      <Icon name={icon} size={14} />
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Token row
// ---------------------------------------------------------------------------

function TokenRow({
  token,
  value,
  variant,
  changed,
  draft,
  onDraft,
  onCommit,
}: {
  token: ThemeToken
  value: string
  variant: ThemeVariant
  changed: boolean
  draft: string | undefined
  onDraft: (text: string) => void
  onCommit: (hex: string) => void
}) {
  const shared = !isThemeScoped(token)
  const draftValid = draft === undefined || isHexColor(draft)

  // The sliders drive an HSL draft, not the hex. `hexToHsl` rounds to whole
  // degrees and percents, so `hslToHex(hexToHsl(hex))` is not an identity for
  // most of these tokens — re-deriving all three channels from the hex on every
  // drag meant moving H also nudged S and L, and a token you dragged and
  // dragged back came to rest one step away from where it started. It then
  // claimed to be changed and put a line in the pasteable CSS that changes
  // nothing. In a tool whose whole output is that diff, a phantom line is the
  // worst thing it can produce.
  const external = hexToHsl(value)
  const [hslDraft, setHslDraft] = useState<Hsl>(external)
  const [dragging, setDragging] = useState(false)
  // Follow the value whenever something other than these sliders moved it:
  // a typed hex, a reset, a baked global shift.
  useEffect(() => {
    if (!dragging) setHslDraft(hexToHsl(value))
    // `value` is the only thing that should resync the draft.
  }, [value, dragging])
  const hsl = dragging ? hslDraft : external

  const defaultHex = defaultValue(token, variant)
  const defaultHsl = hexToHsl(defaultHex)

  const commitHsl = (next: Hsl) => {
    setDragging(true)
    setHslDraft(next)
    // Landing back on the default's HSL commits the default's own hex rather
    // than its round-trip, so "drag away and back" is exactly a no-op and the
    // diff empties again.
    const isDefault = next.h === defaultHsl.h && next.s === defaultHsl.s && next.l === defaultHsl.l
    onCommit(isDefault ? defaultHex : hslToHex(next))
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-2 py-3"
      style={{ borderTop: '1px solid var(--bd-line)' }}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Swatch color={value} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <code className="text-[12px] font-semibold" style={{ color: 'var(--bd-ink)' }}>
              --{token.name}
            </code>
            {changed ? (
              <span className="bd-chip bd-chip-sun" style={{ padding: '2px 8px', fontSize: 10 }}>
                changed
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'var(--bd-ink-muted)' }}>
            {token.note}
          </p>
        </div>
        <input
          type="text"
          spellCheck={false}
          aria-label={`--${token.name} hex value`}
          value={draft ?? value}
          onChange={(event) => onDraft(event.target.value)}
          onBlur={() => onDraft('')}
          className="w-[92px] shrink-0"
          style={{
            padding: '7px 8px',
            border: `2px solid ${draftValid ? 'var(--bd-line)' : 'var(--bd-coral)'}`,
            borderRadius: 10,
            background: 'var(--bd-input-bg)',
            color: 'var(--bd-ink)',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12,
            textAlign: 'center',
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5 pl-[46px]">
        <Slider
          label="H"
          ariaLabel={`--${token.name} hue`}
          value={hsl.h}
          min={0}
          max={360}
          readout={`${hsl.h}°`}
          accent={value}
          onChange={(h) => commitHsl({ ...hsl, h })}
        />
        <Slider
          label="S"
          ariaLabel={`--${token.name} saturation`}
          value={hsl.s}
          min={0}
          max={100}
          readout={`${hsl.s}%`}
          accent={value}
          onChange={(s) => commitHsl({ ...hsl, s })}
        />
        <Slider
          label="L"
          ariaLabel={`--${token.name} lightness`}
          value={hsl.l}
          min={0}
          max={100}
          readout={`${hsl.l}%`}
          accent={value}
          onChange={(l) => commitHsl({ ...hsl, l })}
        />
      </div>

      {shared && variant === 'dark' ? (
        <p className="pl-[46px] text-[11px] leading-snug" style={{ color: 'var(--bd-ink-muted)' }}>
          <Icon name="info" size={12} className="mr-1 inline-block align-[-1px]" />
          Shared with light. <code>html.dark</code> does not redefine this one, so editing it here
          edits the light value too and it exports to <code>:root</code>.
        </p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function ThemePanel(): React.JSX.Element {
  const [state, setState] = useState<ThemeState>(() => ({
    light: defaultsFor('light'),
    dark: defaultsFor('dark'),
    accentHue: 0,
    accentSat: 1,
  }))
  const [variant, setVariant] = useState<ThemeVariant>('light')
  const [hydrated, setHydrated] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  /** In-flight hex text, keyed `variant:token`, so a half-typed `#3` is not thrown away. */
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  // Restore before the first write, so an empty first render never clobbers
  // what is stored. Server render and first client render are both the
  // defaults, which keeps hydration identical.
  useEffect(() => {
    const stored = readStoredState()
    if (stored) setState(stored)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Private window, or storage full. The panel still works for this session.
    }
  }, [hydrated, state])

  useEffect(() => {
    if (copyState === 'idle') return
    const timer = window.setTimeout(() => setCopyState('idle'), 2500)
    return () => window.clearTimeout(timer)
  }, [copyState])

  const shiftActive = !isNeutralShift(state.accentHue, state.accentSat)

  // What the preview, the swatches and the export all read. Derived, never stored.
  const lightValues = useMemo(
    () => withAccentShift(state.light, state.accentHue, state.accentSat),
    [state]
  )
  const darkValues = useMemo(
    () => withAccentShift(state.dark, state.accentHue, state.accentSat),
    [state]
  )
  const activeValues = variant === 'dark' ? darkValues : lightValues

  /**
   * What `toCss` is handed for the dark block. A token `html.dark` does not
   * redefine is edited in both maps at once here, so the two always agree — and
   * a shared token that agrees with light has nothing to say about dark, so it
   * is reported at its default and drops out of the dark diff. Without this,
   * every accent edit would trip the contract's "Not exported ... change them in
   * the light tab instead" warning while he was standing on the light tab.
   * A token that somehow disagreed would still be passed through, so the
   * warning survives as the safety net it was written to be.
   */
  const exportDarkValues = useMemo(() => {
    const values: ThemeValues = { ...darkValues }
    for (const token of THEME_TOKENS) {
      if (isThemeScoped(token)) continue
      if (values[token.name] === lightValues[token.name]) {
        values[token.name] = defaultValue(token, 'dark')
      }
    }
    return values
  }, [darkValues, lightValues])

  const css = useMemo(() => toCss(lightValues, exportDarkValues), [lightValues, exportDarkValues])

  const changedNames = useMemo(
    () => new Set(changedTokens(activeValues, variant).map((token) => token.name)),
    [activeValues, variant]
  )
  const changedCount = useMemo(
    () =>
      changedTokens(lightValues, 'light').length +
      changedTokens(darkValues, 'dark').filter(isThemeScoped).length,
    [lightValues, darkValues]
  )

  /**
   * The whole panel and the preview sit inside this element, so both repaint
   * from the same values and nothing escapes to the rest of the app.
   *
   * On the `dark` class: `app/globals.css` writes the dark palette as
   * `html.dark { --bd-bg: ... }` — element-qualified, so it can only ever match
   * `<html>`. A nested `<div class="dark">` does not inherit those eight
   * redefinitions, which is why the class is not the mechanism here: every
   * token is written out as an inline custom property from the variant's own
   * map, and an inline declaration outranks both `:root` and `html.dark`
   * whatever the surrounding page is currently set to. The class still goes on,
   * because Tailwind runs `darkMode: 'class'` and compiles `dark:` utilities to
   * a `.dark` ancestor selector, and a few hand-written `.dark .x` rules match
   * the same way — those do follow a wrapper. What does not follow it is the
   * `html.dark .x` block of component overrides further down globals.css; the
   * alternative, toggling the real class on `<html>`, would pick those up and
   * repaint the entire app around the panel, which is exactly what this wrapper
   * exists to prevent.
   */
  const wrapperStyle = useMemo(() => {
    const style: Record<string, string> = {}
    for (const token of THEME_TOKENS) style[`--${token.name}`] = activeValues[token.name]
    // `--bd-btn-ink: var(--bd-ink)` is declared once, on `:root`, so it is
    // already substituted by the time it inherits down here — overriding
    // `--bd-ink` on this wrapper would leave every `.bd-btn` on the old ink.
    // Re-declaring the alias makes it resolve against our value. It is not a
    // token and never exports; in real CSS both declarations land on `<html>`,
    // where the substitution works by itself.
    style['--bd-btn-ink'] = activeValues['bd-ink']
    style.background = 'var(--bd-bg)'
    style.color = 'var(--bd-ink)'
    style.colorScheme = variant === 'dark' ? 'dark' : 'light'
    return style as CSSProperties
  }, [activeValues, variant])

  const draftKey = useCallback((name: string) => `${variant}:${name}`, [variant])

  const commitToken = useCallback(
    (token: ThemeToken, rawHex: string) => {
      const hex = normalizeHex(rawHex)
      setDrafts((prev) => {
        if (prev[`${variant}:${token.name}`] === undefined) return prev
        const next = { ...prev }
        delete next[`${variant}:${token.name}`]
        return next
      })
      setState((prev) => {
        // Editing one accent while the lens is live would fight it: the colour
        // picked here would be rotated again on the way to the screen. Baking
        // first makes the pick land exactly. The cost is that the global
        // sliders no longer rewind past this point, which the section says out
        // loud rather than leaving to be discovered.
        const base = token.group === 'accent' && !isNeutralShift(prev.accentHue, prev.accentSat)
          ? bakeShift(prev)
          : prev
        const shared = !isThemeScoped(token)
        return {
          ...base,
          light: shared || variant === 'light' ? { ...base.light, [token.name]: hex } : base.light,
          dark: shared || variant === 'dark' ? { ...base.dark, [token.name]: hex } : base.dark,
        }
      })
    },
    [variant]
  )

  const onDraft = useCallback(
    (token: ThemeToken, text: string) => {
      const key = draftKey(token.name)
      // Blur sends an empty string: drop the draft and fall back to the real
      // value, so an abandoned `#ff` does not sit there looking like state.
      if (text === '') {
        setDrafts((prev) => {
          if (prev[key] === undefined) return prev
          const next = { ...prev }
          delete next[key]
          return next
        })
        return
      }
      setDrafts((prev) => ({ ...prev, [key]: text }))
      // Commit only once it parses. Typing `#F` in between is left alone.
      if (isHexColor(text)) commitToken(token, text)
    },
    [commitToken, draftKey]
  )

  const resetGroup = useCallback((group: TokenGroup) => {
    setDrafts({})
    setState((prev) => {
      const light = { ...prev.light }
      const dark = { ...prev.dark }
      for (const token of THEME_TOKENS) {
        if (token.group !== group) continue
        light[token.name] = defaultValue(token, 'light')
        dark[token.name] = defaultValue(token, 'dark')
      }
      return {
        light,
        dark,
        // Resetting the accents has to drop the lens too, or the group would
        // come back rotated and "reset" would be a lie.
        accentHue: group === 'accent' ? 0 : prev.accentHue,
        accentSat: group === 'accent' ? 1 : prev.accentSat,
      }
    })
  }, [])

  const resetAll = useCallback(() => {
    setDrafts({})
    setState({ light: defaultsFor('light'), dark: defaultsFor('dark'), accentHue: 0, accentSat: 1 })
  }, [])

  const copyCss = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(css)
      setCopyState('copied')
    } catch {
      // No clipboard API, or the document is not focused. The block below is
      // the fallback, and it is always on screen for exactly this reason.
      setCopyState('failed')
    }
  }, [css])

  const accentTokens = THEME_TOKENS.filter((token) => token.group === 'accent')

  return (
    <>
      {/* Outside the themed wrapper on purpose. Everything below inherits the
          tokens being edited, so setting --bd-ink to the background colour
          blanks the panel's own controls — including Reset all — and the state
          is persisted, so a reload restores the blank screen. This escape
          hatch keeps its own colours and is always readable. */}
      <div
        style={{
          position: 'fixed', right: 12, bottom: 12, zIndex: 60,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 999,
          background: '#1F1B16', color: '#FBF6EE',
          fontSize: 12, fontWeight: 600,
          boxShadow: '0 6px 18px -6px rgba(0,0,0,0.5)',
        }}
      >
        <span>Stuck?</span>
        <button
          type="button"
          onClick={resetAll}
          style={{
            padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
            background: '#FBF6EE', color: '#1F1B16', border: 'none',
            fontSize: 12, fontWeight: 700,
          }}
        >
          Reset everything
        </button>
      </div>
    <div className={variant === 'dark' ? 'dark min-h-screen' : 'min-h-screen'} style={wrapperStyle}>
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-4 py-6 desk:px-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1
              className="text-2xl font-extrabold"
              style={{ fontFamily: 'var(--bd-font-display)', color: 'var(--bd-ink)' }}
            >
              Theme workbench
            </h1>
            <p className="text-sm" style={{ color: 'var(--bd-ink-muted)' }}>
              {THEME_TOKENS.length} colour tokens, live on real components. Dev only – the output is
              a CSS diff for <code>app/globals.css</code>, nothing here is saved to the app.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex gap-1 p-1"
              style={{ background: 'var(--bd-bg2)', border: '1.5px solid var(--bd-line)', borderRadius: 999 }}
            >
              {(['light', 'dark'] as const).map((option) => {
                const active = variant === option
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setVariant(option)}
                    className="bd-btn"
                    style={{
                      padding: '6px 16px',
                      fontSize: 13,
                      borderRadius: 999,
                      background: active ? 'var(--bd-ink)' : 'transparent',
                      color: active ? 'var(--bd-bg)' : 'var(--bd-ink-soft)',
                      boxShadow: 'none',
                    }}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
            <span className="bd-chip">
              <Icon name="palette" size={14} />
              {changedCount} changed
            </span>
            <SmallButton
              onClick={resetAll}
              icon="refresh"
              title="Every token in both variants back to the values in globals.css"
            >
              Reset all
            </SmallButton>
          </div>
        </header>

        <div className="grid gap-5 desk:grid-cols-[minmax(0,440px)_minmax(0,1fr)] desk:items-start">
          {/* Global controls: column 1, row 1 on desktop; first on a phone, because
              this is the control that changes the product's character. */}
          <section
            className="bd-card p-4 desk:col-start-1 desk:row-start-1"
            style={{ borderRadius: 18 }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="bd-kicker">All accents together</h2>
              <SmallButton
                onClick={() => setState((prev) => bakeShift(prev))}
                icon="sparkle"
                disabled={!shiftActive}
                title="Write the current shift into the values and return these sliders to neutral"
              >
                Bake shift
              </SmallButton>
            </div>
            <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--bd-ink-muted)' }}>
              Rotates the hue of all {accentTokens.length} accents and scales their saturation at
              once, keeping the relationships between them. The shift sits on top of the values
              below, so 0 and x1.00 is exactly where you started. Editing a single accent bakes the
              shift in first and returns these to neutral.
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <Slider
                label="H"
                ariaLabel="Accent hue rotation"
                value={state.accentHue}
                min={-HUE_RANGE}
                max={HUE_RANGE}
                readout={`${state.accentHue > 0 ? '+' : ''}${state.accentHue}°`}
                accent={activeValues['bd-coral']}
                onChange={(accentHue) => setState((prev) => ({ ...prev, accentHue }))}
              />
              <Slider
                label="S"
                ariaLabel="Accent saturation scale"
                value={Math.round(state.accentSat * 100)}
                min={0}
                max={SAT_MAX_PERCENT}
                readout={`x${state.accentSat.toFixed(2)}`}
                accent={activeValues['bd-mint']}
                onChange={(percent) => setState((prev) => ({ ...prev, accentSat: percent / 100 }))}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {accentTokens.map((token) => (
                <Swatch key={token.name} color={activeValues[token.name]} size={26} />
              ))}
            </div>

            {shiftActive ? (
              <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--bd-ink-soft)' }}>
                <Icon name="info" size={12} className="mr-1 inline-block align-[-1px]" />
                Swatches and hex fields below show the shifted result. Drag back to 0 and x1.00 to
                see the underlying values again.
              </p>
            ) : null}
          </section>

          {/* Preview and export: column 2 on desktop, sticky so it stays opposite
              whichever group is being edited. Second on a phone, right under the
              global sliders and above the 20 per-token rows.

              It scrolls inside itself on desktop because the preview alone is
              some 2,700px: pinned at the top of the viewport without a height
              cap, everything past the first screenful — the CSS diff included —
              would sit below the fold with no way to reach it, since the page
              scroll now belongs to the token list on the left. */}
          {/* The site header is `sticky top-0`, 64px and opaque, so pinning at
              top-4 put the first 48px of the preview behind it. Both values
              come off --bd-header-h rather than a literal, which is what
              CLAUDE.md's responsive rule asks for. */}
          <div
            style={{
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ['--sticky-top' as any]: 'calc(var(--bd-header-h) + 1rem)',
            }}
            className="flex flex-col gap-5 desk:top-[var(--sticky-top)] desk:max-h-[calc(100dvh_-_var(--sticky-top)_-_1rem)] desk:sticky desk:col-start-2 desk:row-start-1 desk:row-span-2 desk:overflow-y-auto desk:pr-1">
            {/* No heading of our own: the preview labels itself, and stacking a
                second kicker on top of its own only reads as a mistake. */}
            <div className="min-w-0">
              <ThemePreview />
            </div>

            <section className="bd-card p-4" style={{ borderRadius: 18 }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="bd-kicker">The diff</h2>
                <button type="button" onClick={copyCss} className="bd-btn bd-btn-coral" style={{ padding: '9px 16px', fontSize: 13 }}>
                  <Icon name={copyState === 'copied' ? 'check' : 'copy'} size={16} tone="on-accent" />
                  {copyState === 'copied' ? 'Copied' : 'Copy CSS'}
                </button>
              </div>
              <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--bd-ink-muted)' }}>
                Paste into <code>app/globals.css</code>, over the matching lines of the{' '}
                <code>:root</code> and <code>html.dark</code> blocks at the top of the file. Only
                changed tokens appear.
                {copyState === 'failed' ? ' Clipboard unavailable – select the text below instead.' : ''}
              </p>
              <pre
                className="mt-3 text-[12px] leading-relaxed"
                style={{
                  fontFamily: 'ui-monospace, monospace',
                  background: 'var(--bd-bg2)',
                  border: '1.5px solid var(--bd-line)',
                  borderRadius: 12,
                  color: 'var(--bd-ink-soft)',
                  padding: 12,
                  margin: 0,
                  maxHeight: 320,
                  overflow: 'auto',
                  whiteSpace: 'pre',
                }}
              >
                {css}
              </pre>
            </section>
          </div>

          {/* Per-token groups: column 1, row 2 on desktop; last on a phone. */}
          <div className="flex min-w-0 flex-col gap-5 desk:col-start-1 desk:row-start-2">
            {GROUP_ORDER.map((group) => {
              const tokens = THEME_TOKENS.filter((token) => token.group === group)
              return (
                <section key={group} className="bd-card p-4" style={{ borderRadius: 18 }}>
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                    <h2 className="bd-kicker">{GROUP_LABELS[group]}</h2>
                    <SmallButton
                      onClick={() => resetGroup(group)}
                      icon="refresh"
                      title={`${GROUP_LABELS[group]} back to globals.css, in both variants`}
                    >
                      Reset
                    </SmallButton>
                  </div>
                  {tokens.map((token) => (
                    <TokenRow
                      key={token.name}
                      token={token}
                      value={activeValues[token.name]}
                      variant={variant}
                      changed={changedNames.has(token.name)}
                      draft={drafts[draftKey(token.name)]}
                      onDraft={(text) => onDraft(token, text)}
                      onCommit={(hex) => commitToken(token, hex)}
                    />
                  ))}
                </section>
              )
            })}
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
