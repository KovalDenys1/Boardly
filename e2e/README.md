# End-to-end tests

```
npm run test:e2e        # headless, against a dev server it starts itself
npm run test:e2e:ui     # Playwright's UI mode, for debugging a failure

# verify a release — note the env file, see "Which database" below
E2E_DB_ENV_FILE=.env.boardly-prod.local E2E_BASE_URL=https://boardly.online npm run test:e2e
```

## Which database (#896)

**The database has to follow what the suite is pointed at.** `baseURL` comes
from `E2E_BASE_URL` and `DATABASE_URL` from `.env.local`, and those are two
independent decisions. Until `.env.local` moved to `boardly-dev` on 2026-09-09
they happened to name the same project, so the pair never had to agree; after
it, `E2E_BASE_URL=https://boardly.online npm run test:e2e` would have driven a
browser against production while the teardown deleted the marked lobbies, their
`LobbyParticipations` rows and the `E2E*` guests from `boardly-dev`, where none
of them exist — and reported success. That is the state #867 had to clean out
of production by hand.

So the pair is now checked in two places, because the teardown runs as its own
process and should not have to trust the config that spawned it:

| Pointed at | Database it must use |
|---|---|
| nothing, or `localhost` | `boardly-dev` |
| a Vercel preview | `boardly-dev` — Preview's env points there |
| `boardly.online` | production |

A mismatch throws before the first test and the teardown deletes nothing. To
run against production, name the file that holds its connection strings:
`E2E_DB_ENV_FILE` is loaded before `.env.local`, and dotenv keeps the first
value it sees. `E2E_DB_ENV_FILE` naming a file that does not exist is an error
rather than a silent fall-through to the dev database.

Playwright starts `next dev` on **port 3100** by itself — 3000 is often taken by
another project, and `reuseExistingServer` will happily hand the suite whatever
is already answering there.

## Why these exist

The Jest suite mocks Supabase. That is right for 1148 unit tests, and it means
they cannot see the one thing that actually breaks a lobby: a client subscribed
to a different realtime topic than the server broadcasts to, or a message whose
body never arrives. Neither raises an error anywhere — the lobby just goes
quiet.

Three tests, each standing in for a check that used to be done by hand:

| Test | Replaces |
|---|---|
| `realtime-chat.spec.ts` — a message written in one browser arrives in another | opening two windows and typing into both (#801, #845) |
| `realtime-chat.spec.ts` — every player can resolve the topic, nobody else can | — |
| `realtime-chat.spec.ts` — a message is still there after a reload | checking chat history survives (#854) |
| `spectator.spec.ts` — a spectator sees the game start without reloading | watching a lobby you are not playing in (#845, #862) |
| `spectator.spec.ts` — a lobby with spectators disabled gives out no topic | — |
| `alias-three-players.spec.ts` — three teams of one, one describer and two guessers | playing a three-handed Alias round (#847) |
| `rps.spec.ts` — two players pick, both see the reveal, the host holds the rematch | a Rock Paper Scissors match between two humans (#870) |

These found #852, both halves of #854, and #862 — where the test written to guard #845 showed that #845 had broken spectating an hour after shipping.

## How they are built

**Setup goes through the API, assertions go through the browser.** Lobbies and
players are created over HTTP because the entry and lobby-creation screens carry
almost no test ids, and driving them would make every test fragile in a way that
has nothing to do with what is being tested. A guest identity is three
localStorage keys, so each player gets its own browser context seeded with them
— two tabs in one context would share storage and be the same person.

**Waiting is on the WebSocket, not on a timer.** Realtime broadcast has no
replay, so a message sent before both sides have joined is simply lost.
`watchRealtimeSubscription` waits for Phoenix to acknowledge the join, which is
also the direct evidence that the client subscribed to `lobby:{code}:{secret}`
rather than the guessable bare name.

## They talk to the real database

Supabase Realtime is the thing under test, so a local Postgres would remove the
only reason these tests exist. Consequences:

- They need `.env.local` and **cannot run in CI**, which has no secrets.
- Every lobby they create is named `E2E — …` and the global teardown deletes it.
  Games and players cascade; the `LobbyParticipations` rows and the `E2E…`
  guests do not, so the teardown deletes those too (#867). The guests cached
  in `e2e/.auth` are kept for the next run.
- Guest identities are cached per role in `e2e/.auth/` (gitignored) and reused,
  because `/api/auth/guest-session` allows five requests per fifteen minutes.
  Tokens last 12h. This matters most against a deployment: there the limiter
  keys on the runner's real IP, which the per-test clearing deliberately will
  not touch, so minting a guest per run made the spectator tests unrunnable
  after a couple of attempts. Reuse is safe because a cached guest is never
  added to a lobby as a player.
- **Import `test` from `./support/fixtures`, not from `@playwright/test`.** That
  fixture clears this machine's rate-limit counters before **each** test. Since
  #854 the counters are shared in Redis, so the suite competes with itself: the
  auth preset allows five requests per fifteen minutes and every spectator needs
  a guest of their own, which a full run exhausts partway through. Clearing once
  per run was not enough. Only `::1`, `127.0.0.1` and `unknown` keys are touched
  — behind Vercel the limiter always keys on a real address, so this cannot
  reach anybody else's counters.
- Spectating needs `allowSpectators`, which is Premium, so `enableSpectators()`
  sets it in the database. What is under test is the spectator path, not the
  paywall.

## If a change to `lib/` seems to have no effect

Playwright reuses a dev server that is already listening on 3100. Next's dev
server hot-reloads most things but keeps module-level state — the memoised Redis
client, for one — so a change to how a client is constructed needs the server
restarted: `lsof -ti:3100 | xargs kill -9`. This cost half an hour once already.

## Against a deployment

`E2E_BASE_URL` skips the local dev server and points the same tests at a
released app — which is the release check, rather than curling for a 200.

The rate limits are real there and cannot be cleared: the limiter keys on the
runner's public IP, and the per-test clearing only ever touches loopback. Lobby
creation allows ten per hour against a bucket that resets on the hour, and the
suite makes seven. **So: one production run per hour.** Guest identities are
cached, so repeat runs no longer spend the tighter five-per-fifteen-minutes
auth budget.
