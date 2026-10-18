# Chat Block and Guest Terms Implementation Plan (#1466)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player can block another player everywhere chat appears, and nobody posts in chat before accepting the Terms of Use and the Community Rules. Google Play's user-generated content policy requires both.

**Architecture:**
- **Block replaces the per-lobby Mute (#1088).** There is one control, "Block player", and it applies to every lobby.
- **Where blocks are stored:** for signed-in users in a new `UserBlocks` table behind `/api/user/blocks`, and for guests on the device in localStorage.
- **Filtering:** the client-side filter Mute already uses in `components/Chat.tsx`. Broadcast and history go to everyone, so a block can only be a filter on the viewer's side.
- **Terms:** the chat POST refuses any user whose `Users.termsAcceptedAt` is null. The chat GET tells the viewer whether they have accepted, so the composer shows a consent panel instead of the input. Accepting calls `POST /api/user/accept-terms`, which works for guests too.

**Tech Stack:** Next.js 16 route handlers, Prisma 7 (PostgreSQL, Supabase), React 19, Jest + Testing Library.

**Spec:** GitHub issue #1466 (`gh issue view 1466`). Policy text is in the vault note `03 Projects/Boardly/Android Play Research 2026-10-18.md`, section "Policies that bite a web app".

## Global Constraints

- **Table `UserBlocks`:**
  - columns `id String @id @default(uuid())`, `blockerId`, `blockedId`, `createdAt DateTime @default(now()) @db.Timestamptz(3)`;
  - both relations to `Users` with `onDelete: Cascade`;
  - `@@unique([blockerId, blockedId])` and `@@index([blockedId])`;
  - no `@@map`, following the `Friendships` pattern.
- **Migration folder:** `prisma/migrations/20261018120000_user_blocks/migration.sql`, with the same header, `IF NOT EXISTS` and RLS (service_role only) as `20260927120000_content_reports`.
- **Guest device key:** `boardly_blocked_players`, holding JSON `{ id: string; username: string; blockedAt: string }[]`, at most 200 entries with the oldest dropped first.
- **Account limit:** 500 blocks.
- **Chat refusal:** HTTP 403 with body `{ code: 'TERMS_REQUIRED' }`.
- **Bots:** users with a `Bots` row are never refused and can be blocked like anyone.
- **Locales:** every user-visible string goes through `t()`, with keys in all four of `locales/en.ts`, `no.ts`, `uk.ts`, `ru.ts`. The English text in this plan is final; write natural no, uk and ru. Never use a `t()` fallback.
- **Comments:** none that restate the code; at most one line, for a *why* only.
- **Heavy commands:** `nice -n 10 npx jest <paths>` for focused runs. Only the last task runs `pnpm test` and `npm run ci:quick`.

## Review Focus

1. **A guest who later registers keeps their blocks.** When the session turns authenticated, the device list is POSTed to the account and then cleared (Task 3 test).
2. **Blocking oneself or a system message is impossible**, both in the UI and on the server, which answers 400 (Tasks 1 and 4).
3. **An old registered account with `termsAcceptedAt` null** sees the consent panel once and can then chat. It must not be locked out (Task 2 test).
4. **A message sent while the viewer status is still loading** gets the 403. The client then shows the consent panel and keeps the typed text, so nothing is lost (Task 4 test).
5. **Two Chat instances on one page** (desktop column and mobile tab) both hide a newly blocked player at once. Mute already does this with the `boardly:chat-muted` event; keep the mechanism under a new name (Task 3 test).

---

### Task 1: `UserBlocks` model, migration and `/api/user/blocks`

**Files:**
- Modify: `prisma/schema.prisma`: add the model, plus back-relations on `Users` named `"BlocksMade"` and `"BlocksReceived"`.
- Create: `prisma/migrations/20261018120000_user_blocks/migration.sql`
- Create: `app/api/user/blocks/route.ts` (GET, POST)
- Create: `app/api/user/blocks/[blockedId]/route.ts` (DELETE)
- Test: `__tests__/api/user-blocks.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/user/blocks` → `{ blocks: { id: string; username: string; blockedAt: string }[] }`, where `id` is the blocked user's id.
  - `POST /api/user/blocks` with body `{ userIds: string[] }` (1–200 entries) → `{ blocks: [...] }` (the full list). Already-blocked ids are ignored, and unknown ids are skipped silently.
  - `DELETE /api/user/blocks/:blockedId` → `204`.
  - Every route requires a signed-in session through `requireSessionUser`; guests get 401. Rate limit with `rateLimitPresets.api`, following `app/api/friends/[friendshipId]/route.ts`.

- [ ] **Step 1: Write failing tests** with the repo's Prisma mock pattern (see `__tests__/api/friends-*.test.ts`):
  - GET returns the list newest first, with usernames.
  - POST with the caller's own id → 400 `{ code: 'CANNOT_BLOCK_SELF' }`.
  - POST past 500 total → 400 `{ code: 'BLOCK_LIMIT' }`.
  - POST is idempotent: blocking the same id twice leaves one row (`createMany` with `skipDuplicates`).
  - DELETE removes only the caller's own row; another user's block cannot be touched.
  - A guest gets 401 on each route.
- [ ] **Step 2: Run** `nice -n 10 npx jest __tests__/api/user-blocks.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the schema, migration and routes, then run `npx prisma generate`.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** with `#1466 feat: players can block other players on their account`.

### Task 2: Terms gate on chat

**Files:**
- Create: `app/api/user/accept-terms/route.ts` (POST)
- Modify: `app/api/lobby/[code]/chat/route.ts`: in the POST, after the player-membership check (around line 110), refuse when `termsAcceptedAt` is null and the user is not a bot. The GET adds `viewer: { termsAccepted: boolean }` to its response.
- Test: `__tests__/api/accept-terms.test.ts`, plus extensions to `__tests__/api/lobby-chat-broadcast.test.ts` or a new `__tests__/api/lobby-chat-terms.test.ts`.

**Interfaces:**
- Produces:
  - `POST /api/user/accept-terms` → `{ termsAcceptedAt: string }`. It authenticates with `getRequestAuthUser`, so guests work, and writes with `updateMany where { id, termsAcceptedAt: null }` like `app/api/onboarding/route.ts:47-52`. It then reads the row back and returns the stored value, so a second call keeps the first date. Rate limit with `rateLimitPresets.api`.
  - Chat GET: the response gains `viewer: { termsAccepted: boolean }`.
  - Chat POST: 403 `{ code: 'TERMS_REQUIRED' }`.

- [ ] **Step 1: Failing tests:**
  - accept-terms sets the date for a guest;
  - a second call keeps the first date;
  - with no auth → 401;
  - a chat POST from a guest with null terms → 403 `TERMS_REQUIRED` and no broadcast;
  - after accepting, the same POST → 200;
  - a chat POST from a registered user with null terms → 403, so old accounts are gated once too;
  - a bot user is never refused;
  - the chat GET returns `viewer.termsAccepted` true or false to match the row.
- [ ] **Step 2: Run** the test files. Expected: FAIL.
- [ ] **Step 3: Implement.** Check whether bots post through this route at all (`grep -rn "chat" lib/bots`). If they do not, the bot exemption is a one-line guard with its test. Record what you found in the report.
- [ ] **Step 4: Run** the test files. Expected: PASS.
- [ ] **Step 5: Commit** with `#1466 feat: chat asks for the terms before the first message`.

### Task 3: `useBlockedPlayers`

**Files:**
- Create: `hooks/useBlockedPlayers.ts`
- Test: `__tests__/hooks/use-blocked-players.test.tsx`

**Interfaces:**
- Consumes: the Task 1 routes.
- Produces: `useBlockedPlayers(): { blocked: BlockedPlayer[]; blockedIds: ReadonlySet<string>; block(p: { id: string; username: string }): Promise<void>; unblock(id: string): Promise<void>; ready: boolean }`, with `type BlockedPlayer = { id: string; username: string; blockedAt: string }`.
  - **Signed in** (`useSession().status === 'authenticated'`): server-backed through `fetch`, with optimistic updates that roll back on a failed response.
  - **Guest or signed out:** device-backed under `boardly_blocked_players`, with the cap from Global Constraints. Every read and write is wrapped in try/catch, following `contexts/GuestContext.tsx`.
  - **Sync between instances:** after any change, dispatch `window` event `boardly:blocked-players-changed`; every instance listens and reloads.
  - **Sign-in hand-over:** when the status becomes `authenticated` and the device list is non-empty, POST `{ userIds }` once, then clear the key.
  - `GuestContext`'s `clearGuestMode` and `forgetGuest` must also remove the key, since a "forget me" leaves nothing behind (`contexts/GuestContext.tsx:133` and the `forgetGuest` path).

- [ ] **Step 1: Failing tests:**
  - for a guest, block writes to the device and unblock removes the entry;
  - the 201st device entry drops the oldest;
  - for a signed-in user, block POSTs and a failed POST rolls back;
  - a second hook instance sees a change through the event;
  - on sign-in, the device list is POSTed once and the key cleared;
  - `forgetGuest` clears the key (extend `__tests__/contexts/*guest*` if it exists, otherwise test it here).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with `#1466 feat: one block list for guests and accounts`.

### Task 4: Chat and player card UI

**Files:**
- Modify: `components/Chat.tsx`:
  - Replace the Mute state, storage, event and "unmute all" (lines 47–101, 265–276, 437–447) with `useBlockedPlayers`.
  - The message action becomes Block (icon `UserX` or the Phosphor equivalent used nearby), visible on the same messages that can be reported (`canReport` at line 348).
  - Clicking it opens a confirm popover: "Block {{player}}? You won't see their messages in any game. You can unblock them in your settings." with the buttons "Block" and "Cancel".
  - `visibleMessages` filters `blockedIds`.
  - The title-strip "unmute all" button is removed.
  - The consent panel replaces the composer when `termsAccepted === false`. It reads "Before your first message, accept the Terms of Use and the Community Rules." with both links opening in a new tab, and the button "Accept and chat". The panel shows the same way when a send comes back 403 `TERMS_REQUIRED`, and the typed text stays in the input.
- Modify: `app/lobby/[code]/hooks/useLobbyChat.ts`:
  - expose `termsAccepted: boolean | null` from the history GET's `viewer`;
  - expose `acceptTerms(): Promise<boolean>`;
  - when a send is refused with `TERMS_REQUIRED`, set `termsAccepted` to false and return the text so the composer can restore it.
  - Each of the 13 `<Chat` mounts receives the two new props. Keep them prop-driven, as the existing chat props are.
- Modify: `components/PlayerProfileCard.tsx`: add a Block / Unblock button in the footer row beside Report (lines 288–299), hidden for `relation === 'self'`.
- Modify: `locales/en.ts`, `no.ts`, `uk.ts`, `ru.ts`:
  - **Add** `chat.blockPlayer` "Block {{player}}", `chat.blockConfirm` (the text above), `chat.blockAction` "Block", `chat.cancel` "Cancel", `chat.termsPrompt` (the text above), `chat.termsTerms` "Terms of Use", `chat.termsRules` "Community Rules", `chat.termsAccept` "Accept and chat", `chat.termsFailed` "Could not save that. Try again.", `profileCard.block` "Block", `profileCard.unblock` "Unblock".
  - **Remove** `chat.mutePlayer` and `chat.unmuteAll*`.
- Test: update `__tests__/components/Chat.test.tsx` (its Mute block at line 217 becomes Block) and `__tests__/components/player-profile-card-report.test.tsx`, or a new `player-profile-card-block.test.tsx`; also `__tests__/hooks/use-lobby-chat-refused.test.tsx`.

- [ ] **Step 1: Failing tests:**
  - Block with confirm hides that player's messages and not others';
  - there is no Block on one's own or on system messages;
  - when `termsAccepted` is false, the consent panel shows and no input;
  - Accept calls `acceptTerms` and then shows the input;
  - a 403 `TERMS_REQUIRED` on send shows the panel with the text kept;
  - the profile card shows Block for another player and nothing for oneself, and Block → Unblock toggles.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the touched test files plus `__tests__/components/GamePlayerCard.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** with `#1466 feat: block a player from chat and the player card, consent before chatting`.

### Task 5: Managing blocks, and verification

**Files:**
- Modify: `app/profile/page.tsx`: add a "Blocked players" section after Privacy in the settings tab (around line 2880), with anchor `#blocked`, listing username and date with an Unblock button each; empty state "You haven't blocked anyone."
- Create: `components/BlockedPlayersList.tsx`, the list used by both places.
- Modify: `components/Header/GuestMenu.tsx`: add a "Blocked players" item that opens a dialog with `BlockedPlayersList`. Use the dialog primitive the header already uses (look at `ForgetGuestButton`).
- Modify: the locales, adding `blockedPlayers.title` "Blocked players", `blockedPlayers.empty` "You haven't blocked anyone.", `blockedPlayers.unblock` "Unblock", `blockedPlayers.blockedOn` "Blocked {{date}}".
- Test: `__tests__/components/blocked-players-list.test.tsx`, plus one case each in `__tests__/app/profile-page.test.tsx` and a GuestMenu test.

- [ ] **Step 1: Failing tests:**
  - the list renders entries and Unblock removes one;
  - the empty state shows;
  - the profile settings tab contains the section;
  - the guest menu opens the dialog.
- [ ] **Step 2: Implement, then run.** Expected: PASS.
- [ ] **Step 3: Run** `pnpm test` (0 failures) and `npm run ci:quick` (exit 0) from the **main checkout** `~/Projects/boardly` with this branch checked out by ref, or filter the worktree's known tsc noise (stripe, axe-core, playwright scripts) and say which you did.
- [ ] **Step 4: Run the Playwright MCP sweep** against `pnpm dev` at 390 and 1280 px:
  - two guests (one browser plus the curl `join-guest` filler from CLAUDE.md) in a bot-less lobby;
  - the consent panel appears before the first message;
  - Accept lets the message through;
  - Block on the filler's message hides it;
  - the guest menu lists the filler, and Unblock brings the messages back.
  - Launch the browser with `--use-mock-keychain`. Clean up the run's own guests by id.
- [ ] **Step 5: Commit** with `#1466 feat: list and remove blocks in settings and the guest menu`.
