# Game Development Playbook

This page is the canonical checklist for adding or promoting Boardly games.
Keep it short, current, and source-of-truth oriented.

## Source of truth

Game availability is defined in `lib/game-catalog.ts`.

Use this file first when a game changes lifecycle state:

- `available` - players can discover and play it in public UI.
- `in-development` - implemented or partially implemented, but not generally available.
- `planned` - visible as product direction only; no playable route is required.

Related files have narrower responsibilities:

- `lib/game-registry.ts` - runtime game engine registration and bot support.
- `prisma/schema.prisma` - persisted `GameType` enum and database compatibility.
- `lib/public-game-access.ts` - public lobby route access derived from availability.
- `components/PlayerStatsDashboard.tsx` - game-specific presentation of user stats.

Do not introduce another hardcoded list of public games. Import from the catalog or extend
the catalog helper API instead.

## Promoting a game to available

Before changing a game to `available`, verify:

1. Gameplay is server-authoritative and persisted through the normal API -> DB -> socket flow.
2. Lobby creation, lobby listing, join, reconnect, finish, and terminal redirects work.
3. The game has translations for every active locale.
4. Profile statistics use metrics that make sense for that game.
5. Achievements have been considered, even if the first decision is "not yet".
6. Replay/recovery behavior has been considered and documented for the game.
7. Tests cover core rules, invalid actions, completion, and any timer/auto-action behavior.
8. The game appears in `lib/game-catalog.ts` with the correct lifecycle state and route.

## New game checklist

When adding a new game, update or add:

- Prisma `GameType` enum when persistence needs a new type.
- `lib/game-catalog.ts` catalog entry and lifecycle state.
- `lib/game-registry.ts` runtime metadata and engine registration.
- `lib/games/*` game engine implementation.
- Lobby create settings and public route access.
- Lobby/game UI route and board components.
- Socket/API action handling where needed.
- Locale strings in all active locales.
- Game-specific profile statistics presentation.
- Achievement definitions or an explicit "not yet" note.
- Replay/recovery plan for finished game state.
- Unit tests for game rules and integration tests for lobby/game flow where practical.

## Statistics expectations

Stats must match the shape of the game.

Examples:

- Yahtzee should emphasize score metrics such as average score and best score.
- Tic-Tac-Toe should emphasize outcomes, draw rate, and unbeaten rate rather than score.
- Memory can combine win/loss outcomes with score/performance metrics.
- Social deduction games should focus on completed rounds and outcomes unless role-specific
  stats are available from the backend.

If the current stats API does not expose the right data, do not fake precision in the UI.
Show the best available aggregate now, then add backend fields in a dedicated change.

## Replay expectations

Every new game should define what a replay means before it becomes broadly available:

- minimum finished-state snapshot needed for a useful replay
- whether hidden information must remain hidden after the game
- retention or privacy caveats
- recovery behavior after refresh/reconnect

`Games.state` remains the source of truth for replay and recovery data.

## Documentation rule

When a game lifecycle or platform-level game decision changes, update this playbook if the
decision changes the checklist or source-of-truth model. Do not create a one-off planning
document unless the game needs a larger design spec.
