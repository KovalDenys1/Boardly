# No-Scroll Layout Fix — Design Spec
**Date:** 2026-03-27
**Status:** Approved

## Problem

All app pages use `min-h-screen` on their outer wrapper. Because the sticky header is 64px tall, `min-h-screen` (= 100vh) + header = page always overflows the viewport → unwanted scroll on laptop/tablet screens.

## Goal

App pages (games, lobby, leaderboard, profile, auth) must fit the viewport without scroll on laptop and tablet. Content-heavy pages (guides, terms, privacy, game detail pages, landing) remain scrollable. On small screens, existing tab patterns (and `overflow-y-auto` scroll zones) handle overflow gracefully.

## Non-Goals

- Do NOT change root layout `<main>` (would move scroll container off `body`, breaking `window.scrollY` on landing page)
- Do NOT add mobile tabs to pages that don't need them
- Do NOT touch: `app/page.tsx`, `app/games/*/page.tsx`, `app/guides/*`, `app/terms`, `app/privacy`, `app/admin/*`

---

## Architecture

### Two CSS utility classes (added to `app/globals.css`)

```css
/* Pages with 64px header */
.page-shell {
  height: calc(100dvh - 64px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Auth pages — header is hidden, full viewport */
.page-shell-full {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

### Internal scroll zone pattern

Where a section of a page may have more content than fits (tables, card lists), it gets:
```
flex-1 overflow-y-auto min-h-0
```
`min-h-0` is required to make `flex-1` actually shrink inside a flex column.

---

## Page Groups

### Group 1 — Auth pages (8 pages, header hidden)
**Pages:** `login`, `register`, `forgot-password`, `reset-password`, `verify-email`, `delete-account`, `link`, `error-oauth`
**Change:** `min-h-screen flex items-center justify-center` → `page-shell-full flex items-center justify-center overflow-y-auto`
**Result:** Form is centered. If form overflows on very small screens, `overflow-y-auto` allows scroll.

### Group 2 — Games catalog (`app/games/page.tsx`)
**Change:** Outer `min-h-screen` → `page-shell`
**Layout:** breadcrumb + filter bar (fixed height) → game cards grid (`flex-1 overflow-y-auto min-h-0`)

### Group 3 — Lobby lists (3 pages)
**Pages:** `app/games/spy/lobbies`, `app/games/yahtzee/lobbies`, `app/games/rock-paper-scissors/lobbies`
**Change:** `min-h-screen` → `page-shell`
**Layout:** breadcrumb + header + action cards (fixed) → active lobbies list (`flex-1 overflow-y-auto min-h-0`)

### Group 4 — Leaderboard (`app/leaderboard/page.tsx`)
**Change:** `min-h-screen px-4 py-8` → `page-shell`
**Layout:** title + filter bar (fixed) → table (`flex-1 overflow-y-auto min-h-0`)
**Note:** Padding moves inside the flex children, not on the outer shell.

### Group 5 — Create Lobby (`app/lobby/create/page.tsx`)
**Change:** `min-h-screen` → `page-shell`
**Layout:** Already 3-column on desktop. Each column panel gets `overflow-y-auto` so it can scroll independently if content overflows. Height is already split with `md:flex`.

### Group 6 — Profile (`app/profile/page.tsx`)
**Change:** `min-h-screen` → `page-shell`
**Layout:** Tab bar (fixed height) → tab content area (`flex-1 overflow-y-auto min-h-0`)
**Note:** On mobile the profile already has a tab-like structure; the scroll zone fix ensures long tabs (stats history) scroll within their panel only.

### Group 7 — Lobby/Game room (`app/lobby/[code]/LobbyPageClient.tsx`)
**Change:** Fix `min-h-screen` only in loading/fallback states. The main game room layout already uses mobile tabs and fills the viewport — only minor height adjustments needed on the outer wrapper.

---

## Implementation Order

1. Add CSS classes to `globals.css`
2. Group 1 — Auth pages (mechanical, low risk)
3. Group 2 — Games catalog
4. Group 3 — Lobby lists
5. Group 5 — Create Lobby (needs careful audit of 3-column layout)
6. Group 4 — Leaderboard
7. Group 6 — Profile (most complex, tabs)
8. Group 7 — LobbyPageClient fallbacks

## Verification

After each group: run `npm run lint && npm run typecheck`, then manually check in browser at 1280×800 (laptop) and 768×1024 (tablet) that no page-level scrollbar appears.

Content pages (landing, guides, terms) must still scroll normally — verify after step 1 (CSS classes added) that they are unaffected.

## Branch

`fix/no-scroll-layout` branched from `develop`.
