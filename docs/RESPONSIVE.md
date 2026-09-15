# Responsive Layout — Pattern Reference

This document is the single source of truth for viewport/layout patterns in Boardly.
The short workflow contract lives in `CLAUDE.md` ("Responsive UI — Definition of Done");
this file holds the details. Enforced by `scripts/audit-responsive.ts` (part of
`npm run ci:quick`, therefore also pre-push and CI).

**Why this exists:** 30+ responsive bugs recurred over 5 months (#598, #600, #688,
#687, #690, #703, #724, #525, …) because every screen reinvented viewport math:
4 competing CSS shell families, header height hardcoded in 14+ places, and three
conflicting "mobile" breakpoints (767 / 899 / 1024 px) that caused the 768–1023px
double-render bug class. Tracking issue: #733.

## Tokens

| Token | Where | Status |
|---|---|---|
| `--bd-header-h` (64px) | `app/globals.css` `:root`, inside the primitives block | live (#734) |
| `HEADER_HEIGHT_PX` | `lib/responsive-tokens.ts` | live (#734) |
| `DESKTOP_MIN_WIDTH_PX` = 1024 | `lib/responsive-tokens.ts` | live (#734) |
| `MOBILE_MAX_MEDIA_QUERY` | `lib/responsive-tokens.ts` | live (#734) |
| `desk:` Tailwind screen | `tailwind.config.ts` (imported from tokens) | live (#734) |
| `useIsMobileViewport()` | `hooks/useIsMobileViewport.ts` | live (#734), consumers migrate in later phases |

**Why three carriers for one value:** CSS custom properties cannot appear inside
`@media (...)` conditions, so media queries must use a raw px literal. The audit
script (check R2) fails CI on any width media query outside
{`DESKTOP_MIN_WIDTH_PX`, `DESKTOP_MIN_WIDTH_PX − 1`} — that is what makes
"change the breakpoint in one place" honest. Legacy off-token values (767, 899,
900, homepage one-offs) live in the baseline and shrink per migration phase. The
audit also fails if `--bd-header-h` in globals.css drifts from `HEADER_HEIGHT_PX`.

## Breakpoint decision record

**Decided 2026-08-12 (#734): `DESKTOP_MIN_WIDTH_PX = 1024`.** Candidates were 900
(the game CSS threshold) and 1024 (Tailwind `lg`, MobileTabs). Playwright sweep of
the in-game Tic-Tac-Toe screen:

- 768×1024 (iPad portrait) → mobile-tabs layout, comfortable.
- 900×1024 (tall) → desktop layout fits, but only because of the generous height.
- **900×390 (phone landscape, the decisive case)** → desktop layout is broken:
  the board is pushed out of the viewport and the post-game overlay buttons are
  clipped. Real phones in landscape are ~850–930px wide — a 900 breakpoint gives
  them this broken desktop layout; 1024 gives them the mobile layout, which is
  designed for constrained heights.
- 1024×700 → desktop layout fits.

Secondary reasons: 1024 equals the `lg:` threshold that `MobileTabs` /
`MobileTabPanel` / `LobbyPageClient` already use (smallest migration), and iPad
portrait/landscape land on the same side under both candidates. Cost: 900–1023px
windows lose the desktop side panels and get the mobile-tabs layout — acceptable,
it is fully functional. The value lives in one token; reversing the decision is a
one-line change plus audit-guided CSS fixes.

## Phone landscape

**Decided 2026-08-16 (#749).** Within mobile widths, orientation picks the layout:
portrait gets the stacked mobile layout, landscape gets side-by-side panes. The
condition is `(max-width: 1023px) and (orientation: landscape)`
(`PHONE_LANDSCAPE_MEDIA_QUERY` in `lib/responsive-tokens.ts`) — the width literal
stays on the shared breakpoint, so R2 stays clean.

Rationale: a phone in landscape is ~330–430px tall; the portrait stack
(header → status → tabs → content) cannot fit and the height-locked shells clip.
Boards are container-sized, so the tree needs zero sizing math.

**One family, `.game-landscape-*` (#901).** `.game-landscape-layout` is the
board pane left at full height with `.game-landscape-side`, a
`min(300px, 42vw)` chrome column, on the right. Tic-Tac-Toe, Connect Four and
RPS shared a `.ttt-landscape-*` copy of these rules while Memory and Yahtzee
carried their own, so a fix had to be found three times – and was not: chat's
missing height floor survived both #749 and #751. Per-game deltas (Memory's
relative board pane, Yahtzee's padding and hidden status bar) keep their own
prefixed rules; everything true of every game lives in the shared family.

**What that column may hold.** It has ~326px of height at 844×390, less than
desktop-density chrome needs, so the shared family also carries the compact
forms: `.game-chat-panel` has a `min-height` floor and drops its title strip
and send hint, `GameScoreboardHeader` swaps its centre block for the
`centerCompact` one the game supplies, and `GamePlayerCard` loses its subline
and turn line – both are already on screen in `GameStatusBanner` directly
below. The column scrolls (`overflow-y: auto`) as a last resort rather than
clipping a control out of existence.

**Geometry belongs in the stylesheet.** `GameScoreboardHeader` and
`GamePlayerCard` used to carry their sizes in a `style` prop, which outranks
every stylesheet rule – no breakpoint could touch them. Shared in-game chrome
that a breakpoint must be able to resize keeps its geometry in `globals.css`
and only its state-dependent colours inline.

**Scrollable game surfaces still scroll**, but a screen whose primary control
is off the bottom is not usable: Spy and Alias each now have a landscape branch
that collapses their hero chrome (#901). Sketch and Liar's Party are untouched
and unverified at this viewport.

The contract is pinned by `__tests__/app/phone-landscape-layout.test.ts`.

## Primitive catalog

| Primitive | Use for | Status |
|---|---|---|
| `.page-shell` | Full-height app page under the header (incl. loading/error/fallback screens) | exists (`globals.css`) |
| `.page-shell-full` | Full-height page without the header | exists |
| `.game-screen` family (`--game-h`) | In-game screen: board + chrome, mobile tabs + desktop grid | live (#745) — pair with a per-game skin class (`.ttt-screen`) |
| `MobileTabs` / `MobileTabPanel` | Mobile in-game navigation (`app/lobby/[code]/components/`) | exists |
| Height-aware cell sizing idiom | Any multi-row board | exists (see below) |

Rules that apply to all of them:

- **The shell uses `height`, never `position: fixed` with a hardcoded `top`.**
  The fixed variant (legacy `.memory-screen`) interacts worst with iOS Safari's
  address-bar show/hide, which changes the resolved `100dvh` at runtime.
- **Always pair `100dvh` with an `@supports` fallback** to `100vh`
  (see `.page-shell` in `globals.css` for the canonical form).
- **Never size a multi-row grid/board from `100vw` alone.** Any board taller than
  one row needs its cell size to be the `min()` of a width-derived AND a
  height-derived value:
  `--cell: min(calc((100vw - <side chrome>px) / cols), calc((var(--game-h) - <vertical chrome>px) / rows))`
  Width-only sizing is blind to vertical space and produces a board silently
  clipped by `overflow: hidden` (bug #688). Working examples: `--c4-cell` and
  `.ttt-board-wrap` in `globals.css`.
- Desktop board cards may use container queries (`container-type: size` + `cqh`) —
  already the pattern in `.ttt-board-card` and the memory grid.
- One screen family. Do not add a new `--<game>-h` variable or `.<game>-screen`
  clone (audit check R7); extend the shared family instead.

## Surface → primitive

| Surface | Primitive |
|---|---|
| Regular page (lists, profile, auth, lobby browser) | `.page-shell` |
| Loading / error / fallback screen | `.page-shell` (same as the page it replaces) |
| In-game screen (any game) | `.game-screen` (+ per-game skin; layout family: `.ttt-*` for board games) |
| In-game mobile navigation | `MobileTabs` + `MobileTabPanel` |
| Header offset in any calc | `var(--bd-header-h)` / `HEADER_HEIGHT_PX` |
| Mobile/desktop conditional in TSX | `useIsMobileViewport()` — never raw `matchMedia('(max-width: Npx)')` |
| Mobile/desktop conditional in classes | `desk:` screen (until it lands: `lg:`) |

## Anti-patterns (audit checks)

Regenerate the baseline after removing legacy violations:
`npx tsx scripts/audit-responsive.ts --update-baseline`.
Point opt-out for a justified exception: a comment containing
`responsive-audit-allow(R2): reason` on the offending line or the line above.

### R1 — raw header-offset viewport math
`calc(100dvh - 64px)` / `calc(100vh - 4rem)` outside the primitives block in
`globals.css`. **Fix:** use `.page-shell` / `.game-screen`, or `var(--bd-header-h)`
inside the primitives block only.

### R2 — width media query off-token
A `(min|max)-width: Npx` media query (or Tailwind `min-[Npx]:`/`max-[Npx]:` variant)
with a value outside the allowed breakpoint set. **Fix:** use the `desk:` screen or
restructure so the shared breakpoint works.

### R3 — hardcoded width in matchMedia()
`window.matchMedia('(max-width: 767px)')` and friends. **Fix:** `useIsMobileViewport()`
/ `MOBILE_MAX_MEDIA_QUERY`. Non-width queries (reduced-motion, display-mode,
color-scheme) are not flagged.

### R4 — position:fixed with hardcoded header offset
`position: fixed` combined with `top: 64px`/`4rem`. **Fix:** a shell primitive with
`height` (see catalog rules).

### R5 — inline viewport-height calc in TSX
`style={{ height: 'calc(100dvh - 200px)' }}` etc. (the header-offset case is R1).
**Fix:** a primitive class, or derive from `--game-h`.

### R6 — width-only board sizing
A `width:`/`--*cell*:` declaration using `100vw` without `min()` and a height
variable. **Fix:** the height-aware cell sizing idiom above.

### R7 — new screen-family variable
A new `--*-h: calc(100dvh …)` outside the primitives block. **Fix:** use the shared
`.game-screen` family.

## Compact mobile patterns

Budget vertical space deliberately in mobile game views — prefer one thin,
always-shrinkable region (the board/scorecard) surrounded by as few
`flex-shrink-0` chrome blocks as possible. Before adding a new status banner/card,
check whether the info already exists on screen (Yahtzee once had a "Your Turn"
banner duplicating both the Next Move card and the timer's color-coding). Reuse:

- **Compact multi-stat header row:** `MemoryGameBoard.tsx`'s `.memory-mobile-header`
  (`globals.css`) — 24px avatars, `padding: 4px 8px`, `font-size: 10–11px`.
- **Collapse-on-tap for secondary info:** `WaitingRoomActions.tsx`'s `useState`
  toggle + rotating-chevron button idiom.
- **Horizontal scroll instead of wrap** for a chip/pill row on narrow screens:
  `LobbyInfo.tsx`'s `overflow-x-auto` rail. No scrollbar-hiding utility exists in
  this codebase — don't add one; the native thin scrollbar is the accepted look.

## Verification procedure

Every UI change, before it is "done":

1. `npm run ci:quick` — includes this audit.
2. **Playwright MCP screenshot sweep** of every touched route at widths
   **320, 390, 768, 1280** (resize → screenshot each). For in-game screens, reach
   a real game state via bot quick-play (every game supports bots; for bot-less
   games use the curl + join-guest API approach). When a change touches the
   mobile/desktop switch, also check `DESKTOP_MIN_WIDTH_PX − 1` and
   `DESKTOP_MIN_WIDTH_PX`: exactly one of desktop-grid / mobile-tabs may render.
3. **Real-device gate** for game-board or mobile fixes: emulated viewports do not
   reproduce iOS Safari's address-bar animation, which changes the resolved
   `100dvh` at runtime — this is only observable on a physical phone (use the
   Vercel preview deployment). If you cannot verify on a real device, say so
   explicitly instead of claiming the fix works.
4. Shell primitives are pinned by className-contract Jest tests (pattern:
   `__tests__/app/lobby-page-fallbacks.test.tsx`) — extend them when adding a
   surface, don't delete them.

## Migration status

| Area | Shell today | Target | Issue |
|---|---|---|---|
| Rule + audit + baseline | — | this document | #733 ✅ |
| Tokens + breakpoint decision | 64px hardcoded ×14, three breakpoints | `--bd-header-h`, `responsive-tokens.ts`, `desk:` = 1024 | #734 ✅ |
| Tic-Tac-Toe + Connect Four | `.game-screen` + `.ttt-*` on `--game-h`, breakpoint 1024 | done | #745 ✅ |
| Memory | fills the in-game container, `--game-h` | done | #746 ✅ |
| LobbyPageClient (Yahtzee/Alias/Spy/Sketch/RPS) | `.game-screen`, `desk:`, no scroll-lock | done | #747 ✅ |
| Spy CSS, Liar's Party, spectate, fallbacks, remaining raw calcs | `var(--game-h)` everywhere | done | #748 ✅ |
| Phone-landscape family + Spy/Alias branches | three copied trees, no Spy/Alias branch | one `.game-landscape-*` family | #901 #902 ✅ |
| Homepage one-off breakpoints (639/720/1059/1060/1120) | ad-hoc | optional, low priority | planned |
