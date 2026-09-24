# Boardly Design System

AI-agent reference for all visual decisions in this codebase.

---

## Core rule

**Never hardcode hex color values.** Every color must come from a token.

- In `className` → use Tailwind utilities: `bg-bd-coral`, `text-bd-ink`
- In `style={{}}` → use CSS variables: `background: 'var(--bd-coral)'`
- In SVG `stroke`/`fill` attributes → convert to `style` prop: `style={{ stroke: 'var(--bd-coral)' }}`
- In Tailwind arbitrary values → CSS variables work: `shadow-[0_4px_0_var(--bd-ink)]`

The only legitimate exception is `app/layout.tsx` — the `<style dangerouslySetInnerHTML>` block contains a critical inline CSS string for SSR first-paint performance. **Do not change it.**

---

## Color tokens

All tokens are defined in `app/globals.css` (`:root`) and mirrored in `tailwind.config.ts`.

| Token | CSS variable | Tailwind class | Hex |
|---|---|---|---|
| Coral (primary CTA) | `var(--bd-coral)` | `bd-coral` | `#FF6B5B` |
| Coral deep (shadows) | `var(--bd-coral-deep)` | `bd-coral-deep` | `#E04B3B` |
| Mint (success/accent) | `var(--bd-mint)` | `bd-mint` | `#4FC9A6` |
| Mint deep | `var(--bd-mint-deep)` | `bd-mint-deep` | `#2FA787` |
| Sun (highlight/badge) | `var(--bd-sun)` | `bd-sun` | `#FFC44D` |
| Sun deep | `var(--bd-sun-deep)` | `bd-sun-deep` | `#E5A82E` |
| Lav (secondary/lav) | `var(--bd-lav)` | `bd-lav` | `#9B8CFF` |
| Lav mid (hover state) | `var(--bd-lav-mid)` | `bd-lav-mid` | `#8B7DFF` |
| Lav deep (border/shadow) | `var(--bd-lav-deep)` | `bd-lav-deep` | `#7867E8` |
| Sky | `var(--bd-sky)` | `bd-sky` | `#6BC1F0` |
| Ink (primary text/dark bg) | `var(--bd-ink)` | `bd-ink` | `#1F1B16` |
| Ink soft | `var(--bd-ink-soft)` | `bd-ink-soft` | `#4A3F33` |
| Ink muted | `var(--bd-ink-muted)` | `bd-ink-muted` | `#8A7A66` |
| Line (borders) | `var(--bd-line)` | `bd-line` | `#E8DDC8` |
| BG (page background) | `var(--bd-bg)` | `bd-bg` | `#FBF6EE` |
| BG2 (hover bg/chips) | `var(--bd-bg2)` | `bd-bg2` | `#F2E9D8` |
| Card warm (card surfaces) | `var(--bd-card-warm)` | `bd-card-warm` | `#FFF8EC` |

---

## Contrast

Target (WCAG 2.0 AA / forskrift om universell utforming av IKT § 4, which binds this
private site today — see #1171): **4.5:1 for normal text, 3:1 for large text (≥18px, or
≥14px bold) and for UI component boundaries** (input borders, focus indicators).

Ratios below are computed straight from the hex values in the Color tokens table above
(WCAG relative-luminance formula), not eyeballed:

| Pair | Ratio | Meets |
|---|---|---|
| `bd-ink` text on `bd-bg` (body copy) | 15.9:1 | AA text + large |
| `bd-ink-soft` text on `bd-bg` (secondary copy) | 9.5:1 | AA text + large |
| `bd-ink-muted` text on `bd-bg` (placeholders, captions) | 3.9:1 | AA large only — **do not use for normal-size body text** |
| `bd-ink-muted` text on `bd-bg2` (chip/hover captions) | 3.4:1 | AA large only |
| `bd-bg` text on `bd-ink` (primary button) | 15.9:1 | AA text + large |
| `bd-ink` text on `bd-sun` (badges) | 10.8:1 | AA text + large |
| `bd-ink` text on `bd-mint` | 8.3:1 | AA text + large |
| white text on `bd-coral-deep` | 4.0:1 | AA large only |
| white text on `bd-lav-deep` | 4.3:1 | AA large only |
| white text on `bd-mint-deep` | 3.0:1 | AA large only |
| white text on `bd-coral` (Coral CTA example above) | 2.8:1 | **fails AA at any size** |
| white text on `bd-lav` (Lav button example above) | 2.8:1 | **fails AA at any size** |
| `bd-line` border on `bd-bg` (default input/card border) | 1.3:1 | **fails the 3:1 UI-boundary target** |

The last three rows are real gaps, not measured before #1171: the Coral and Lav button
patterns in this file only clear AA when their label is large+bold text (≥18px / ≥14px
bold); `.bd-input`'s resting border is `bd-line` on `bd-bg` (1.3:1, below the 3:1
boundary target) and only reaches a high-contrast `bd-ink` border (`:focus`,
`app/globals.css`) once the field is focused, so an unfocused input's edge is the one that
fails today. Changing `bd-coral`, `bd-lav` or the resting input border is a brand-color
decision, not an a11y bugfix — flag it rather than re-tuning the palette unilaterally.

Recompute with the WCAG relative-luminance formula (not perceived brightness) whenever a
new token or a new text-on-fill pairing is added, and add it to this table.

---

## Icons

**No Unicode emoji in the UI.** Emoji render in the OS emoji font, ignore every token
above and read as generic. `npm run audit:emoji` (part of `ci:quick`) fails on any new
emoji in `app/`, `components/`, `lib/`, `locales/`, `hooks/`, `contexts/`; legacy debt
shrinks through `scripts/emoji-baseline.json`. The only allowed emoji are user content
(chat, reactions), celebration bursts and log prefixes — see `scripts/emoji-allowlist.json`.

Two components, both coloured only through `currentColor` / tokens so they survive dark
mode and the premium lobby themes:

| Component | Grid | Use |
|---|---|---|
| `<Icon name size tone label>` (`components/icons`) | 24×24 | UI chrome: status, buttons, chips, tabs, empty states |
| `<GameIcon gameId accentColor size variant>` (`components/GameIcon.tsx`) | 48×48 | anything that stands for a game |

`Icon` defaults to 20px and `currentColor`; `tone` picks a token (`ink`, `muted`, `coral`,
`mint`, `sun`, `lav`, `sky`, `premium`, `bg`). It is decorative (`aria-hidden`) unless you
pass `label`, which you must when the icon is the only thing conveying meaning.

`GameIcon` has three frames: `tile` (default — tinted rounded square, glyph in the accent),
`bare` (just the glyph, for breadcrumbs, chips, inline text) and `sticker` (accent tile, ink
border, hard offset shadow, rotated −6°, glyph in ink — the B-tile language, for hero and
create-page art). `gameId` is the catalog `id` / `svgId`.

Drawing rules for new glyphs (review them on `/dev/icons`, dev only):

- Filled, rounded, slightly chunky — never thin outline icons. Rings and lines use a
  2.4–3.2 stroke (24 grid) with round caps; corner radius ≥ 1.5; smallest feature ≥ 2px.
- One colour. Cut details out with `fillRule="evenodd"`; a second layer of the same colour
  at 40 % opacity is fine *beside* the main shape, never on top. Game glyphs get a second
  tone through `--gi-detail` (GameIcon sets it per variant) — nothing else.
- 1px safe margin on the 24 grid, 4px on the 48 grid; optically centre, and check 16px.
- No hex, no `fill="#…"`; `stroke="currentColor"` is fine.

## Shadow tokens (Tailwind `shadow-*`)

| Token | Value | Use case |
|---|---|---|
| `shadow-bd-soft` | `0 4px 14px rgba(31,27,22,0.07)` | Subtle card lift |
| `shadow-bd-card` | `0 6px 0 rgba(…0.08), 0 14px 28px -10px rgba(…0.18)` | Cards and panels |
| `shadow-bd-pop` | `0 8px 0 rgba(31,27,22,0.85)` | Pop-out elements |
| `shadow-bd-ink-4` | `0 4px 0 #1F1B16` | Ink-colored button press |
| `shadow-bd-ink-5` | `0 5px 0 #1F1B16` | Taller ink press |
| `shadow-bd-coral-4` | `0 4px 0 #E04B3B` | Coral button press shadow |

For non-standard offsets (e.g. `6px 6px`), use Tailwind arbitrary with CSS variable:
```jsx
className="shadow-[6px_6px_0_var(--bd-ink)]"
```

---

## Border radius tokens

| Token | Value |
|---|---|
| `rounded-bd-sm` | `10px` |
| `rounded-bd-md` | `16px` |
| `rounded-bd-lg` | `24px` |
| `rounded-bd-xl` | `36px` |

---

## Typography

Display font: **Bricolage Grotesque** (fallback: Georgia, serif)

```jsx
// Tailwind
className="font-display"

// Inline style (only when Tailwind can't express it)
style={{ fontFamily: 'var(--bd-font-display)' }}
```

Use `font-display` for headings, hero text, badges, button labels, score values.
Use system font (default) for body text, descriptions, labels.

---

## Button patterns

### Primary (ink bg, coral shadow)
```jsx
<button
  className="px-6 py-3 rounded-bd-md font-semibold text-bd-bg bg-bd-ink shadow-bd-ink-4 hover:-translate-y-px transition-transform"
>
  Play →
</button>
```

### Coral CTA (coral bg, coral-deep shadow)
```jsx
<button
  className="px-6 py-3 rounded-bd-md font-bold text-white bg-bd-coral shadow-bd-coral-4 hover:scale-105 transition-transform"
>
  Play free
</button>
```

### Ghost (border only)
```jsx
<button
  className="px-6 py-3 rounded-bd-md font-semibold text-bd-ink border-2 border-bd-ink hover:bg-bd-bg2 transition-colors"
>
  Browse games
</button>
```

### Lav (feedback/lav actions)
```jsx
<button
  className="px-6 py-3 rounded-bd-md font-bold text-white bg-bd-lav border-2 border-bd-lav-deep shadow-[0_4px_0_var(--bd-lav-deep)] hover:bg-bd-lav-mid hover:-translate-y-0.5 transition-all"
>
  Send
</button>
```

---

## Card pattern

```jsx
<div
  className="rounded-bd-lg border border-bd-line bg-white shadow-bd-card"
>
  {/* content */}
</div>
```

For warm card surfaces use `bg-bd-card-warm` instead of `bg-white`.

---

## Header navigation (active/inactive)

```jsx
const navBtn = (active: boolean) =>
  `rounded-xl font-medium transition-all duration-150 ${
    active
      ? 'bg-bd-ink text-bd-bg'
      : 'text-bd-ink-soft hover:bg-bd-bg2 hover:text-bd-ink'
  }`
```

---

## Die / avatar inline styles

These components use `size` as a numeric prop driving `width`, `height`, `borderRadius`, `fontSize` — values Tailwind cannot express. They must use `style={{}}`. Color values in inline styles must use CSS variables:

```jsx
// Die
style={{ background: held ? 'var(--bd-sun)' : 'white', border: '2px solid var(--bd-ink)' }}

// BoardlyAvatar color map
const COLOR_MAP = {
  coral: { bg: 'var(--bd-coral)', text: 'white' },
  sun:   { bg: 'var(--bd-sun)',   text: 'var(--bd-ink)' },
  // ...
}
```

---

## SVG colors

SVG presentation attributes (`stroke`, `fill`) do **not** support `var()` directly. Use the `style` prop:

```jsx
// Wrong
<path stroke="#FF6B5B" />

// Correct
<path style={{ stroke: 'var(--bd-coral)' }} />
```

Other SVG attributes (`strokeWidth`, `strokeLinecap`, `opacity`) can stay as regular attributes.

---

## When to use rgba

`rgba()` values are allowed **only** for:
- Transparent tint overlays: `rgba(31,27,22,0.06)` (ink at 6% opacity for hover states)
- Gradient backgrounds: `radial-gradient(circle at 12% 8%, rgba(255,196,77,0.18), transparent 35%)`
- Shadow definitions in `boxShadow` Tailwind config tokens

Never use `rgba` as a replacement for a solid color that has a token.

---

## Dark mode

Dark mode is implemented via CSS variable swapping. **Do not use `dark:` Tailwind variants in any component** — the CSS variable override in `globals.css` (`html.dark { }`) handles the entire app automatically.

- `html.dark` is applied by the theme init script in `app/layout.tsx` (runs in `<head>` before paint — no flash)
- User preference is stored in `localStorage` under key `theme` (`light` | `dark` | `system`)
- `system` (default) follows `prefers-color-scheme` automatically
- Toggle UI: `ThemeToggle` (desktop header icon) and `ThemeMobilePanel` (mobile menu panel)
- Lobby premium themes (`ocean`, `midnight`, `sakura`, `neon_city`) override CSS vars at container level via `getThemePageStyle()` — they are immune to the global dark/light toggle
- Existing `dark:` classes in Header/MobileMenu are legacy and will be cleaned up when those components are redesigned

---

## Layout

Full pattern reference: [docs/RESPONSIVE.md](docs/RESPONSIVE.md) — enforced by `scripts/audit-responsive.ts` (part of `ci:quick`).

- Page-level containers: `.page-shell` (full height under the header, incl. loading/error screens) or `.page-shell-full`
- Game screens: the shared `.game-screen` family (`--game-h`); until it lands, the `.ttt-*` family in `globals.css` is the pattern to copy — never invent a new screen family
- Header offset: `var(--bd-header-h)` / `HEADER_HEIGHT_PX` (pending tokens issue) — never a raw `64px`/`4rem`
- Mobile/desktop split: one shared breakpoint (`desk:` screen / `useIsMobileViewport()`), never a raw px value
- Responsive fluid sizing: use `clamp()` for text and spacing that should respond to viewport
