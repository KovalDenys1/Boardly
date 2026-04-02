# No-Scroll Layout Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate unwanted page-level scroll on all app pages (games, lobby, leaderboard, profile, auth) on laptop/tablet screens while keeping content pages scrollable.

**Architecture:** Add two CSS utility classes (`page-shell`, `page-shell-full`) to globals.css. Replace `min-h-screen` with the appropriate shell class on each app page. Scrollable content zones inside pages get `flex-1 overflow-y-auto min-h-0`.

**Tech Stack:** Next.js 14, Tailwind CSS, TypeScript

---

### Task 1: CSS utilities

**Files:**
- Modify: `app/globals.css` (after line 16, after the existing `mobile-vh-100` block)

- [ ] Add `page-shell` and `page-shell-full` utility classes:

```css
/* Viewport-fit shells — prevents page-level scroll on app pages */
.page-shell {
  height: calc(100dvh - 64px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-shell-full {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@supports not (height: 100dvh) {
  .page-shell {
    height: calc(100vh - 64px);
  }
  .page-shell-full {
    height: 100vh;
  }
}
```

- [ ] Commit: `git commit -m "style: add page-shell viewport-fit utility classes"`

---

### Task 2: Auth pages (header is hidden on /auth routes)

**Files:**
- Modify: `app/auth/login/page.tsx` — Suspense fallback
- Modify: `app/auth/login/LoginForm.tsx` — main wrapper
- Modify: `app/auth/register/page.tsx` — Suspense fallback
- Modify: `app/auth/register/RegisterForm.tsx` — main wrapper
- Modify: `app/auth/forgot-password/page.tsx`
- Modify: `app/auth/reset-password/page.tsx`
- Modify: `app/auth/verify-email/page.tsx` — Suspense fallback
- Modify: `app/auth/delete-account/page.tsx` — all states
- Modify: `app/auth/link/page.tsx` — all states
- Modify: `app/auth/error-oauth/page.tsx` — all states

Pattern: replace every `min-h-screen flex items-center justify-center` (and its gradient variations) with `page-shell-full flex items-center justify-center overflow-y-auto`.

- [ ] Fix `app/auth/login/page.tsx`:
  ```tsx
  // line 10: replace min-h-screen
  <div className="page-shell-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
  ```

- [ ] Fix `app/auth/login/LoginForm.tsx` (line 128):
  ```tsx
  <div className="page-shell-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
  ```

- [ ] Fix `app/auth/register/page.tsx` (line 10):
  ```tsx
  <div className="page-shell-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
  ```

- [ ] Fix `app/auth/register/RegisterForm.tsx` (line 132):
  ```tsx
  <div className="page-shell-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
  ```

- [ ] Fix `app/auth/forgot-password/page.tsx` — both branches use `min-h-screen`:
  Replace all occurrences of `min-h-screen` with `page-shell-full`.

- [ ] Fix `app/auth/reset-password/page.tsx` — same pattern.

- [ ] Fix `app/auth/verify-email/page.tsx` — Suspense fallback on line 10.

- [ ] Fix `app/auth/delete-account/page.tsx` — 3 occurrences of `min-h-screen`.

- [ ] Fix `app/auth/link/page.tsx` — 3 occurrences of `min-h-screen`.

- [ ] Fix `app/auth/error-oauth/page.tsx` — 3 occurrences of `min-h-screen`.

- [ ] Run: `npm run ci:quick`

- [ ] Commit: `git commit -m "fix(layout): no-scroll on auth pages"`

---

### Task 3: Games catalog (`app/games/page.tsx`)

**Files:**
- Modify: `app/games/page.tsx`

The page has: loading states (2x `min-h-screen`) + main return with `min-h-screen` wrapper containing header, filters, game grid, back button, stats section.

- [ ] Fix all 3 `min-h-screen` instances. Loading states:
  ```tsx
  <div className="page-shell bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 flex items-center justify-center">
  ```

- [ ] Fix main wrapper (line 227) + make inner container `flex-1 overflow-y-auto min-h-0`:
  ```tsx
  // Outer:
  <div className="page-shell bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500">
    // Inner scrollable zone — add flex-1 overflow-y-auto min-h-0 to the max-w-7xl div:
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* header, filters, grid, back button, stats */}
      </div>
    </div>
  ```

- [ ] Run: `npm run ci:quick`

- [ ] Commit: `git commit -m "fix(layout): no-scroll on games catalog"`

---

### Task 4: Lobby list pages (spy, yahtzee, rps)

**Files:**
- Modify: `app/games/spy/lobbies/page.tsx`
- Modify: `app/games/yahtzee/lobbies/page.tsx`
- Modify: `app/games/rock-paper-scissors/lobbies/page.tsx`

All three share the same structure. The inner container uses `pt-16 sm:pt-20` which was legacy padding from when the header was fixed — remove it since header is now sticky and content starts naturally below it.

- [ ] For each page:
  1. Loading state: `min-h-screen flex items-center justify-center` → `page-shell flex items-center justify-center`
  2. Main outer wrapper: `min-h-screen bg-gradient-to-br ...` → `page-shell bg-gradient-to-br ...`
  3. Inner content container: remove `pt-16 sm:pt-20`, add `flex-1 overflow-y-auto min-h-0` wrapper around the inner div
  4. Inner div: change `py-4 sm:py-8` to `py-4 sm:py-6` (trim a bit since we removed pt-16)

Example for spy (`app/games/spy/lobbies/page.tsx`):
```tsx
// Outer wrapper:
<div className="page-shell bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500">
  <div className="flex-1 overflow-y-auto min-h-0">
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      {/* breadcrumbs, header, action cards, lobby list */}
    </div>
  </div>
</div>
```

- [ ] Run: `npm run ci:quick`

- [ ] Commit: `git commit -m "fix(layout): no-scroll on lobby list pages"`

---

### Task 5: Leaderboard (`app/leaderboard/page.tsx`)

**Files:**
- Modify: `app/leaderboard/page.tsx`

Current structure: `min-h-screen px-4 py-8 sm:py-12` → title → filters → table.

- [ ] Fix outer wrapper (line 78):
  ```tsx
  <div className="page-shell bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900">
    <div className="flex-1 overflow-y-auto min-h-0 px-4 py-6 sm:py-8">
      <div className="max-w-2xl mx-auto">
        {/* title, filters, table */}
      </div>
    </div>
  </div>
  ```

- [ ] Run: `npm run ci:quick`

- [ ] Commit: `git commit -m "fix(layout): no-scroll on leaderboard"`

---

### Task 6: Create Lobby (`app/lobby/create/page.tsx`)

**Files:**
- Modify: `app/lobby/create/page.tsx`

The main return (line 369) already uses `min-h-[calc(100dvh-64px)]` — change to `page-shell`. Loading state (line 358) and unauthenticated state use `min-h-screen`.

- [ ] Fix loading state (line 358):
  ```tsx
  <div className="page-shell flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
  ```

- [ ] Fix main wrapper (line 369):
  ```tsx
  <div className={`page-shell bg-gradient-to-br ${gameInfo.gradient}`}>
  ```

- [ ] The inner `<section>` (line 371) already has `md:h-[calc(100vh-64px)] md:items-center md:justify-center` — remove `md:h-[calc(100vh-64px)]` since the shell now handles it. On mobile, section just stacks naturally.

- [ ] Run: `npm run ci:quick`

- [ ] Commit: `git commit -m "fix(layout): no-scroll on create-lobby page"`

---

### Task 7: Profile (`app/profile/page.tsx`)

**Files:**
- Modify: `app/profile/page.tsx`

The profile has a loading state + main render. Main render has a top `pt-16 sm:pt-20 lg:px-8` container (legacy sticky-header padding) + hero section + tab bar + tab content.

- [ ] Fix loading state (line 1386):
  ```tsx
  <div className="page-shell flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
  ```

- [ ] Fix main wrapper (line 1400): change `min-h-screen ... pb-8` → `page-shell`:
  ```tsx
  <div className="page-shell bg-gradient-to-br from-slate-50 via-blue-50/60 to-indigo-100/80 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
  ```

- [ ] The inner container (line 1408) has `pt-16 sm:pt-20` — remove (header is sticky). Change to `pt-4 sm:pt-6`.

- [ ] Wrap the entire content area (after decorative blobs) in a `flex-1 overflow-y-auto min-h-0` div so the profile scrolls within its shell:
  ```tsx
  <div className="relative max-w-5xl mx-auto px-3 pt-4 sm:px-6 sm:pt-6 lg:px-8">
  ```
  Wrap this in: `<div className="flex-1 overflow-y-auto min-h-0">...</div>`

- [ ] Run: `npm run ci:quick`

- [ ] Commit: `git commit -m "fix(layout): no-scroll on profile page"`

---

### Task 8: LobbyPageClient fallbacks

**Files:**
- Modify: `app/lobby/[code]/LobbyPageClient.tsx`

Only loading/error fallback states use `min-h-screen`. Main game room layout is already well-structured.

- [ ] Find and replace all `min-h-screen` in fallback/loading states:
  ```tsx
  // loading fallback:
  <div className="page-shell flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
  // error fallback:
  <div className="page-shell flex items-center justify-center bg-slate-900">
  ```

- [ ] Run: `npm run ci:quick`

- [ ] Commit: `git commit -m "fix(layout): no-scroll on lobby-page fallbacks"`

---

### Task 9: Final verification

- [ ] Run: `npm run ci:quick && npm test`
- [ ] Verify no regressions in tests
- [ ] Open browser at localhost:3000 and spot-check: `/games`, `/leaderboard`, `/auth/login`, `/lobby/create`, `/profile`, `/` (landing must still scroll)
