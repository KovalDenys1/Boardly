# Realtime Telemetry

This document defines reconnect telemetry for Boardly and the minimum dashboards/SLOs for production monitoring.

## Scope

- Source events: `lib/analytics.ts`
- Source emitters: `app/lobby/[code]/hooks/useSocketConnection.ts`
- Focus: reconnect reliability, lobby rejoin reliability, and auth refresh failures

## Sampling and Privacy

- Sample rate: `25%` (`REALTIME_TELEMETRY_SAMPLE_RATE` in `lib/analytics.ts`)
- No PII in payloads
- Client telemetry is best-effort and can be dropped by network/ad blockers

## Event Catalog

| Event | Emitted when | Key fields |
| --- | --- | --- |
| `socket_reconnect_attempt` | Socket emits `reconnect_attempt` | `attempt`, `backoff_ms`, `is_guest`, `transport`, `reason` |
| `lobby_join_retry` | Client schedules `JOIN_LOBBY` retry | `attempt`, `delay_ms`, `trigger`, `is_guest` |
| `lobby_join_ack_timeout` | `JOINED_LOBBY` not received before timeout | `attempt`, `is_guest` |
| `socket_auth_refresh_failed` | Token refresh/auth payload resolution fails | `stage`, `status`, `is_guest` |
| `socket_reconnect_recovered` | Reconnect flow recovered and lobby rejoin confirmed | `attempts_total`, `time_to_recover_ms`, `is_guest` |
| `socket_reconnect_failed_final` | Reconnect flow reached terminal failure | `attempts_total`, `reason`, `is_guest` |

`socket_reconnect_failed_final.reason` values:

- `reconnect_failed`
- `authentication_failed`
- `rejoin_timeout`

## Dashboard (Minimum)

Create one dashboard with these cards:

1. Reconnect success ratio

- Formula: `recovered / (recovered + failed_final)`
- Group by `is_guest`

1. Recovery latency

- `time_to_recover_ms` from `socket_reconnect_recovered`
- Track P50 and P95

1. Join ack timeout rate

- Count of `lobby_join_ack_timeout`
- Breakdown by `attempt` and `is_guest`

1. Auth refresh failure rate

- Count of `socket_auth_refresh_failed`
- Breakdown by `stage` and `status`

1. Final failures by reason

- Count of `socket_reconnect_failed_final`
- Breakdown by `reason`

1. Reconnect pressure

- Count of `socket_reconnect_attempt`
- Breakdown by `attempt` bucket and `transport`

## SLO and Alert Baseline

Initial SLO targets:

- Reconnect success ratio >= `99%` (rolling 24h)
- Recovery latency P95 <= `12s` (rolling 24h)
- Final reconnect failure <= `1%` of reconnect cycles (rolling 24h)

Initial alert thresholds:

- `socket_reconnect_failed_final` spikes above baseline for 10+ minutes
- Recovery latency P95 above `15s` for 10+ minutes
- `socket_auth_refresh_failed` ratio above `2%` for 10+ minutes

## Troubleshooting Map

If `rejoin_timeout` grows:

- Check socket server health and room join latency
- Check `join-lobby` handler DB lookups and player membership checks

If `authentication_failed` grows:

- Check `/api/socket/token` response status trends
- Check `NEXTAUTH_SECRET`, session validity, and auth provider status

If `reconnect_failed` grows:

- Check socket server uptime/cold starts and network errors
- Check deploy windows and infra incidents

## Review Cadence

- Daily: quick check for spikes
- Weekly: compare guest vs authenticated reliability
- Before release: verify no regression vs last 7-day baseline
