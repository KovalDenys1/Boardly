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

`app/layout.tsx` loads `adsbygoogle.js` for publisher `ca-pub-9471518400402044`. That
script is **three things at once**, which is why it stays on even with no ad showing: site
verification, the ad loader, and **Google's EEA/UK consent message**. The consent message
has been published for boardly.online in 32 languages since 2026-09-02 and is delivered by
that loader. So `app/privacy/page.tsx:113` promising consent-gated personalised ads is
backed, and the absence of a CMP, TCF shim or cookie banner in the tree is not a gap —
do not "fix" it by adding one.

Ad units live in `components/AdSlot.tsx`, ids in `lib/ad-slots.ts`. Three gates must all
open before an `<ins>` reaches the DOM: `NEXT_PUBLIC_ADS_ENABLED`, client mount, premium.

- **The env switch is unset on purpose.** Vercel is on the **Hobby** plan, which is
  non-commercial only, and ads make a site commercial; AdSense also still has
  boardly.online as "Getting ready". Production only, once both are settled — never
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
