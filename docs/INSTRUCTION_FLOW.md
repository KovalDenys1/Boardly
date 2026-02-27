# Boardly Instruction Flow

## Goal
Help first-time players understand game basics without blocking gameplay.

## Final Placement
1. Pre-join (`/lobby`): show a compact "How to Play" section before filters and lobby list.
2. Waiting room (`/lobby/[code]`): show quick game-specific tips while players gather.
3. In-game: keep contextual prompts only (turn hints, action hints), no long instruction blocks.

## UX Rules
1. Instructions must be discoverable before joining a lobby.
2. Instructions must stay concise (2 shared steps + game-specific quick rule).
3. Instructions must not interrupt active turns or force modal completion.
4. If a game filter is selected, prioritize that game's quick rule.

## Current Implementation
1. `/lobby` now renders:
   - shared guidance (`howToPlayReady`, `howToPlayStart`)
   - game-specific quick rules for all games, or a focused rule for the selected game filter
2. `/lobby/[code]` waiting room already renders game-specific "How to Play" hints.

This flow keeps onboarding accessible while preserving uninterrupted gameplay.
