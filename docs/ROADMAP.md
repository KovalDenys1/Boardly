# Roadmap

## Current focus (Q1-Q2 2026)

1. Realtime reliability
- Eliminate race conditions in timers and auto-actions.
- Harden reconnect + state reconciliation behavior.
- Improve handling of disconnects during active turns.

2. Security hardening
- Keep guest identity token-based (`X-Guest-Token`) only.
- Use `NEXTAUTH_SECRET` as primary signing secret.
- Finalize and validate RLS rollout with staged deployment checks.

3. Game platform expansion
- Stabilize newly added simple games.
- Ship next low-complexity multiplayer game from backlog.
- Keep each new game within shared `GameEngine` and lobby/socket architecture.

4. Product polish
- Mobile gameplay quality and latency perception.
- Better game-state error visibility and rollback UX.
- Incremental profile/social improvements.

## Backlog direction

- Additional casual games with short session loops.
- Spectator/replay capabilities.
- Notifications and re-engagement loops.
- Monetization only after reliability and retention targets are stable.

## Tracking source of truth

Execution tracking lives in GitHub Issues/Projects. This file is direction-level only.
