# Discord

Boardly has a community Discord server. This page maps every path in this repo that talks to
Discord, the environment variable each one needs, and where that value is set.

The server itself – the channel and role definition, the apply and verify scripts, the gateway
bot and its Raspberry Pi systemd unit – lives outside this repo, in the `boardly-discord`
project. Nothing here reads the bot token.

## What talks to what

| Path in this repo | Direction | Variable | Unset |
| --- | --- | --- | --- |
| `app/api/feedback/route.ts` | out | `FEEDBACK_DISCORD_WEBHOOK_URL` | feedback is still stored; no embed is posted |
| `lib/reliability-alerts.ts`, reached by `GET /api/cron/reliability-alerts` and `npm run ops:alerts:check` | out | `OPS_ALERT_WEBHOOK_URL` | alert state still changes; a warning is logged instead of a post |
| `lib/next-auth.ts` | in | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | the Discord provider is not registered, so no Discord button renders |

Both outbound paths post a Discord embed (`{ "embeds": [ ... ] }`), so both variables have to be
Discord channel webhooks. A Slack or Teams webhook rejects that payload.

The community server also brings three variables that no code in this repo reads yet:
`DISCORD_INVITE_URL` (the `/discord` redirect, issue #938), `DISCORD_APPLICATION_ID`
(Linked Roles, issue #939) and `DISCORD_INTERNAL_SECRET` (the internal read-only routes the
bot calls, issue #940). They are listed here and in `.env.example` so the map is complete
when those land.

## Secret map

| Variable | Secret | Where it is set | Notes |
| --- | --- | --- | --- |
| `DISCORD_CLIENT_ID` | no | Vercel, all environments | OAuth client id from the Discord developer portal |
| `DISCORD_CLIENT_SECRET` | yes | Vercel, all environments | same application as the client id |
| `FEEDBACK_DISCORD_WEBHOOK_URL` | yes | Vercel, Production | the embed carries the reporter's email, so the target channel is staff-only |
| `OPS_ALERT_WEBHOOK_URL` | yes | Vercel, Production | reliability alerts; also read by `npm run ops:alerts:check` locally |
| `DISCORD_INVITE_URL` | no | Vercel, Production and Preview | the public invite link |
| `DISCORD_APPLICATION_ID` | no | Vercel, Production | the same application as `DISCORD_CLIENT_ID` |
| `DISCORD_INTERNAL_SECRET` | yes | Vercel Production **and** the bot's env file on the Pi | the only value the two repos share; generate with `openssl rand -base64 32` |

None of these values live in the repo. `.env.example` carries placeholders, and
`npm run check:env` lists all of them under optional, reporting the three credential-bearing
ones as `[set]` without printing any of the value.

The bot's own variables (`DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `BOARDLY_BASE_URL`, its
Supabase read credentials) belong to `boardly-discord` and are documented in that project's
`pi/README.md`. They are never set on Vercel.

## Webhooks

A Discord channel webhook URL is `https://discord.com/api/webhooks/<id>/<token>`: anyone holding
the URL can post into that channel, and the token is part of it. Treat the whole URL as a secret.

- Create or rotate one in Server Settings -> Integrations -> Webhooks, then update the Vercel
  variable and redeploy.
- Deleting a channel deletes the webhooks that point at it. The two channels behind
  `FEEDBACK_DISCORD_WEBHOOK_URL` and `OPS_ALERT_WEBHOOK_URL` are renamed and moved, never
  deleted.
- Rotating the URL is the only revocation. There is no per-webhook audit log.

## Local development

Every variable on this page is optional, so a local checkout with none of them set runs fine.

- `npm run check:env` shows which are set.
- To exercise the feedback embed, make a webhook in a private test server and put it in
  `.env.local` as `FEEDBACK_DISCORD_WEBHOOK_URL`. Never point a local checkout at a production
  channel.
- `npm run ops:alerts:check -- --dry-run` evaluates the alert rules without posting anything.

## Related

- `docs/OPERATIONS.md` - environment setup and the reliability-alert runbook
- `docs/REALTIME_TELEMETRY.md` - the events those alerts are built on
- `.env.example` - placeholders for every variable above
