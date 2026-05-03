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

Dark mode is **deferred**. Do not add `dark:` variants to new components. Existing `dark:` classes in older components (Header, MobileMenu) can stay until those components are redesigned.

---

## Layout

- Page-level containers: `page-shell` (calc height minus header) or `page-shell-full` CSS classes from `globals.css`
- Responsive fluid sizing: use `clamp()` in inline styles for text and spacing that should respond to viewport
- Game screens (tic-tac-toe etc.): grid layout defined in `globals.css` under `/* === TTT GAME SCREEN === */`
