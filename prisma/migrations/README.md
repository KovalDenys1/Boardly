# Prisma Migrations

This directory contains the database migration history for Boardly.

The migration SQL files are the source of truth. This README is an orientation index for humans and should be updated when a migration adds a new domain area, security posture, or operational workflow.

## Migration timeline

### Historical pre-baseline migrations

The `202512...` migrations are retained because they are part of the applied history in existing environments. They cover early user profile/statistics work, game lifecycle fields, friend codes, cleanup of unused models, spy locations, and guest tracking fields.

### `20260212000000_init`

Squashed baseline schema for the modern Boardly database.

Main domains:

- Users, auth/session tables, and verification/reset tokens
- Bots as a one-to-one relation from `Users`
- Lobbies, games, players, and game lifecycle state
- Friend requests, friendships, lobby invites, and spy locations
- Core enums for game status and game type

### `20260212000001_enable_rls`

Initial Row Level Security setup.

- Adds helper functions for current-user/auth checks.
- Enables RLS on application tables.
- Grants app roles and baseline access policies.

### `20260216000000_add_lobby_invites`

Adds lobby invite storage and supporting social invite indexes.

### `20260218...` RLS cleanup and repair

Supabase linter and baseline policy repair migrations:

- `20260218000000_rls_linter_cleanup`
- `20260218010000_rls_baseline_policy_repair`

These migrations tighten helper functions, service-role policies, `_prisma_migrations` RLS handling, and baseline app access policies.

### `20260221000000_add_operational_observability_tables`

Adds operational reliability storage:

- `OperationalEvents`
- `OperationalAlertStates`

These tables back reconnect/move-latency telemetry, alert dedupe, and KPI reporting.

### `20260225...` lobby spectators and notification foundations

Adds spectator support and notification preference/storage tables:

- `20260225000100_add_lobby_spectators`
- `20260225000300_add_notification_preferences`
- `20260225000400_add_notifications_table`

### `20260226...` notification, auth, and social hardening

Hardens notification RLS, auth foreign-key indexes, social pair integrity, and `Users` select policies:

- `20260226213000_harden_notifications_ops_rls_and_auth_fk_indexes`
- `20260226223500_enforce_social_pair_integrity`
- `20260226231000_consolidate_users_select_policies`

### `20260227...` admin, memory, and replay snapshots

Adds admin role/suspension fields, the `memory` game type, and replay/state snapshot storage:

- `20260227101500_add_users_role_and_suspended_columns`
- `20260227193000_add_memory_game_type`
- `20260227201000_add_game_replay_snapshots`

### `20260228004500_harden_rls_enums_timestamptz_admin_audit`

Adds admin audit logging and hardens RLS/enums/timestamp usage.

### `20260309...` game schema expansion

`20260309121500_harden_games_schema_and_expand_game_types` expands supported game metadata and game type values for newer party-game work.

### `20260310...` profile and email fields

Adds pending-email and public-profile identifiers:

- `20260310174000_add_pending_email_to_users`
- `20260310183000_add_public_profile_id`

### `20260311...` in-app notification refinements

Adds/refines in-app notification preference fields:

- `20260311101500_add_in_app_notifications`
- `20260311124500_add_in_app_notification_preference`

### `20260312...` account preferences

Adds account preferences, profile visibility, and online-status preference fields:

- `20260312110000_add_account_preferences`
- `20260312123000_add_show_online_status_to_account_preferences`

### `20260325...` match timing and game type cleanup

Adds match timing metadata and removes old `chess`/`uno` enum values:

- `20260325000000_add_match_timing_metadata`
- `20260325120000_remove_chess_uno_from_gametype`

### `20260328...` feedback

`20260328000000_add_feedback_table` adds user feedback storage.

### `20260331...` onboarding

`20260331000000_add_onboarding_fields` adds onboarding completion/skip fields.

### `20260402...` account preferences and feedback RLS

`20260402000000_enable_rls_account_preferences_feedback` enables RLS and policies for the account preferences and feedback tables.

### `20260403...` alias

`20260403000000_add_alias_game_type` adds the `alias` game type.

### `20260422...` alert GitHub issue links

`20260422000000_add_github_issue_number_to_alert_states` adds `githubIssueNumber` to `OperationalAlertStates` so reliability alerts can open/close linked GitHub issues.

## Row Level Security

RLS is part of the database safety model:

- Service role has backend access for trusted server operations.
- Users are scoped to their own identity, preferences, notifications, and social data where appropriate.
- Game and lobby data is scoped through creator/member/player relationships.
- Operational/admin tables use service/admin-oriented policies.

Use `npm run db:rls:smoke` after changing any RLS policy, helper function, or table that is covered by RLS.

## Running migrations

### Development

Create new migrations with Prisma's development command when a schema change needs migration SQL:

```bash
npx prisma migrate dev
```

For local schema sync without creating a migration:

```bash
npm run db:push
```

### Production or deploy-style local checks

```bash
npm run db:migrate
```

`npm run db:migrate` prepares the required RLS roles before running `prisma migrate deploy`.

Check migration status:

```bash
npm run db:migrate:status
```

### RLS smoke tests

```bash
npm run db:rls:smoke
```
