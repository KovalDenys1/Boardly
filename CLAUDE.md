# Claude — Boardly Project Context

## Sprint Process

**Cadence:** 1 week (Mon–Sun). No gaps — every week has a sprint.

**Monday planning (5-10 min):**
1. Pick 3-5 issues from Backlog → label `sprint: current`
2. Update `Boardly.md` → "Current Sprint" section
3. Update `05 Planned.md` → "This Week" with Boardly priorities

**Sunday review:**
1. Check what merged to develop → remove `sprint: current` label, add `sprint: next` for carry-overs
2. Update `Boardly.md` sprint section

**Issue → branch → PR flow:**
1. Issue must exist before writing code
2. Create branch: `feature/<issue-number>-short-description` or `fix/<issue-number>-description`
3. Commit: `#<issue-number> feat/fix/chore: description`
4. PR → `develop`, title: `#<issue> type: description`

**Labels to use on every issue:**
- Priority: `priority:critical` / `priority:high` / `priority:medium` / `priority:low`
- Size: `size: XS` (<1h) / `size: S` (1-3h) / `size: M` (3-8h) / `size: L` (>8h, split it)
- Category: `type:feature` / `type:bug` / `type:game` / etc.
- Sprint: `sprint: current` / `sprint: next`

---

## Branching strategy
- **Size decides whether there is a branch at all.** XS/S fixes and small features commit
  straight to `develop`; a branch adds friction and buys nothing for a quick fix. M/L work,
  or anything spanning more than one session, gets a `feature/*` or `fix/*` branch and a PR.
- **GitHub agrees with that now.** `develop` used to require a pull request with
  `enforce_admins` off, so every direct commit went through and printed
  `Bypassed rule violations` — a rule obeyed by nobody, training the eye to skim past a
  warning that will one day be a real one. The requirement was removed on 2026-09-07; force
  pushes and branch deletion are still blocked. **`main` is untouched and is the real
  barrier**: pull request required, `enforce_admins: true` so it binds the owner too,
  required status checks, no force pushes, no deletions.
- `develop` — integration branch, all feature PRs merge here first
- `main` — production, only merges from `develop` via PR
- `release/vX.Y.Z` — release branch (develop → main PR)
- `hotfix/description` — critical prod fix, merges directly to main + develop

## Rules for merging to main
**NEVER open a PR develop → main unless ALL of the following are true:**
1. All GitHub Actions checks on the `develop` branch are green (CI passes)
2. Full test suite passes: `pnpm test` shows 0 failures
3. No unresolved review comments on the PR
4. Vercel preview build for the PR has deployed successfully

**Before opening the PR, verify:**
```bash
pnpm test          # must be 0 failures
npm run ci:quick   # lint + typecheck + arch audit
```

Check GitHub Actions for the develop branch — all checks must be green before creating the PR. If any check is red, fix it first, then open the PR.

## Migrations
- `prisma migrate deploy` is NOT part of the Vercel build (it hangs cross-region)
- Migrations run automatically via GitHub Actions when `prisma/migrations/` changes on develop (workflow: `.github/workflows/migrate.yml`)
- To run manually: `npm run db:migrate`
- **Consequence: a merge to `develop` puts the schema on production while the code stays on `main`.**
  The new table exists and nothing writes to it until the release. So a feature is not live when its
  migration is green — check `git log origin/main..origin/develop` before reporting it as live, and
  before concluding that a table which is empty is broken.

## Git hooks
- `pre-commit`: runs `git --no-pager diff --cached --check` + locale parity check
- `pre-push`: blocks direct push to main, runs db:generate + ci:quick + smoke tests

## Release Process

**Versioning: SemVer** — `vMAJOR.MINOR.PATCH`
- PATCH: bug fixes only
- MINOR: new features, new games
- MAJOR: breaking DB/auth changes

**To cut a release:**
```bash
git checkout develop && git pull
git checkout -b release/vX.Y.Z
gh pr create --base main --title "Release vX.Y.Z"
# After merge:
gh release create vX.Y.Z --generate-notes --title "Boardly vX.Y.Z"
```

Release notes are auto-drafted by `.github/workflows/release-drafter.yml` based on PR labels.

---

## Plans, costs and accounts: read the vault before answering

Any question about hosting, a paid plan, a subscription, credits, what something costs or
whether to move to another provider: read `03 Projects/Boardly/Boardly.md` and
`02 Areas/Finance.md` in the vault **before** answering. This file is not the record of
account state – it goes stale (on 2026-09-23 it still said "Hobby" five days after Vercel Pro
was paid for, and a hosting recommendation was built on that). When this file and the vault
disagree, the vault's newer dated entry wins; fix this file in the same session.

## Stack
- Next.js 16, React 19, TypeScript, Tailwind CSS
- PostgreSQL via Supabase, Prisma 7
- Auth: NextAuth, Supabase Realtime (Broadcast + Postgres Changes)
- Deployed on Vercel (iad1 / US East)

## Responsive UI — Definition of Done (details: docs/RESPONSIVE.md)

Any change touching layout, a game board, or an in-game view is NOT done until all of:

1. **Uses a shared primitive, never ad-hoc viewport math:**
   - Full-height app page under the header → `.page-shell`
   - Full-height page without header → `.page-shell-full`
   - In-game screen (board + chrome) → `.game-screen` family (`--game-h`); until it
     lands, copy the `.ttt-*` family — never invent a new one
   - Mobile in-game navigation → `MobileTabs` / `MobileTabPanel`
   - Header offset → `var(--bd-header-h)` / `HEADER_HEIGHT_PX` (pending tokens issue)
   - Mobile/desktop split → the shared breakpoint (`desk:` screen,
     `MOBILE_MAX_MEDIA_QUERY`, `useIsMobileViewport()`) — never a raw px value
2. **`npm run ci:quick` passes** — includes `scripts/audit-responsive.ts` (checks
   R1–R7: raw `calc(100dvh - 64px)`, off-token media queries/matchMedia,
   `position:fixed` + hardcoded top, inline vh calc in TSX, width-only board
   sizing, new `--*-h` screen families). Legacy debt lives in
   `scripts/responsive-audit-baseline.json` — migrations must shrink it, new code
   must never grow it.
3. **Playwright MCP screenshot sweep** of every touched route at 320 / 390 / 768 /
   1280 px width (docs/RESPONSIVE.md#verification-procedure covers reaching
   in-game states and breakpoint-boundary checks).
4. **Game-board or mobile fixes: real-device check is the final gate** — emulated
   viewports do not reproduce iOS Safari address-bar dvh behavior. If you cannot
   verify on a real device, say so explicitly instead of claiming the fix works.
   Why this is a rule and not advice: in #688 Connect Four's bottom row was cropped
   on a real iPhone after an emulated-viewport audit had called the game clean.
5. **One flexible content region, as few `flex-shrink-0` blocks around it as
   possible.** Before adding a banner, check whether the same signal is already
   shown elsewhere on the screen, and reuse a compact pattern that exists in this
   codebase rather than inventing one: `MemoryGameBoard.tsx`'s chip header,
   `WaitingRoomActions.tsx`'s collapse-on-tap toggle, `LobbyInfo.tsx`'s
   horizontal-scroll pill rail. Yahtzee's mobile Game/Score tabs once stacked six
   never-shrink blocks — status bar, timer, Next Move card, a redundant turn banner,
   Roll button, bottom nav — leaving almost no room for the dice and scorecard.
6. **Cell sizing takes `min()` of a width-derived and a height-derived size.** A
   multi-row board sized purely from `100vw` can come out taller than the usable
   viewport and be silently clipped (#688 again).

## In-game layout — Definition of Done (rule from 2026-09-06)

Every in-game screen must look **finished at every viewport** (320 / 390 / 768 / 1280,
plus 844×390 landscape). Check before calling it done:

1. **No empty regions.** No card with small content floating in it, no column with a
   gap under its last card, no button row with a single button. Boards size to their
   card with container units (`.ttt-board-card` is `container-type: size`); when a
   panel is hidden (chat in bot games) its space is taken by something useful – the
   history card stretched (`.ttt-history-card--fill`), a rules strip.
2. **Shared controls in the same place in every game**, current and future:
   - Leave: top-right, in the `trailing` slot of `GameScoreboardHeader`, via
     `components/game-chrome/GameLeaveButton`; spectators get "Back to lobby" there.
   - Whose turn / status: `GameStatusBanner` directly under the header.
   - Chat: right column on desktop, `GameTabs` tab on mobile.
   - Result: `GameResultOverlay` over the board.
   Exceptions only where a game genuinely needs a different UI, and they are
   written down in the game's ticket.
3. **Every state change moves (Denys, 2026-09-24).** A game with instant state swaps is not
   done: the player loses focus and cannot see what happened. Denys's example: a Checkers
   opponent's move landed instantly, when an animation would have shown the eye who moved
   and where. Required in every game:
   - **The opponent's or bot's move arriving over realtime travels on screen,** from where
     it started to where it landed. It is never swapped in.
   - **Other changes:**
     - captures and removals fade or scale out;
     - dice roll;
     - cards flip;
     - the turn and score change with a visible cue.
   - **A last-move highlight** stays until the next move.
   - **Rules for the motion itself:**
     - `transform` and `opacity` only (see "Animations — never animate height");
     - roughly 200–450 ms;
     - `prefers-reduced-motion` respected;
     - a `lib/sounds` cue alongside, where one exists.

## Adding a new game — checklist

### Code
- [ ] `lib/games/<game>-game.ts` — game engine extending `GameEngine`
- [ ] `lib/bots/<game>/` — bot + bot-executor (if bot support needed)
- [ ] `lib/bots/core/bot-factory.ts` — add `case '<game>'` to `createBot()` and `executeBotTurn()`
- [ ] `lib/bots/index.ts` — re-export new bot classes
- [ ] `lib/game-registry.ts` — add to `RegisteredGameType` union + `REGISTRY` object
- [ ] `lib/restore-game-engine-client.ts` — add to `CLIENT_RESTORABLE_GAME_TYPES` + switch case
- [ ] `lib/bot-profiles.ts` — add bot display names for easy/medium/hard
- [ ] `lib/analytics.ts` — add to `AnalyticsGameType` union + `source` type if using dedicated lobby page

### Catalog & routing
- [ ] `lib/game-catalog.ts` — add entry to `FEATURED_GAME_CATALOG` with `availability`, `lobbyCreateConfig` (auto-covers create page)
- [ ] `lib/public-game-access.ts` — add to `GAME_LOBBIES_ROUTES`
- [ ] `lib/lobby-page-routing.ts` — add to `DedicatedLobbyPageGameType` + `DEDICATED_LOBBY_PAGE_GAME_TYPES`
- [ ] `components/GameIcon.tsx` — add the game's glyph to `GAME_GLYPHS` under its catalog `id` (48-grid, `currentColor` + `--gi-detail`, see DESIGN.md "Icons"); check it on `/dev/icons`. Never an emoji — `npm run audit:emoji` blocks it

### Database
- [ ] `prisma/schema.prisma` — add value to `GameType` enum
- [ ] Create migration: add file to `prisma/migrations/<timestamp>_add_<game>_game_type/migration.sql` with `ALTER TYPE "GameType" ADD VALUE '<game>';`
- [ ] Run `npx prisma generate` then `npm run db:migrate`

### Pages & UI
- [ ] **Layout DoD above: Leave in the header trailing slot, no empty regions at 320 / 390 / 768 / 1280.**
- [ ] **Motion DoD above (item 3):**
  - the opponent's and bot's moves animate from their origin to their destination;
  - captures, rolls, flips, turn and score changes move;
  - there is a last-move highlight;
  - `prefers-reduced-motion` is honoured.

  Verify by watching a bot game, not only by reading code.
- [ ] **In-game chrome comes from the shared kit — never re-implement it.**
      Compose `components/game-chrome/` (`GameResultOverlay`, `GamePlayerCard`,
      `GameScoreboardHeader`, `GameStatusBanner`, `GameTabs`) plus
      `components/Chat.tsx` via `useLobbyChat`/`useLobbyChatHistory` (#736).
      Game-specific identity goes through their props (accent colors, icon
      slots, pre-translated titles) — a hand-rolled player card, result
      overlay, status banner, tab strip, or chat in a game page is a review
      blocker.
- [ ] `app/games/<game>/page.tsx` — detail page with SEO metadata + JSON-LD
- [ ] `app/games/<game>/ConnectFourDetailContent.tsx` (or similar) — client content component
- [ ] `app/games/<game>/lobbies/page.tsx` — lobbies list page (use `GameLobbiesPage`)
- [ ] `app/lobby/[code]/<game>-page.tsx` — full game UI (dedicated lobby page)
- [ ] `app/lobby/[code]/LobbyPageClient.tsx` — add dynamic import + route check
- [ ] `components/HomePage/GameRibbon.tsx` – add to `translatedDetails` and `getIllustration`; the accent colour and the detail href are derived from the catalog entry, so there is nothing else to add

### Locales
- [ ] `locales/en.ts`, `ru.ts`, `no.ts`, `uk.ts` — add complete `games.<game>` namespace (parity enforced by pre-commit hook)

### Verify
```bash
npx tsc --noEmit   # must be clean
pnpm test          # must be 0 failures
npm run ci:quick   # lint + typecheck + arch audit
```

---

## This is a 16 GB laptop Denys is using at the same time

The machine is an M2 Pro: 12 cores but only 16 GB, and Chrome, Obsidian and
Discord are always resident. Memory is the limit, not cores, and when it is
exceeded macOS swaps and the whole desktop stutters — his editor, not just the
build. On 2026-09-18 five agents each ran `npx jest` and `npx tsc --noEmit` at
once: 55 jest workers plus five typecheckers, load average 15 on 12 cores, and
he could not use the Mac.

- **`pnpm test` / `npm test`, never a bare `npx jest`.** The script passes
  `--runInBand` (one process). A bare `npx jest` used to spawn one worker per
  core bar one; `jest.config.js` now caps it at 3, but the script is still the
  right call. `npm run test:fast` is the unconstrained one, for an idle machine.
- **Run the tests your change touches, not all 221 suites.** `npx jest <paths>`.
  The full suite belongs to the person integrating, once, at the end.
- **One `tsc --noEmit` at a time.** It peaks over a gigabyte on this project.
- **Several agents means fewer heavy commands each, not more.** If you are one of
  a batch, assume the others are compiling too.

Prefix a long build or suite with `nice -n 10` when the machine is in use — it
costs the run almost nothing and keeps the UI responsive.

---

*The sections below moved here from Claude Code's global memory on 2026-09-07. They are
Boardly-only rules, so they belong in the repo that loads them rather than in an index
read at the start of every session, whatever the session is about.*

## i18n — never hardcode a user-visible string

Every label, message and piece of copy goes through the `t()` helper with a key defined in
**all four** locale files (`locales/en.ts`, `ru.ts`, `no.ts`, `uk.ts`). Parity is enforced
by the pre-commit hook.

Add the key to all four files first, then use `t('namespace.key')`. Never write
`t('key', 'fallback text')` — the fallback masks a missing translation and passes the
parity check while leaving three languages broken.

## Animations — never animate height

Only `opacity` and `transform`. Height animations trigger layout on every frame and cannot
be GPU-composited, so they stutter on a phone whatever the technique.

Established 2026-08-13 after three failed attempts on the lobby settings panel: the
grid-rows trick, then WAAPI on height, then FLIP. All three felt janky on Denys's own
phone; the problem was the property, not the implementation.

Design so element heights never change: crossfade fixed-size layers, a single-line
horizontal rail with scroll and a fade mask, or a drill-down view. Any UI listing games
must also scale — the catalog is 11+ games and growing, so wrapping chip layouts are a
dead end; use vertically scrollable full-width plates (see `LobbySettingsPanel`'s Games
drill-down).

## Bots belong in move-based games only

The catalog splits in two, and the split decides whether a bot is ever appropriate:

- **Move-based** (tic-tac-toe, memory, Yahtzee, connect four, RPS) — the opponent is a
  decision-maker. Bots are fine and already exist.
- **Conversation-based** (Guess the Spy, Alias, anything built on people talking) — the
  entire content is human conversation: pointed questions, hesitation, bluffing. **A bot
  can never work here.** These games assume players talk to each other, in the in-game
  chat or on Discord with the chat unused.

A canned-phrase bot in a social deduction game carries no information, and if it draws the
spy the round is empty. Never read an analytics finding like "51 % of Spy lobbies never
start, most had one person" as a case for seat-filling: that converts "lobby never started"
into "game started and was bad" — the metric improves and the experience gets worse. A
person alone in a social game needs people: matchmaking, invites, or a lower minimum with
a 2v1 split. Applies to #847 (Alias) — lower the minimum, do not add bots.

## `availability: 'in-development'` does not mean unfinished

In `lib/game-catalog.ts` it is a **product-visibility** flag, not a completeness flag. Rock
Paper Scissors and Liar's Party were both fully built, playable and tested while
deliberately kept `in-development` since 2026-05-18; Sketch & Guess (#253) followed the
same pattern on 2026-08-06.

So a ticket like "build game X's UI" is done once the game is playable behind its
`ENABLE_<GAME>` flag via a direct lobby code and verified. Flipping `availability` to
`'available'` — which also requires `lobbyCreateConfig` — is a separate decision for Denys
about featuring it publicly. Ask; never flip it as the natural last step of closing a
ticket.

**To play one, set both `ENABLE_IN_DEVELOPMENT_GAMES=true` and
`NEXT_PUBLIC_ENABLE_IN_DEVELOPMENT_GAMES=true` (#1054).** Until that flag existed the
rule above was circular: the decision is gated on the game being playable, and
`isTemporarilyUnavailableGameType` made POST /api/lobby and POST /api/game/create answer 400
for every in-development game, so nobody could play one to find out. Two agents "verified" a
game by reading its code instead, and a reviewer then found an empty content region on its
most-seen screen. Run the dev server with it, or add it to `.env.local`:

```bash
ENABLE_IN_DEVELOPMENT_GAMES=true NEXT_PUBLIC_ENABLE_IN_DEVELOPMENT_GAMES=true pnpm dev
```

- **Both variables, always - one of them alone is the confusing half-state.** `ENABLE_*` is
  what a server route reads; only `NEXT_PUBLIC_ENABLE_*` is inlined into a client bundle, and
  the create form, the game ribbon and the quick-play button all render the catalog in the
  browser. Set only the first and POST /api/lobby accepts `liars_party` while no picker on the
  site lists it, which reads as "the game is broken" rather than "the flag is half set". The
  two reads are ORed on purpose, so the same pair matches `ENABLE_SKETCH_AND_GUESS` and the
  other per-game flags; `__tests__/api/in-development-game-gate.test.ts` pins each read
  separately so neither can be dropped as dead code.
- It promotes every in-development entry that carries `gameType`, `route` and a
  `lobbyCreateConfig` - today Liar's Party and Sketch & Guess. That is a check on the entry,
  in `isFlagPromotableEntry`, not a list of names: those three fields are what
  `AvailableGameCatalogEntry` declares and promotion adds none of them, so an entry missing
  one would be promoted into a shape `GameRibbon` already reads `game.route` off.
  `fake_artist` and `telephone_doodle` have no pages and so no `route` (#975), which is what
  holds them back; they keep their own per-game flag as the way in.
- **It is dead on production, whatever the variable says.** `lib/feature-flags.ts` refuses it
  unless `VERCEL_ENV` / `NEXT_PUBLIC_VERCEL_ENV` positively say `preview` or `development`,
  or neither is set and `NODE_ENV` is not `production`. Unknown values are a no.
  `__tests__/api/in-development-game-gate.test.ts` drives the real POST handler through
  every production shape; do not soften it into a `!== 'production'` check.
- **The client half depends on one Vercel project setting, and it is on.** `NEXT_PUBLIC_VERCEL_ENV`
  only exists in a deployment if "Automatically expose System Environment Variables" is enabled;
  checked 2026-09-20 on `prj_MfQkf6bs9B5Qhf1x8MLX4fYRlnS2` via `GET /v9/projects/<id>`, which
  answers `autoExposeSystemEnvs: true`. The MCP's `get_project` does not return that field and
  `filter_project_envs` answers 403, so read it from the API with the CLI's own token. Were it
  ever turned off, a preview's client bundle would see nothing declared and a preview build's
  `NODE_ENV` is `production`, so the gate would fail closed in the browser while the server
  opened - the safe direction, and boardly.online is unaffected either way.
- It is deliberately **not** in `RUNTIME_FLAG_KEYS`, so the Control Panel cannot switch it on.
- **Never commit a change to `availability` to get a game running.** The flip is #873's.

## Testing a game that needs three or more real players

Games with `supportsBots: false` (Guess the Spy `minPlayers` 3, Alias 4, Liar's Party 4)
cannot be reached solo through the browser: a second tab shares cookies and localStorage,
so it is the same guest, not a second player.

Fill the empty seats over HTTP and drive the board with the one real browser as host:

```bash
# create the lobby in the browser, take <code> from the /lobby/<code> URL, then per slot:
curl -s -X POST http://localhost:3000/api/lobby/<code>/join-guest \
  -H "Content-Type: application/json" -d '{"guestName":"Filler1"}'
```

`app/api/lobby/[code]/join-guest/route.ts` needs no auth: it mints a guest and adds them if
a slot is open. This is the same public API the app's own UI calls — not a DB hack and not
hand-minted JWTs — so it is safe against the local dev server.

Two things that cost a run on 2026-09-20. The host's identity travels in an `X-Guest-Token`
header, not a cookie, so a curl cookie jar gets `Unauthorized`; take the token from the
`/api/auth/guest-session` body and put it in the header, and into `boardly_guest_token` /
`boardly_guest_id` / `boardly_guest_name` in localStorage for the browser. And rate limiting
is shared Upstash state across every agent on this machine, so `/api/auth/guest-session`
answers 429 for reasons that have nothing to do with your run - retry with a backoff rather
than concluding the endpoint is broken.

**Clean up by id, never by name.** `boardly-dev` is shared with every other agent running
right now, and `join-guest` hands out names from a small pool, so `username startsWith
'Filler'` matches their seats as well as yours. On 2026-09-20 a cleanup written that way
deleted four guests and four `Players` rows belonging to another agent's live lobby. Collect
the ids your own run created and delete those, or give your fixtures a run-unique prefix and
match on that.

## Redis — Upstash, and two traps that have both been hit

Upstash for Redis, Free plan, region `fra1`, connected to the Vercel project `boardly`
through the Marketplace (store `boardly-cache`, created 2026-09-04). 256 MB, 500K
commands/month. It backs chat history and rate limiting, and rate limiting is genuinely
shared now, so counters survive a dev-server restart; the e2e suite clears its own loopback
keys.

**The env var names depend on how it was connected.** The Marketplace integration sets
`KV_REST_API_URL` / `KV_REST_API_TOKEN` (plus `KV_URL`, `REDIS_URL`,
`KV_REST_API_READ_ONLY_TOKEN`); a direct Upstash setup sets `UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN`. `lib/redis-credentials.ts` reads both.

- A store is **archived after long inactivity**, and its credentials then fail with
  `fetch failed` while still looking correctly configured.
- The REST client **deserializes JSON on read**, so `lrange` returns objects even though
  `lpush` was handed a string. Calling `JSON.parse` on the result throws.

## Emails to users are written in the company voice

Anything sent to a Boardly user — feedback replies, support, announcements — speaks as the
company: "we" / "our", signed **The Boardly team**. Never "I", never Denys personally. A
one-person project still presents as a product.

Send through the Resend API as `Boardly <support@boardly.online>`; the domain is verified
in Resend and production sends from `noreply@boardly.online`. `RESEND_API_KEY` lives in
`.env.local` — use `node --env-file`. Set `reply_to` to Denys's Gmail until inbound
forwarding for `support@` exists. **Never send a Boardly user email from his personal or
Comono mailbox.**

## Boardly and the Control Panel are one database

- **Shared database.** Both connect to the same Supabase Postgres. The Control Panel reads
  and writes the same tables (Users, Games, Lobbies, Players, AdminAuditLogs).
- **This repo owns the schema and runs the migrations.** The Control Panel keeps a
  read-only copy of `schema.prisma`. The one exception, confirmed 2026-08-08: a table that
  is genuinely Control-Panel-only bookkeeping with no relevance to Boardly's app logic
  (e.g. `ChangelogChecklistItems` for `/changelog`) may be created through Supabase's own
  migration tooling and added only to the Control Panel's schema. Keep that narrow —
  anything with an FK into `Users` or `Games` still goes through this repo.
- **Auth.** The Control Panel admits only users with `role = "admin"` in the shared `users`
  table; admin accounts are managed in Boardly's database.
- **Where they live.** Control Panel → `~/Projects/boardly-control-panel`,
  `KovalDenys1/Boardly-control-panel`, `admin.boardly.online`. Its `AGENTS.md` carries the
  same issue-before-commit rule as this file.

A schema change here can break a Control Panel query, and a new admin feature there can
need data this app is not yet writing. Check both.

## Driving a browser on this Mac: the keychain will stop you dead

An agent that launches Chrome through Playwright on this machine gets macOS keychain
prompts - "Google Chrome for Testing wants to use your confidential information stored in
Chromium Safe Storage". They are **OS modal dialogs, not page dialogs**, so no browser
tool can dismiss them, and everything the agent does next waits for an answer that never
comes. On 2026-09-20 one agent sat blocked behind three stacked prompts for over an hour
and had to be killed; the transcript had reached 3.6 MB.

- **Launch with `--use-mock-keychain`.** Chromium then never asks. There is nothing in a
  throwaway automation profile worth encrypting anyway.
- A fresh `--user-data-dir` does not avoid this on its own - the prompt is about the
  keychain, not the profile.
- If it happens anyway, the automation instance is safe to kill: its command line carries
  `--user-data-dir=.../ms-playwright-mcp/...` and `--remote-debugging-pipe`, which Denys's
  own Chrome does not. Killing it dismisses the prompts and leaves his tabs alone.
- Symptom to recognise: a browser-driving agent that stops writing to its transcript while
  its process is still alive. Check for the dialogs before assuming it is thinking.

## Reading this database: two things that make an analysis quietly wrong

Both were hit on 2026-09-20 while measuring the funnel, and both produce a confident
number rather than an error.

**Bots are `Users` rows joined to a `Bots` table, not a role.** Every bot account has
`role = 'user'` exactly like a person, and some were created months ago, so they look
like long-standing registered users. Filtering on `role <> 'BOT'` excludes nothing and
counts every bot as a player: a first pass reported 205 of 348 games as having "no human
players" on that basis. Identify a bot with `"userId" in (select "userId" from "Bots")`,
which is what the app itself does — `lib/lobby-leave.ts` asks Prisma for
`user: { bot: { isNot: null } }`.

**`abandonedAt` is when the cleanup sweep noticed, not when the player left.** It lands
one and a half to three hours after `startedAt`, so `abandonedAt - startedAt` reads as
"they played for ninety minutes and gave up" when the truth is the opposite. For how long
anyone actually played, use `lastMoveAt - startedAt`; the medians that come out are 4 to
24 seconds for the fast games. A negative result there is real and means `lastMoveAt` was
never written after the game began (#1048).

**`AnalyticsUserFacts` is the Control Panel's table, not this repo's.** It has no Prisma
model, no migration and no reader here, so grepping this tree says it does not exist - an
agent concluded exactly that on 2026-09-20. It is real, it is populated, and it is owned by
`~/Projects/boardly-control-panel` (its `prisma/schema.prisma` plus
`app/api/cron/analytics-sync/route.ts`), which is the carve-out described above for
Control-Panel-only bookkeeping. Query it through the `supabase-prod` MCP.

**And the guest purge erases the evidence.** `scripts/cleanup-old-guests.ts` deletes
guests inactive for 3 days and their `Players` rows go with them, so anything older than
that has lost the majority of its players — guests are most of the audience. Retention
has to be read from `AnalyticsUserFacts`, which keeps a row after the user is gone and
marks it `missingSince`.

**So `Users` cannot be read as a daily series at all.** Grouping `Users` by `createdAt`
makes every day older than the retention window look empty, because those rows were
cleaned rather than never created — on 2026-09-21 it showed 0-3 guests a day for 14-17
September while `AnalyticsUserFacts` showed 5, 8, 17 and 7 for the same days. Use
`AnalyticsUserFacts` for anything that compares days, and remember its sync runs nightly
around 02:29 UTC, so today's rows are not in it yet.

**When you need "did anything happen", ask `OperationalEvents` for the *kinds*, not the
count.** `count(distinct "eventName") by day` is the cheapest health check this database
has. Human events are `lobby_create_ready`, `move_submit_applied`, `invite_opened`,
`second_human_joined`, `signup_prompt_shown`; `cron_run` is our own schedulers and is
written whatever happens to the site. A day holding only `cron_run` is a dead day, which
is what 19 and 20 September 2026 were, against 4-9 kinds on every other day. The
`site_silent` reliability rule (#1057, `lib/operational-metrics.ts`) now watches exactly
this; its runbook is `docs/OPERATIONS.md#runbook-site_silent`.

## DNS

`boardly.online` is registered at **Namecheap** — Domain List → boardly.online → Manage →
Advanced DNS. Checked 2026-08-03: registration active to 14 Nov 2027 and WhoisGuard privacy
to 14 Nov 2026, both on auto-renew; PremiumDNS not purchased and not needed. Nothing to do
until ~Nov 2026 beyond confirming the card on file is still valid.

## Two traps that cost a wrong-database connection

**`prisma.config.ts` overrides your shell.** It calls `dotenv.config({ override: true })` on `.env`
if that file exists, and only otherwise on `.env.local`. So exporting `DATABASE_URL` /
`DIRECT_URL` in the shell does **not** point Prisma anywhere — `.env.local` wins. On 2026-09-07 a
`prisma migrate deploy` aimed at `boardly-dev` reported "No pending migrations" against a database
with zero tables, which is the impossible answer that gave it away.

**Since then `.env.local` points at `boardly-dev`, not production** (checked 2026-09-17:
`inmvbxfflqeblynpktay`, 13 users, 2 games — production is `vamydthjlytrseqdpzqv`, 159 registered
users). So the trap has inverted: a script run from this repo now silently hits **dev**, and a
"user not found" against a row you just read in production is the tell. To touch production data,
use the Control Panel's `.env.local` (`~/Projects/boardly-control-panel`, same shared database and
the sanctioned admin surface) or the `supabase-prod` MCP, and always guard the write with a second
identifying column so a wrong-database run refuses instead of writing.

To run a Prisma command against another database, use the config's own precedence rather than
fighting it: write the target values into a temporary `.env`, run, and delete it — with a `trap`,
so an interrupted run does not leave the repo pointing somewhere else.

**`vercel` CLI 53.1.1 cannot add a Preview variable for all branches.** `vercel env add NAME
preview` answers `git_branch_required` even when given the exact command it prints in its own
`next[]`. With a branch (`vercel env add NAME preview develop --value "$V" --yes`) it works. For
all Preview branches, use the dashboard.

Two more Vercel facts from the same session: a variable set for several environments is **one
entry**, so pointing Preview somewhere else means deleting it and recreating it per environment —
capture `vercel env pull --environment=production` first, and chain the removal and the production
restore in one command so production is never without it for longer than a call. And Vercel rejects
type `Secret` for a `NEXT_PUBLIC_*` key, correctly: those values are inlined into the client bundle.

## Ads — what is already true, and the one place they must not go

`app/layout.tsx` loads `adsbygoogle.js` for publisher `ca-pub-9471518400402044`, **in
production only** (#1152 — a fresh-profile measurement of boardly.online showed the loader
firing a request to `fundingchoicesmessages.google.com` and writing a first-party `FCCDCF`
cookie before any consent existed; preview and development gained nothing from carrying it,
so it no longer loads there). That script is **three things at once**, which is why it
stays on in production even with no ad showing: site verification, the ad loader, and
**Google's EEA/UK consent message**. The consent message has been published for
boardly.online in 32 languages since 2026-09-02 and is delivered by that loader. So
`app/privacy/page.tsx:113` promising consent-gated personalised ads is backed.

**The absence of a CMP, TCF shim or cookie banner in the tree is conditional, not settled
(#1153): it holds only as long as Google's own message is verified to render and produce a
TC string.** #1067 measured `displayStatus: hidden` and an empty TC string while ads were
off — expected with no ad request in flight, but *unverified* for the moment ads go live.
Before setting `NEXT_PUBLIC_ADS_ENABLED=true`, run the ads-day checklist in
`docs/OPERATIONS.md#ads-day-checklist-flipping-next_public_ads_enabled-on`; if the message
does not render and produce a TC string with `cmpId 300` there, ads stay off and a
home-made banner is not a substitute — do not "fix" a failed check by adding one. A footer
control (`lib/consent.ts`, wired into `components/Footer.tsx`, production only) reopens the
message via the `googlefc` revocation API for anyone who wants to change their choice.
Google is the holder of the consent record itself (its CMP, its TC string) — the privacy
notice's processor list should name it accordingly (#1153; not edited here — `/privacy` is
owned separately).

Ad units live in `components/AdSlot.tsx`, ids in `lib/ad-slots.ts`. Three gates must all
open before an `<ins>` reaches the DOM: `NEXT_PUBLIC_ADS_ENABLED`, client mount, premium.

- **The env switch is unset on purpose.** The one gate left is AdSense, which still has
  boardly.online as "Getting ready". (Vercel Pro, $25/month since 2026-09-18, removed the
  other: Hobby is non-commercial only.) Production only, once AdSense approves — never
  Preview, which would serve ads on a non-production host.
- **Client mount is not decoration.** The guide routes are statically prerendered and
  must stay that way. A server-side premium check turns all 15 dynamic. Verify with a
  build: the guide rows must still be `○`.
- **Premium is checked over HTTP, not from the session.** The NextAuth token carries no
  premium claim, and adding one would show ads to someone who had just paid not to see
  them until their token refreshed. Signed-out visitors and guests skip the lookup.

**Never put an ad in or near a game.** Not in `GameResultOverlay`, which is where an
earlier plan wanted one: it sits over the board holding the play-again button, so an ad
there competes with the only action the player wants and invites exactly the misclick
AdSense polices hardest. Ads go on content pages — the guides — below every CTA.

An unfilled slot must collapse. Until approval every slot comes back
`data-ad-status="unfilled"`, and without the collapse that is a blank gap on every page
that has one.

If the AdSense console says ads.txt is "Not found", check
`https://boardly.online/ads.txt` before believing it — it serves 200, and the console has
been showing a 2 September snapshot for weeks.

## Release gate: push and release without waiting for Denys

On Boardly and the Control Panel — nowhere else — the release gate is handed over: push to
`develop` and cut releases to `main` without waiting for him to test. The repo's own gates
still stand and are the reason this is safe: `pnpm test` at zero failures, `npm run ci:quick`,
green Actions. Do not ask "shall I release?" — release, then say what shipped. Product and
brand decisions (which game goes public, a security header on the live site) are judgement,
not verification: ask them **in chat, in the same message as the report**, never in a ticket.
Anything sent to other people still waits for his approval.

## Boardly is the repo plus its satellites

The Discord server and anything else attached to the product go stale silently. A release
that flips a game to available, renames something or changes what the site offers is not
finished while the server still describes the old product: at the end of a release ask what
outside the repo now describes it wrongly — channel topics, pinned messages, the invite, the
site's copy about the community. Guild `1446554932298649796`; `#webhook` and `#feedback` are
where `OPS_ALERT_WEBHOOK_URL` and `FEEDBACK_DISCORD_WEBHOOK_URL` point, **never delete them**.
Server-as-code and the bot live in `KovalDenys1/boardly-discord`, ids only in
`server/snapshot.json`; the vault note is `03 Projects/Boardly/Discord Server.md`; one phase
per session.

## Research before build, agents in parallel (Denys, 2026-09-24)

A new game or a rework of one starts with research, not code. Run it as short, single-question
agents and write the result into the vault under `03 Projects/Boardly/`:
- **Demand:** Google Trends against *yahtzee online*, plus `SearchConsoleDaily`.
- **Competitors:** who ranks, and what they offer.
- **Player sentiment:** what people praise and hate (reviews, forums).
- **Fit and cost:** in this codebase.

The result becomes acceptance criteria on the ticket. The first run is in
`New Games Research 2026-09-24.md` and `Competitor UX Research 2026-09-24.md`.

**Builds:**
- Independent builds go to agents in separate git worktrees.
- Every agent-built PR gets a code review and an adversarial refuter before merge. On 2026-09-24 that caught a seat/side desync in Checkers, a forgeable host accept in Sketch & Guess, and #1103: the results route was leaking running games' secrets.

**Limits:**
- Keep the fan-out small: one or two long-reading agents at a time, each writing its result before the next one starts.
- Wide parallelism burns Denys's usage limit and returns nothing if stopped.
- One agent owns Chrome at a time.

## Growth work runs as a loop, not as ideas

Sunday funnel routine → Tuesday planner (cloud, Sonnet, Supabase only) → Wednesday builder
(cloud, Opus, one `growth/<issue>` PR to `develop`). Read the vault's
`03 Projects/Boardly/Growth/Growth Log.md` before any marketing or SEO work; file growth work
as tickets in the queue's shape (labels `growth`, `agent-ok` / `needs-denys`), never outside
it. Decisions taken 2026-09-14, not to re-open: $2.99 subscription + yearly plan, no
one-time unlock, no tip jar, no Reddit posting, no Poki/CrazyGames/Product Hunt, no
ads near a game, localized URLs for game pages only. **2026-09-24: social accounts are on**
(TikTok, Instagram, YouTube, Threads, Facebook Page, Pinterest; handle `@playboardly`; plan in
the vault's `Growth/Social Launch Kit 2026-09.md`), and the brand is **faceless**: never
Denys's name, face or voice in marketing — screen recordings, on-screen text, synthetic voice,
company voice. Agents prepare; Denys creates accounts and posts. The cloud sandbox has no `gh`: builder
PRs come from `growth-pr.yml`, and `ci.yml` must list `growth/**` under push branches.
A routine created without `mcp_connections` gets every account connector — pass the list.

## Reading the database: three things the schema does not tell you

- **Bots are ordinary `Users` rows** (`isGuest = false`, matching `Bots` row). Every user
  metric needs the `Bots` anti-join or it counts 24 bots as users.
- **Guests are hard-deleted after three idle days and `Players` cascades**, so most games
  have no `Players` rows; the surviving roster is `Games.state->'players'`.
- **`status = 'cancelled'` means nobody ever joined** (`startedAt IS NULL`). Dropping it from
  a completion rate hides the product's largest leak.

Data before 2026-09-09 is contaminated by local dev writing to production. The Control Panel
(`~/Projects/boardly-control-panel`) never runs migrations — this repo owns the schema — and
its Vercel secrets do not come back from `vercel env pull`, so its cron routes run by hand:
`CRON_SECRET=<anything> pnpm exec next dev -p 3100` there, then curl `localhost:3100/api/cron/…`
with that bearer. Vercel Analytics headline cards can exceed a longer range's totals — read
the daily series and the Pages table, and check the database before agreeing that anything
"shows zero".
