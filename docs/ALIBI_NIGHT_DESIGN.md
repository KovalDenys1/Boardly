# Alibi Night Design Spec (MVP)

## Scope

`Alibi Night` is a social bluffing/investigation party game where each round one player is under suspicion and everyone submits short alibis. Players challenge inconsistencies, then vote on the most suspicious story.

This spec defines a server-authoritative MVP aligned with Boardly realtime and guest-token rules.

## Round model

1. Prompt/context setup
- Server chooses a deterministic `roundPrompt` (location + time + incident theme) from a seeded prompt pool.
- Server assigns one `suspectPlayerId` for the round.
- Prompt is visible to all players.

2. Alibi submission (hidden)
- Every active player submits one text alibi.
- Submissions are hidden until phase end.
- Server stores immutable per-round snapshot:
  - `authorPlayerId`
  - `text`
  - `submittedAt`
  - `revision` (always `1` in MVP, no edits)

3. Challenge phase
- All revealed alibis become visible in stable order (join order).
- Each player can issue up to `N` challenges (default `2`) targeting another player.
- A challenge is a short contradiction question linked to target alibi ID.

4. Final vote
- Each player casts one vote for the most suspicious alibi/author.
- Self-vote disabled.
- Hidden votes until phase end, then full reveal.

5. Resolution
- Round points granted based on vote outcome.
- Game advances to next round until `targetRounds` reached.

## Player constraints and timers

- Supported players: `4-12`.
- Recommended defaults: `6` rounds, `45s` alibi submit, `60s` challenge, `30s` final vote.
- Lobby host-configurable timers (bounded):
  - `alibiSubmitMs`: `20_000..120_000`
  - `challengeMs`: `20_000..150_000`
  - `voteMs`: `15_000..90_000`
- Auto-transition rules:
  - If all required actions are received, phase closes early.
  - On timeout, server auto-fills missing action with deterministic fallback.

## Reconnect and timeout behavior

- Server snapshot is source of truth for every phase.
- Reconnect returns full `AlibiNightState` with:
  - current phase
  - per-player completion flags
  - absolute phase deadline
  - immutable revealed round data
- Timeout fallback:
  - Missing alibi: server inserts `"No alibi provided"` marker (localized on client).
  - Missing challenge: treated as skip.
  - Missing vote: deterministic abstain.
- Phase completion is idempotent and guarded by round+phase revision key.

## Moderation and safety constraints

- Alibi/challenge text length: `1..240` UTF-8 chars.
- Input normalization:
  - trim whitespace
  - collapse repeated whitespace
  - reject invisible/control-only content
- Rate limiting per player per phase:
  - max `3` submissions per `10s` window at transport level
  - only first accepted semantic action counted for phase state
- Content safety (MVP baseline):
  - reject banned slur dictionary hits
  - reject URL payloads
  - keep moderation events in server logs with room/game/actor IDs

## Deterministic server validation

- Only current expected phase action is accepted.
- Actor must be active room member validated via auth or `X-Guest-Token`.
- Duplicate action by same actor for same phase is a no-op.
- Every accepted action records:
  - `serverTimestamp`
  - `phaseRevision`
  - `actorPlayerId`
- Broadcast payload includes monotonic `stateVersion` to avoid stale client overwrites.

## Scoring and tie-breaker

Round scoring:
- If suspect gets most votes:
  - every non-suspect who voted suspect: `+2`
  - suspect: `0`
- If suspect avoids top votes:
  - suspect: `+3`
  - each player with top-voted alibi: `-1` floor-capped at `0` total score
- Challenge bonus:
  - `+1` to challenger if target later receives at least `2` votes.

Tie-breaker order:
1. Higher total score
2. More correct suspicious votes
3. Fewer abstains/timeouts
4. Stable join-order fallback (deterministic)

## MVP implementation checklist

Engine and state:
- [ ] Add `lib/games/alibi-night-game.ts` implementing `GameEngine`.
- [ ] Define `AlibiNightGameState` with explicit phase union + deadlines.
- [ ] Add deterministic prompt selection helper with seeded RNG.

Validation and actions:
- [ ] Add `lib/validation/alibi-night.ts` for payload schema and text constraints.
- [ ] Add `/api/game/[gameId]/alibi-night-action/route.ts` with strict phase checks.
- [ ] Add anti-spam rate limiting integration for action endpoint.

Realtime:
- [ ] Broadcast state snapshots through existing socket room channel.
- [ ] Add reconnect-safe state hydration path in lobby page hook.
- [ ] Ensure timeout auto-actions are idempotent under reconnect races.

Client UX:
- [ ] Add lobby/game renderer for phase UI (submit, challenge, vote, resolution).
- [ ] Add per-phase timer blocks and completion indicators.
- [ ] Add localized fallback labels for auto-filled actions.

Tests:
- [ ] Unit tests for phase transitions and scoring matrix.
- [ ] Validation tests for payload limits and rejection paths.
- [ ] API tests for auth/guest action acceptance and duplicate no-op handling.
- [ ] Reconnect/timeout tests for deterministic auto-progress.

## Integration notes

- Keep server-authoritative flow: client optimistic updates are visual only.
- Do not introduce any new `JWT_SECRET` path; use existing auth + `NEXTAUTH_SECRET` model.
- Guest actions must remain signed-token based (`X-Guest-Token`) and never raw client IDs.
