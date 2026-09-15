# Discord

Boardly has a community Discord server with a bot on a Raspberry Pi. The server definition,
the bot and its deploy scripts live in a separate `boardly-discord` project; this page covers
the site's side: what talks to what, which variable each path needs, and where every value is
set. Nothing in this repo holds the bot token.

## What talks to what

| From | To | How | Code here |
| --- | --- | --- | --- |
| Site | staff feedback channel | `FEEDBACK_DISCORD_WEBHOOK_URL`, one embed per submission | `app/api/feedback/route.ts` |
| Site | staff ops channel | `OPS_ALERT_WEBHOOK_URL`, reliability alerts as embeds | `lib/reliability-alerts.ts` |
| Visitor | Discord | `/discord` 302s to `NEXT_PUBLIC_DISCORD_INVITE` | `app/discord/route.ts`, `lib/discord.ts` (#938) |
| Discord | Site | OAuth sign-in with `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | `lib/next-auth.ts` |
| Bot (Pi) | Site | `GET /api/internal/discord/members/{snowflake}`, `Authorization: Bearer DISCORD_INTERNAL_SECRET` | `app/api/internal/discord/members/[snowflake]/route.ts` (#940) |
| Bot (Pi) | Site | `POST /api/internal/discord/heartbeat` every 5 minutes, same bearer | `app/api/internal/discord/heartbeat/route.ts` (#940) |
| Bot (Pi) | Site | `GET /api/lobby?status=all` every 30 s for the looking-for-players feed, plus Supabase Realtime | none - the public lobby list, no secret |
| Site | Discord API | Linked Roles push to `/users/@me/applications/{DISCORD_APPLICATION_ID}/role-connection` | `lib/discord/role-connection.ts` (#939) |
| GitHub | releases channel | Discord's own `/github` webhook on the Boardly repo | none |
| Control panel | news channel | announcement mirror, `ANNOUNCEMENTS_DISCORD_WEBHOOK_URL` | none - `Boardly-control-panel` |
| Cloud routines | growth channel | `GROWTH_DISCORD_WEBHOOK_URL` | none |

Both outbound webhook paths post a Discord embed (`{ "embeds": [ ... ] }`), so
`FEEDBACK_DISCORD_WEBHOOK_URL` and `OPS_ALERT_WEBHOOK_URL` both have to be Discord channel
webhooks. A Slack or Teams webhook rejects that payload.

Every one of the site's variables is optional. With none of them set the site still runs:
feedback is stored but not mirrored, alerts are still evaluated and logged instead of posted,
`/discord` redirects to the invite compiled into `lib/discord.ts`, and the internal routes
answer 503.

`lib/discord.ts` (#938) is the only place that knows the invite behind `/discord`, so rotating
a leaked or expired one is a single value change. `NEXT_PUBLIC_DISCORD_INVITE` is public and
inlined into the bundle at build time: a new invite needs a rebuild, not just a restart, and
the value is readable by anyone who loads the site – as a public invite link it is meant to be.

## The internal routes

`lib/discord/internal-auth.ts` (#940) is `lib/cron-auth.ts` on its own secret, deliberately
not a reuse of `CRON_SECRET`: a secret that leaks off the Pi must not also fire every cron job.
`proxy.ts` gates `/api/internal/discord/*` on the same bearer and counts a request carrying it
as a trusted server request, which is what lets the heartbeat POST through the CSRF check
without an `Origin` header.

- 503 when `DISCORD_INTERNAL_SECRET` is unset, 401 on a missing or wrong bearer
- both routes are rate limited at 60 requests per minute per IP
- the member lookup answers `{ "linked": false }` for a malformed id, an id nobody has linked,
  a guest or suspended account, and any account whose `profileVisibility` is not `public`, so
  `/stats` in Discord shows exactly what the public profile page shows
- the heartbeat ignores its body and answers `{ "success": true, "recordedAt": ... }`. The bot
  sends one anyway; only the freshness of the row is read

The bot never holds database credentials. Everything it knows about a member comes through the
member route.

A heartbeat lands as a `cron_run` row in `OperationalEvents` with `source = "discord-bot"`.
The `discord_bot_stale` reliability rule (#944) reads its age: warning after 20 minutes,
critical after 60, delivered through the same webhook and GitHub issue path as every other
rule. A bot that has never sent one does not breach, so the rule stays quiet until the bot has
run once. Runbook: `docs/OPERATIONS.md#runbook-discord_bot_stale`.

## Secret map

Names only. Values live where the row says and nowhere else.

| Variable | Vercel (Boardly) | Pi `/home/denys/.boardly-discord.env` | Elsewhere |
| --- | --- | --- | --- |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | yes | | |
| `DISCORD_APPLICATION_ID` | yes | yes | Mac `~/.boardly-discord.env` |
| `DISCORD_INTERNAL_SECRET` | yes | yes, the same value | |
| `NEXT_PUBLIC_DISCORD_INVITE` | Production and Preview | | |
| `FEEDBACK_DISCORD_WEBHOOK_URL` | yes | | |
| `OPS_ALERT_WEBHOOK_URL` | yes | | GitHub Actions secret, if the scheduler runs the check |
| `CRON_SECRET` | yes | | GitHub Actions secret |
| `DISCORD_BOT_TOKEN` | | yes | Mac `~/.boardly-discord.env` |
| `DISCORD_GUILD_ID` | | yes | Mac `~/.boardly-discord.env` |
| `BOARDLY_BASE_URL` | | yes | |
| `STAFF_BOT_WEBHOOK_URL` | | yes | |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | | yes, read-only for Realtime | |
| `ANNOUNCEMENTS_DISCORD_WEBHOOK_URL` | | | Vercel, control panel |
| `GROWTH_DISCORD_WEBHOOK_URL` | | | cloud routines |
| `DISCORD_ROLE_SYNC_CRON_URL` | | | GitHub Actions secret |

Every webhook URL in that list is a secret, as is `DISCORD_CLIENT_SECRET`,
`DISCORD_INTERNAL_SECRET`, `CRON_SECRET`, `DISCORD_BOT_TOKEN` and the Supabase key. The
client id, the application id, the guild id, the invite and the base URL are public.

None of the values live in the repo. `.env.example` carries placeholders, and
`npm run check:env` lists the site's variables under optional, reporting the webhook URLs and
the internal secret as `[set]` without printing any of the value.

## Webhooks

A Discord channel webhook URL is `https://discord.com/api/webhooks/<id>/<token>`: anyone
holding the URL can post into that channel, and the token is part of it. Treat the whole URL
as a secret.

- Create or rotate one in Server Settings -> Integrations -> Webhooks, then update the Vercel
  variable and redeploy.
- Deleting a channel deletes the webhooks that point at it. The two channels behind
  `FEEDBACK_DISCORD_WEBHOOK_URL` and `OPS_ALERT_WEBHOOK_URL` are renamed and moved, never
  deleted.
- Rotating the URL is the only revocation. There is no per-webhook audit log.

Rotating `DISCORD_INTERNAL_SECRET`: set the new value in Vercel Production, redeploy, then
update the Pi env file and `systemctl restart boardly-discord`. The bot's next heartbeat
proves the pair, and `discord_bot_stale` says within 20 minutes if it did not.

## Verifying

```bash
npm run check:env                          # the Discord variables appear under Optional
npm run ops:alerts:check -- --dry-run      # discord_bot_stale appears in the rules
curl -i -H "Authorization: Bearer $DISCORD_INTERNAL_SECRET" \
  https://boardly.online/api/internal/discord/members/000000000000000000   # {"linked":false}
curl -i -X POST -H "Authorization: Bearer $DISCORD_INTERNAL_SECRET" \
  https://boardly.online/api/internal/discord/heartbeat                    # {"success":true,...}
```

## Local development

Every variable on this page is optional, so a local checkout with none of them set runs fine.

- To exercise the feedback embed, make a webhook in a private test server and put it in
  `.env.local` as `FEEDBACK_DISCORD_WEBHOOK_URL`. Never point a local checkout at a production
  channel.
- The internal routes answer 503 until `DISCORD_INTERNAL_SECRET` is set locally too.

## Related

- `docs/OPERATIONS.md` - environment setup and the `discord_bot_stale` runbook
- `docs/REALTIME_TELEMETRY.md` - the events the reliability alerts are built on
- `.env.example` - placeholders for every site variable above
