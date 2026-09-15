import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'

/**
 * Discord Linked Roles (#939).
 *
 * A Discord server role can be gated on metadata that the application writes onto the user's
 * connection: `PUT /users/@me/applications/{id}/role-connection`. The write uses the USER's
 * OAuth token (scope `role_connections.write`), never the bot token, so everything here runs
 * off the `Accounts` row NextAuth stores at sign-in.
 *
 * Two facts shape the code:
 * - `lib/custom-prisma-adapter.ts` `linkAccount` is the only writer of the OAuth tokens and
 *   fires once, when the row is created. `lib/next-auth.ts` `signIn` now refreshes the row on
 *   every OAuth sign-in, but a row linked before the scope was added still carries the legacy
 *   `identify email` scope until the user goes through /discord/link again. Such rows are
 *   skipped with a logged reason, never pushed.
 * - Discord access tokens expire after 7 days and NextAuth does not refresh them. The refresh
 *   here happens lazily, one minute before expiry, and is written back to the row.
 *
 * Nothing in this module throws to its caller: unlink, delete-account and the Stripe webhook
 * call it on their way to something more important, and a Discord hiccup must not block that.
 */

const log = apiLogger('discord/role-connection')

export const DISCORD_ROLE_CONNECTION_SCOPE = 'role_connections.write'
export const DISCORD_PLATFORM_NAME = 'Boardly'

const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token'
const DISCORD_API_BASE = 'https://discord.com/api/v10'
const REFRESH_SKEW_MS = 60 * 1000
const PLATFORM_USERNAME_MAX = 100

export type RoleConnectionMetadata = {
  premium: '0' | '1'
  games_played: string
  member_since: string
  verified: '0' | '1'
}

export type RoleConnectionSkipReason =
  | 'no_discord_account'
  | 'legacy_scope'
  | 'no_token'
  | 'not_configured'

export type RoleConnectionResult =
  | { status: 'pushed'; metadata: RoleConnectionMetadata }
  | { status: 'cleared' }
  | { status: 'skipped'; reason: RoleConnectionSkipReason }
  | { status: 'revoked' }
  | { status: 'failed'; reason: string }

export type DiscordAccountRow = {
  id: string
  userId: string
  access_token: string | null
  refresh_token: string | null
  expires_at: number | null
  scope: string | null
}

export type DiscordConfig = {
  clientId: string
  clientSecret: string
  applicationId: string
}

type RoleConnectionBody = {
  platform_name: string
  platform_username?: string
  metadata: RoleConnectionMetadata | Record<string, never>
}

class RevokedTokenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RevokedTokenError'
  }
}

export function hasRoleConnectionScope(scope: string | null | undefined): boolean {
  if (!scope) return false
  return scope.split(/\s+/).includes(DISCORD_ROLE_CONNECTION_SCOPE)
}

/** True when the row can be pushed at all: right scope and a token to refresh or use. */
export function isRoleConnectionReady(row: {
  scope: string | null
  access_token: string | null
  refresh_token: string | null
}): boolean {
  return hasRoleConnectionScope(row.scope) && Boolean(row.access_token || row.refresh_token)
}

function getDiscordConfig(): DiscordConfig | null {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim()
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim()
  // The Linked Roles metadata and the OAuth grant must belong to the same application; the
  // application id is the client id, but it is its own variable so the plan's env list matches.
  const applicationId = (process.env.DISCORD_APPLICATION_ID ?? clientId)?.trim()
  if (!clientId || !clientSecret || !applicationId) return null
  return { clientId, clientSecret, applicationId }
}

function isPremium(premiumUntil: Date | null): boolean {
  return premiumUntil instanceof Date && premiumUntil.getTime() > Date.now()
}

export function buildRoleConnectionMetadata(user: {
  premiumUntil: Date | null
  emailVerified: Date | null
  createdAt: Date
  gamesPlayed: number
}): RoleConnectionMetadata {
  // Discord's metadata values are strings whatever the declared type: BOOLEAN_EQUAL reads
  // "1"/"0", INTEGER_GTE a decimal string, DATETIME_LTE an ISO 8601 timestamp.
  return {
    premium: isPremium(user.premiumUntil) ? '1' : '0',
    games_played: String(Math.max(0, Math.floor(user.gamesPlayed))),
    member_since: user.createdAt.toISOString(),
    verified: user.emailVerified ? '1' : '0',
  }
}

async function findDiscordAccount(userId: string): Promise<DiscordAccountRow | null> {
  return prisma.accounts.findFirst({
    where: { userId, provider: 'discord' },
    select: {
      id: true,
      userId: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
      scope: true,
    },
  })
}

/**
 * Discord answered that the grant is gone (user revoked the app, token invalid). Drop the
 * tokens so the nightly sync skips the row as `no_token` instead of asking Discord again every
 * night, and so /discord/link shows the re-link prompt. The row itself stays: it is still the
 * user's sign-in method.
 */
async function forgetRevokedTokens(account: DiscordAccountRow, why: string): Promise<void> {
  log.warn('Discord grant revoked, dropping stored tokens', { userId: account.userId, why })
  try {
    await prisma.accounts.update({
      where: { id: account.id },
      data: { access_token: null, refresh_token: null, expires_at: null },
    })
  } catch (err) {
    log.error('Failed to drop revoked Discord tokens', err instanceof Error ? err : new Error(String(err)), {
      userId: account.userId,
    })
  }
}

async function refreshDiscordToken(
  account: DiscordAccountRow,
  config: DiscordConfig
): Promise<string> {
  if (!account.refresh_token) {
    throw new RevokedTokenError('no refresh token stored')
  }

  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  const response = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token,
    }).toString(),
  })

  if (response.status === 400 || response.status === 401 || response.status === 403) {
    // invalid_grant: the user revoked Boardly in Discord, or the refresh token was rotated
    // away. Retrying will never succeed, so do not.
    throw new RevokedTokenError(`token refresh rejected with ${response.status}`)
  }
  if (!response.ok) {
    throw new Error(`Discord token refresh failed with ${response.status}`)
  }

  const payload = (await response.json()) as {
    access_token?: unknown
    refresh_token?: unknown
    expires_in?: unknown
    scope?: unknown
  }
  if (typeof payload.access_token !== 'string' || payload.access_token.length === 0) {
    throw new Error('Discord token refresh returned no access token')
  }

  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 7 * 24 * 60 * 60
  const refreshed = {
    access_token: payload.access_token,
    refresh_token:
      typeof payload.refresh_token === 'string' && payload.refresh_token.length > 0
        ? payload.refresh_token
        : account.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    scope: typeof payload.scope === 'string' && payload.scope.length > 0 ? payload.scope : account.scope,
  }

  await prisma.accounts.update({ where: { id: account.id }, data: refreshed })

  account.access_token = refreshed.access_token
  account.refresh_token = refreshed.refresh_token
  account.expires_at = refreshed.expires_at
  account.scope = refreshed.scope

  return refreshed.access_token
}

/**
 * Returns a usable access token for the row, refreshing it when it expires within a minute
 * or is missing. Throws RevokedTokenError when Discord will not issue one.
 */
export async function getDiscordAccessToken(
  account: DiscordAccountRow,
  config: DiscordConfig,
  options: { forceRefresh?: boolean } = {}
): Promise<string> {
  const expiresAtMs = typeof account.expires_at === 'number' ? account.expires_at * 1000 : 0
  const stale = !account.access_token || expiresAtMs < Date.now() + REFRESH_SKEW_MS
  if (options.forceRefresh || stale) {
    return refreshDiscordToken(account, config)
  }
  return account.access_token as string
}

async function putRoleConnection(
  account: DiscordAccountRow,
  config: DiscordConfig,
  body: RoleConnectionBody
): Promise<void> {
  const url = `${DISCORD_API_BASE}/users/@me/applications/${config.applicationId}/role-connection`

  const send = async (token: string) =>
    fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })

  let response = await send(await getDiscordAccessToken(account, config))

  // One bounded retry: an access token can be rejected before its stored expiry (Discord
  // invalidates tokens when the user changes their password, for instance). Refresh once and
  // send once more; a second 401 or any 403 means the grant is gone.
  if (response.status === 401) {
    response = await send(await getDiscordAccessToken(account, config, { forceRefresh: true }))
  }

  if (response.status === 401 || response.status === 403) {
    throw new RevokedTokenError(`role-connection PUT rejected with ${response.status}`)
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`role-connection PUT failed with ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }
}

async function writeRoleConnection(
  userId: string,
  build: (account: DiscordAccountRow) => Promise<RoleConnectionBody>,
  onSuccess: (body: RoleConnectionBody) => RoleConnectionResult
): Promise<RoleConnectionResult> {
  try {
    const config = getDiscordConfig()
    if (!config) {
      log.warn('Discord role connection skipped: DISCORD_CLIENT_ID/SECRET or APPLICATION_ID missing', { userId })
      return { status: 'skipped', reason: 'not_configured' }
    }

    const account = await findDiscordAccount(userId)
    if (!account) {
      return { status: 'skipped', reason: 'no_discord_account' }
    }
    if (!hasRoleConnectionScope(account.scope)) {
      log.info('Discord role connection skipped: stored scope lacks role_connections.write', {
        userId,
        scope: account.scope ?? null,
      })
      return { status: 'skipped', reason: 'legacy_scope' }
    }
    if (!account.access_token && !account.refresh_token) {
      log.info('Discord role connection skipped: no token stored (grant revoked earlier)', { userId })
      return { status: 'skipped', reason: 'no_token' }
    }

    const body = await build(account)

    try {
      await putRoleConnection(account, config, body)
    } catch (err) {
      if (err instanceof RevokedTokenError) {
        await forgetRevokedTokens(account, err.message)
        return { status: 'revoked' }
      }
      throw err
    }

    return onSuccess(body)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    log.error('Discord role connection write failed', error, { userId })
    return { status: 'failed', reason: error.message }
  }
}

/** Writes premium, games_played, member_since and verified onto the user's Discord connection. */
export async function pushRoleConnection(userId: string): Promise<RoleConnectionResult> {
  return writeRoleConnection(
    userId,
    async () => {
      const [user, gamesPlayed] = await Promise.all([
        prisma.users.findUnique({
          where: { id: userId },
          select: { username: true, premiumUntil: true, emailVerified: true, createdAt: true },
        }),
        // Same definition as the profile's "games played" (app/api/user/profile/route.ts).
        prisma.players.count({ where: { userId, game: { status: 'finished' } } }),
      ])
      if (!user) {
        throw new Error('user not found')
      }

      const body: RoleConnectionBody = {
        platform_name: DISCORD_PLATFORM_NAME,
        metadata: buildRoleConnectionMetadata({ ...user, gamesPlayed }),
      }
      if (user.username) {
        body.platform_username = user.username.slice(0, PLATFORM_USERNAME_MAX)
      }
      return body
    },
    (body) => {
      log.info('Discord role connection pushed', { userId })
      return { status: 'pushed', metadata: body.metadata as RoleConnectionMetadata }
    }
  )
}

/**
 * Empties the metadata so every linked role falls away. Called before the `Accounts` row goes
 * (unlink, delete-account) – after the cascade there is no token left to do it with.
 */
export async function clearRoleConnection(userId: string): Promise<RoleConnectionResult> {
  return writeRoleConnection(
    userId,
    async () => ({ platform_name: DISCORD_PLATFORM_NAME, metadata: {} }),
    () => {
      log.info('Discord role connection cleared', { userId })
      return { status: 'cleared' }
    }
  )
}

export type RoleSyncSummary = {
  scanned: number
  pushed: number
  skipped: number
  revoked: number
  failed: number
  stoppedEarly: boolean
}

/**
 * Nightly pass over every Discord row that can be pushed. Batches of `batchSize` by row id;
 * rows without the scope or without a token never leave the database. Sequential on purpose:
 * one user token per request, and Discord's per-route rate limit is easier to stay under than
 * to recover from. `deadlineMs` stops the loop before the function is killed; the remaining
 * rows are picked up tomorrow.
 */
export async function syncAllRoleConnections(options: {
  batchSize?: number
  deadlineMs?: number
} = {}): Promise<RoleSyncSummary> {
  const batchSize = options.batchSize ?? 50
  const deadline = Date.now() + (options.deadlineMs ?? 50_000)
  const summary: RoleSyncSummary = { scanned: 0, pushed: 0, skipped: 0, revoked: 0, failed: 0, stoppedEarly: false }

  let cursor: string | undefined
  for (;;) {
    const rows = await prisma.accounts.findMany({
      where: {
        provider: 'discord',
        scope: { contains: DISCORD_ROLE_CONNECTION_SCOPE },
        OR: [{ access_token: { not: null } }, { refresh_token: { not: null } }],
      },
      select: { id: true, userId: true },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (rows.length === 0) break

    for (const row of rows) {
      if (Date.now() > deadline) {
        summary.stoppedEarly = true
        return summary
      }
      summary.scanned += 1
      const result = await pushRoleConnection(row.userId)
      if (result.status === 'pushed') summary.pushed += 1
      else if (result.status === 'skipped') summary.skipped += 1
      else if (result.status === 'revoked') summary.revoked += 1
      else summary.failed += 1
    }

    cursor = rows[rows.length - 1].id
    if (rows.length < batchSize) break
  }

  return summary
}
