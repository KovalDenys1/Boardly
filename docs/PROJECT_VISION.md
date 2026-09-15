# Project Vision

## Product goal

Build Boardly into the most reliable low-friction place to play short multiplayer games with friends and guests.

## Target experience

- Start a game in under 30 seconds.
- Join via link/code without onboarding friction.
- Keep gameplay fair and synchronized even on unstable networks.
- Make social play first-class (friends, invites, chat, presence).

## Core principles

- **Reliability before novelty**: no feature should regress turn integrity, scoring correctness, or state sync.
- **Server-authoritative game state**: client can be optimistic for UX, but final state comes from server snapshots.
- **Fast iteration via shared game framework**: new games should reuse the `GameEngine` contract, the shared lobby and realtime infrastructure, and the `components/game-chrome/` kit.
- **Security by default**: signed guest identity, strict auth boundaries, defensive API validation, and DB safety net.
- **Mobile-first playability**: every game and lobby flow must be usable on mobile without degraded controls.

## Product strategy (2026)

- Expand catalog with simple, high-retention games first.
- Harden realtime infrastructure (disconnects, reconnects, cold-start behavior).
- Improve social loops (friend invites, return play, notifications).
- Keep monetization optional: Premium is a subscription for cosmetics and an ad-free site, never a gate on a game.

## Non-goals right now

- Complex AAA game engines.
- Heavy platform lock-in or over-engineered microservices.
- Feature breadth that sacrifices gameplay correctness.
