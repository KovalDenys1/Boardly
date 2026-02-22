# Realtime Telemetry and Operational Alerts

This document defines the production reliability telemetry path, alert rules, KPI dashboard metrics, and the load-run workflow for Boardly.

## Scope

- Source emitters:
  - `lib/analytics.ts`
  - `app/lobby/[code]/hooks/useSocketConnection.ts`
  - `app/lobby/[code]/hooks/useLobbyActions.ts`
- Ingestion API: `POST /api/ops/events`
- Storage:
  - `OperationalEvents` (telemetry events)
  - `OperationalAlertStates` (alert open/close state, dedupe)
- Alert executor:
  - Script: `npm run ops:alerts:check`
  - Cron endpoint: `GET /api/cron/reliability-alerts`
  - Scheduler (Hobby-safe): `.github/workflows/reliability-alerts-cron.yml` (`*/10 * * * *`)

## Event Catalog (Operational)

| Event | Purpose | Key fields |
| --- | --- | --- |
| `rejoin_timeout` | Alert signal: reconnect ended with lobby rejoin timeout | `attempts_total`, `is_guest` |
| `auth_refresh_failed` | Alert signal: socket token refresh/payload auth failed | `stage`, `status`, `is_guest` |
| `move_apply_timeout` | Alert signal: move apply latency breached target | `game_type`, `latency_ms`, `target_ms`, `is_guest` |
| `move_submit_applied` | KPI latency source for submit -> applied | `game_type`, `latency_ms`, `success`, `applied` |
| `lobby_create_ready` | KPI latency source for create -> lobby ready | `game_type`, `latency_ms`, `target_ms` |
| `socket_reconnect_recovered` | KPI source for reconnect recovery latency | `attempts_total`, `time_to_recover_ms`, `is_guest` |
| `socket_reconnect_failed_final` | KPI source for reconnect success ratio denominator | `attempts_total`, `reason`, `is_guest` |
| `start_alone_auto_bot_result` | KPI source for start-alone -> auto-bot reliability | `game_type`, `success`, `reason`, `is_guest` |

## Alert Delivery

Set webhook channel and alert windows in env:

- `OPS_ALERT_WEBHOOK_URL`
- `OPS_ALERT_WINDOW_MINUTES` (default: `10`)
- `OPS_ALERT_BASELINE_DAYS` (default: `7`)
- `OPS_ALERT_REPEAT_MINUTES` (default: `60`)
- `OPS_RUNBOOK_BASE_URL` (optional; used to build absolute runbook links)

Supported channels: Slack/Discord/Teams webhook endpoints.

Scheduler note:
- Vercel Hobby only supports cron jobs that run once per day.
- Use the GitHub Actions scheduler (`.github/workflows/reliability-alerts-cron.yml`) for 10-minute reliability alert checks on Hobby.
- Vercel cron for `/api/cron/reliability-alerts` is only suitable on plans that support sub-daily cron intervals.

## Active Alert Rules

Rules are evaluated in `evaluateReliabilityAlerts()` (`lib/operational-metrics.ts`) and dispatched by `runReliabilityAlertCycle()` (`lib/reliability-alerts.ts`).

1. `rejoin_timeout` spike
- Severity: `critical`
- Condition: current window count >= `max(2, baseline_per_window * 3)`
- Window: `OPS_ALERT_WINDOW_MINUTES`

1. `auth_refresh_failed` ratio
- Severity: `warning`
- Condition: `auth_refresh_failed / reconnect_cycles >= 2%` for windows with >= 5 reconnect cycles
- Window: `OPS_ALERT_WINDOW_MINUTES`

1. `move_apply_timeout` spike or latency breach
- Severity: `warning` (count spike), `critical` (latency breach)
- Condition A: current timeout count >= `max(3, baseline_per_window * 3)`
- Condition B: `move_submit_applied` p95 > `MOVE_APPLY_TARGET_MS` (`800ms`)
- Window: `OPS_ALERT_WINDOW_MINUTES`

## KPI Dashboard (Operational)

Operational KPI data is shown in:

- `/analytics` page (server-rendered section: "Operational Reliability")
- `GET /api/analytics/operations`
- CLI report: `npm run ops:kpi:report`

Tracked KPIs:

1. `move submit -> applied p95` (per game)
1. `create lobby -> ready p95` (per game)
1. `reconnect success ratio` (global)
1. `reconnect recovery p95` (global)
1. `start alone -> auto bot success ratio` (per game)

## SLO Targets (Baseline + Operational)

Targets are encoded in `lib/operational-metrics.ts`:

- Move submit -> applied p95 <= `800ms`
- Create lobby -> ready p95 <= `2500ms`
- Reconnect success ratio >= `99%`
- Reconnect recovery p95 <= `12000ms`
- Start alone -> auto bot success ratio >= `99.5%`

Baseline is computed from the previous `baselineDays` window (default 7 days), separate from the current reporting window.

## Runbook

<a id="runbook-rejoin-timeout"></a>
### If `rejoin_timeout` breaches

- Check Socket.IO service health and deploy/cold-start windows
- Check lobby join ACK behavior in `useSocketConnection` and socket room authorization
- Check DB latency on lobby/member queries

<a id="runbook-auth-refresh-failed"></a>
### If `auth_refresh_failed` breaches

- Check `/api/socket/token` status trend (`401`/`403`/`5xx`)
- Check auth secret/session validity (`NEXTAUTH_SECRET`, provider state)
- Check token refresh path in `useSocketConnection` (`token_fetch`, `socket_auth_payload`)

<a id="runbook-move-apply-timeout"></a>
### If `move_apply_timeout` breaches

- Check `/api/game/[gameId]/state` p95 and DB lock/contention
- Check by game breakdown (`game_type`) in operational KPI table
- Check socket broadcast lag after successful mutation

## Execution Commands

Manual alert evaluation:

```bash
npm run ops:alerts:check
```

Dry-run alert evaluation:

```bash
npm run ops:alerts:check -- --dry-run
```

KPI report:

```bash
npm run ops:kpi:report -- --hours=24 --baseline-days=7
```

Load run with fail-rate report:

```bash
npm run ops:load -- --iterations=80 --concurrency=12 --game-type=tic_tac_toe --report-path=reports/ops-load.json
```
