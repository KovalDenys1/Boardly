# Play App Consumption-Only Implementation Plan (#1465)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When boardly.online runs inside the Google Play app (a Trusted Web Activity), no purchase or billing path exists, and the web stays unchanged.

**Architecture:** An inline `<head>` script, next to the theme init script, decides once per tab whether this is the Play app. It records the result in sessionStorage and on `<html data-app-shell="play">`, and strips the launch parameters from the URL before first paint. A global CSS rule hides every `[data-purchase-ui]` element under that attribute, so nothing flashes. After hydration, `useIsPlayApp()` (a `useSyncExternalStore` hook with a `false` server snapshot) removes those elements from the tree and shows an informational notice where a purchase control was. Server rendering and static prerendering are untouched.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Jest + Testing Library (jsdom).

**Spec:** GitHub issue #1465. Policy background is in the vault note `03 Projects/Boardly/Android Play Research 2026-10-18.md`.

## Global Constraints

- TWA package name: `online.boardly.app`. Launch parameters: `utm_source=android_app` together with `utm_medium=twa`.
- The flag is kept only in **sessionStorage**, under key `boardly:app-shell` with value `play`. Never use localStorage or a cookie: the TWA shares storage with Chrome on the same phone.
- Attribute: `data-app-shell="play"` on `document.documentElement`. Marker for gated UI: `data-purchase-ui`.
- Signup source in the app: `utm:android_app/twa`.
- Every user-visible string goes through `t()`, with keys in `locales/en.ts`, `no.ts`, `uk.ts` and `ru.ts`. Never use a fallback string.
- The notice text must carry no link and no price: "Premium can be bought on boardly.online in your browser." Google Play's FAQ allows exactly this kind of linkless pointer.
- Guide routes must stay `○` (static) in `next build`.
- Tests run with `npx jest <paths>`; the full suite runs once at the end with `pnpm test`. Only one `tsc` runs at a time.

## Review Focus

1. **Hydration.** The server renders the web version and the client in the app knows it is the Play app. The hook must use `useSyncExternalStore` with `getServerSnapshot = () => false`, so hydration matches and React re-renders afterwards. Test: render with the attribute set and check that no hydration warning is logged (Task 2).
2. **Deep link with no parameter.** An invite link opened from WhatsApp starts the app without `start_url`. The referrer rule `android-app://online.boardly.app` covers it, and a referrer from any other package must not count (Task 1 tests). The real behaviour is checked on the emulator in #1467.
3. **Client-side navigation inside the app.** `/` → `/premium` via `next/link` must still be the Play app. The attribute lives on `<html>`, which the App Router never replaces. Test: the hook reads the attribute, not the URL (Task 2).
4. **The strip must not eat other parameters.** For `/?quick=1&utm_source=android_app&utm_medium=twa`, only the pair goes and `?quick=1` stays. A lone `utm_source=android_app` is not stripped and does not count (Task 1).
5. **Storage that throws.** In private modes or with blocked storage, the init script must not break the page. The current page then still counts as the Play app (Task 1).

---

### Task 1: Detection core and head script

**Files:**
- Create: `lib/app-shell.ts`
- Modify: `app/layout.tsx` (add a `<script>` next to `themeInitScript`, around line 243)
- Modify: `app/globals.css` (one rule)
- Test: `__tests__/lib/app-shell.test.ts`

**Interfaces:**
- Produces:
  - `PLAY_APP_PACKAGE = 'online.boardly.app'`
  - `APP_SHELL_STORAGE_KEY = 'boardly:app-shell'`
  - `PLAY_APP_SIGNUP_SOURCE = 'utm:android_app/twa'`
  - `detectPlayLaunch(input: { search: string; referrer: string; stored: string | null }): boolean`
  - `stripPlayLaunchParams(search: string): string`, which returns `''` or `'?…'`
  - `getAppShellInitScript(): string`
  - `isPlayApp(root?: HTMLElement): boolean`, which reads `data-app-shell === 'play'` and returns false on the server

- [ ] **Step 1: Write failing tests** in `__tests__/lib/app-shell.test.ts`:
  - `detectPlayLaunch({search:'?utm_source=android_app&utm_medium=twa', referrer:'', stored:null})` → `true`
  - `detectPlayLaunch({search:'?utm_source=android_app', referrer:'', stored:null})` → `false`
  - `detectPlayLaunch({search:'', referrer:'android-app://online.boardly.app/', stored:null})` → `true`
  - `detectPlayLaunch({search:'', referrer:'android-app://com.whatsapp/', stored:null})` → `false`
  - `detectPlayLaunch({search:'', referrer:'android-app://online.boardly.app.evil/', stored:null})` → `false` (the package must match exactly, then `/` or end)
  - `detectPlayLaunch({search:'', referrer:'', stored:'play'})` → `true`
  - `stripPlayLaunchParams('?quick=1&utm_source=android_app&utm_medium=twa')` → `'?quick=1'`
  - `stripPlayLaunchParams('?utm_source=android_app&utm_medium=twa')` → `''`
  - `stripPlayLaunchParams('?utm_source=newsletter&utm_medium=email')` → unchanged
  - Init script, Play launch: set jsdom URL to `/?utm_source=android_app&utm_medium=twa`, run `new Function(getAppShellInitScript())()`, then expect `document.documentElement.dataset.appShell === 'play'`, `sessionStorage['boardly:app-shell'] === 'play'` and `location.search === ''`.
  - Init script, plain web: no attribute, sessionStorage untouched, URL untouched.
  - Init script, `sessionStorage.setItem` throws: the attribute is still set and nothing throws.
  - `isPlayApp()` is true only with the attribute set.

- [ ] **Step 2: Run** `npx jest __tests__/lib/app-shell.test.ts`. Expected: FAIL, because the module is missing.

- [ ] **Step 3: Implement `lib/app-shell.ts`.** The init script follows `getThemeInitScript()` in `lib/theme.ts`: an IIFE string wrapped in try/catch, interpolating the constants. It does the same as `detectPlayLaunch` and `stripPlayLaunchParams`, plus `history.replaceState(history.state, '', pathname + stripped + hash)`. The tests above run it, so the string and the functions cannot drift apart.

- [ ] **Step 4: Wire it up.**
  - `app/layout.tsx`: add `<script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: appShellInitScript }} />` directly after the theme script. `<html>` already has `suppressHydrationWarning`, which covers the added attribute.
  - `app/globals.css`: add `html[data-app-shell='play'] [data-purchase-ui] { display: none !important; }`.

- [ ] **Step 5: Run** `npx jest __tests__/lib/app-shell.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit** with `#1465 feat: detect the Play app once per tab before first paint`.

### Task 2: `useIsPlayApp`, `PurchaseOnly`, `PlayAppOnly`

**Files:**
- Create: `hooks/useIsPlayApp.ts`
- Create: `components/PurchaseOnly.tsx`, which exports `PurchaseOnly` and `PlayAppOnly`
- Test: `__tests__/components/purchase-only.test.tsx`

**Interfaces:**
- Consumes: `isPlayApp()` from Task 1.
- Produces:
  - `useIsPlayApp(): boolean`, built on `useSyncExternalStore(subscribeNoop, () => isPlayApp(), () => false)`.
  - `<PurchaseOnly>{children}</PurchaseOnly>`: renders `<span data-purchase-ui className="contents">{children}</span>` on the web and `null` in the app.
  - `<PlayAppOnly>{children}</PlayAppOnly>`: renders children only in the app.

- [ ] **Step 1: Write failing tests:**
  - `PurchaseOnly` renders its child and the wrapper carries `data-purchase-ui` when the attribute is absent.
  - It renders nothing when `document.documentElement.dataset.appShell = 'play'`.
  - `PlayAppOnly` is the inverse.
  - Hydration: `hydrateRoot` on server markup from `renderToString` (the server snapshot is false) with the attribute set on the client. Expect no `console.error` and the child gone after `act()`.
  - Clean the attribute up in `afterEach`.
- [ ] **Step 2: Run** `npx jest __tests__/components/purchase-only.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement both files.** Both components are `'use client'`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with `#1465 feat: PurchaseOnly and PlayAppOnly wrappers`.

### Task 3: Gate every purchase path and add the notice

**Files (lines from the 2026-10-18 code map; re-locate before editing):**
- Modify: `app/premium/PremiumContent.tsx`:
  - hero and closing CTAs (`HERO_CTA` / `CLOSING_CTA`, around 25–26 and wherever they render);
  - the signed-out login-to-buy link (around 159);
  - add `<PlayAppOnly>` with the notice where the CTAs were;
  - `startCheckout` returns early when `isPlayApp()` is true, as a second guard.
- Modify: `components/Footer.tsx:137`. In the app, skip the `/premium` entry: filter the link list with `useIsPlayApp()`, and wrap the rendered item so the CSS hides it before hydration.
- Modify: `app/profile/page.tsx`:
  - the free-user CTA (around 3017);
  - Manage billing (around 2950 and 2958);
  - reactivate (around 453 and wherever it renders);
  - the avatar-unlock route to `/premium` (around 2197);
  - show the notice in the Premium tab in place of the free-user CTA. Cancel stays, because it is not a payment.
- Modify: `components/AvatarPicker.tsx:209-216` (the "Get Premium" button).
- Modify: `components/GameHistory.tsx:370` (the `moreWithPremium` link).
- Modify: `app/withdrawal/WithdrawalContent.tsx:196` (the `/premium` link).
- Modify: `components/InstallPrompt.tsx`: return `null` when `useIsPlayApp()` is true.
- Modify: `locales/en.ts`, `no.ts`, `uk.ts`, `ru.ts`: add `premium.playAppNotice`:
  - en: "Premium can be bought on boardly.online in your browser."
  - no: "Premium kan kjøpes på boardly.online i nettleseren."
  - uk: "Premium можна придбати на boardly.online у браузері."
  - ru: "Premium можно купить на boardly.online в браузере."
- Test: extend `__tests__/app/premium-page.test.tsx`, `__tests__/app/profile-page.test.tsx`, `__tests__/app/withdrawal-page.test.tsx`, `__tests__/components/footer.test.tsx` and `__tests__/components/game-history.test.tsx`; create `__tests__/components/avatar-picker-play-app.test.tsx` and `__tests__/components/install-prompt-play-app.test.tsx`.

**Interfaces:**
- Consumes: `PurchaseOnly`, `PlayAppOnly`, `useIsPlayApp` (Task 2) and `isPlayApp` (Task 1).

- [ ] **Step 1: Write failing tests.** For each surface, one case with the attribute set and one without:
  - premium page: no CTA button, and the notice text is shown in the app;
  - profile Premium tab, free user: no buy CTA, notice shown;
  - profile Premium tab, premium user: no "Manage billing" and no reactivate control, while the status and the cancel control remain;
  - footer: no `/premium` href;
  - game history: no `/profile?tab=premium` link;
  - withdrawal page: no `/premium` href;
  - avatar picker: no "Get Premium" button;
  - install prompt: renders nothing even after a `beforeinstallprompt` event.
- [ ] **Step 2: Run** the listed test files. Expected: the new cases FAIL.
- [ ] **Step 3: Wrap each control, add the notice and the locale key.**
- [ ] **Step 4: Run** the listed test files. Expected: PASS. Also run `npx jest __tests__/locales` or the existing parity test, whichever exists.
- [ ] **Step 5: Commit** with `#1465 feat: no purchase path inside the Play app`.

### Task 4: Attribution and full verification

**Files:**
- Modify: `lib/signup-source-client.ts`. `captureSignupSource()` returns `PLAY_APP_SIGNUP_SOURCE` when `isPlayApp()` is true. The init script strips the UTM pair before first paint, so it cannot be read from `location`.
- Test: `__tests__/lib/signup-attribution.test.ts`, or a new `__tests__/lib/signup-source-client.test.ts` if the existing file only covers the server-side derive.

- [ ] **Step 1: Failing test.** With the attribute set and a cleared cache, `captureSignupSource()` returns `'utm:android_app/twa'`. Without the attribute, behaviour is unchanged.
- [ ] **Step 2: Implement it, then run the test.** Expected: PASS.
- [ ] **Step 3: Run** `npm run ci:quick`. Expected: exit 0, with no growth in the responsive baseline.
- [ ] **Step 4: Run** `nice -n 10 npm run build`. Expected: success, and the `/guides/*` rows still show `○`.
- [ ] **Step 5: Run the Playwright MCP check against `pnpm dev`:**
  - open `/?utm_source=android_app&utm_medium=twa` at 390 px;
  - the address bar ends at `/` and `<html data-app-shell="play">` is set;
  - navigate with in-app links to `/premium`, `/profile?tab=premium` and the footer: no buy control anywhere, and the notice is shown;
  - a fresh context on `/premium` without the parameter shows the CTAs;
  - take screenshots of both states.
- [ ] **Step 6: Commit** with `#1465 feat: attribute Play app signups`.
