import { NextAuthOptions } from 'next-auth'
import { cookies } from 'next/headers'
// Use custom adapter to map plural model names (Users) to NextAuth expectations (User)
import { CustomPrismaAdapter } from './custom-prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import GitHubProvider from 'next-auth/providers/github'
import DiscordProvider from 'next-auth/providers/discord'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './db'
import { comparePassword } from './auth'
import { apiLogger } from './logger'
import { decode as defaultJwtDecode, encode as defaultJwtEncode, type JWT } from 'next-auth/jwt'
import {
  getCredentialsSessionMaxAgeSeconds,
  REMEMBER_ME_MAX_AGE_SECONDS,
} from './auth-session-policy'
import { loginSchema } from './validation/auth'
import { insensitiveEquals } from './username-match'
import {
  providerAssertsEmailVerified,
  providerVerifiesAccountEmail,
  readProviderEmailVerified,
  withGitHubEmailVerification,
  withProviderEmailVerified,
} from './oauth-email-verification'

/**
 * Compared against when the address has no password account, so an unknown address
 * costs the same bcrypt work as a known one and the response time does not say which
 * addresses are registered (#1142). A cost-10 hash of a random string nobody kept, the
 * same cost lib/auth.ts hashes with; its preimage does not matter, because the result
 * of this comparison is never used to let anyone in.
 */
const DUMMY_PASSWORD_HASH = '$2b$10$K4DZPLBLP0uLKTaylETfXenJBZxZNPHOZ7axelxEiGt97UVNHQz5O'

/**
 * True when a token signed in before the account's session cutoff. A null
 * cutoff never revokes anything, which is every row until a password reset or
 * an email change sets one. A token without `authenticatedAt` predates the
 * claim and counts as signed in at 0.
 */
export function isBeforeSessionCutoff(
  authenticatedAt: unknown,
  sessionsValidFrom: Date | null | undefined
): boolean {
  if (!sessionsValidFrom) {
    return false
  }
  const signedInAt =
    typeof authenticatedAt === 'number' && Number.isFinite(authenticatedAt) ? authenticatedAt : 0
  return signedInAt < sessionsValidFrom.getTime()
}

// The session cutoff (#1136) lives in jwt.decode, not in callbacks.jwt,
// because decode is the one step every use of an existing session cookie
// passes. /api/auth/session and getServerSession decode the cookie before
// callbacks.jwt runs, but the OAuth callback decodes it to choose the account a
// new provider identity is linked to and never runs callbacks.jwt for that
// cookie (next-auth 4.24 core/lib/callback-handler.js). With the check only in
// callbacks.jwt, a cookie stolen before a password reset could link the thief's
// own Google, GitHub or Discord account to the victim's and come back with a
// fresh session. Returning null from decode makes the session route clear the
// cookie and answer `{}`, getServerSession return null, and the OAuth callback
// treat the request as signed out, so nothing is linked.
//
// Read on every request, not inside the 30-minute refresh: a stolen session
// stops working on its very next request (the fix #805 specified). One
// primary-key read of one column.
async function isSessionRevoked(payload: JWT): Promise<boolean> {
  const userId =
    typeof payload.id === 'string' && payload.id.length > 0
      ? payload.id
      : typeof payload.sub === 'string' && payload.sub.length > 0
        ? payload.sub
        : null
  if (!userId) {
    return false
  }

  let row: { sessionsValidFrom: Date | null } | null
  try {
    row = await prisma.users.findUnique({
      where: { id: userId },
      select: { sessionsValidFrom: true },
    })
  } catch (error) {
    // A database blip must not sign every user out. The check runs again on
    // the next request.
    apiLogger('NextAuth jwt').warn('Session cutoff check skipped: database read failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }

  // The account was deleted (delete-account removes the row), so the session
  // has nothing left to stand for.
  if (!row) {
    apiLogger('NextAuth jwt').info('Session ended: the account no longer exists', { userId })
    return true
  }
  if (isBeforeSessionCutoff(payload.authenticatedAt, row.sessionsValidFrom)) {
    apiLogger('NextAuth jwt').info('Session ended: signed in before the account\'s session cutoff', { userId })
    return true
  }
  return false
}

/** Verifies a session cookie and applies the session cutoff; null when it is not a live session. */
async function decodeSessionToken(params: Parameters<typeof defaultJwtDecode>[0]): Promise<JWT | null> {
  const payload = await defaultJwtDecode(params)
  if (payload && (await isSessionRevoked(payload))) {
    return null
  }
  return payload
}

// The two names next-auth gives the session cookie: `__Secure-` when its URL is https,
// the bare one otherwise (core/lib/cookie.js defaultCookies).
const SESSION_COOKIE_NAMES = ['__Secure-next-auth.session-token', 'next-auth.session-token'] as const

function sessionCookieChunkIndex(name: string): number {
  return Number.parseInt(name.split('.').pop() ?? '0', 10) || 0
}

/**
 * The session token under each cookie name, put back together the way next-auth's
 * SessionStore does (core/lib/cookie.js): every cookie whose name starts with the name,
 * in the order of its `.N` chunk suffix, joined. A large JWT is split across `name.0`,
 * `name.1` and so on.
 */
export function sessionTokensFromCookies(all: ReadonlyArray<{ name: string; value: string }>): string[] {
  return SESSION_COOKIE_NAMES.flatMap((cookieName) => {
    const token = all
      .filter((cookie) => cookie.name.startsWith(cookieName))
      .sort((a, b) => sessionCookieChunkIndex(a.name) - sessionCookieChunkIndex(b.name))
      .map((cookie) => cookie.value)
      .join('')
    return token ? [token] : []
  })
}

/**
 * The user this request's session cookie signs in, decided the way next-auth's OAuth
 * callback decides whom to link a new provider account to (core/lib/callback-handler.js):
 * the cookie decodes through the same jwt.decode, session cutoff included, and carries a
 * `sub`. A revoked, expired or forged cookie is no session here, just as it is none there.
 *
 * The cookies come from `next/headers`, which is where next-auth's App Router handler reads
 * them too (next-auth/next NextAuthRouteHandler), so the two cannot be looking at different
 * requests. Both cookie names are checked. next-auth reads only the one its URL's scheme
 * picks, so a cookie under the other name can make this refuse a link next-auth would not
 * have made, and never allow one it would.
 */
async function readSignedInUserId(): Promise<string | null> {
  let all: Array<{ name: string; value: string }>
  try {
    all = (await cookies()).getAll()
  } catch {
    // Outside a request there is no cookie for next-auth to link by either.
    return null
  }
  // The secret authOptions.secret names, and so the one next-auth decodes the cookie with.
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    return null
  }
  for (const token of sessionTokensFromCookies(all)) {
    try {
      const payload = await decodeSessionToken({ token, secret })
      if (typeof payload?.sub === 'string' && payload.sub.length > 0) {
        return payload.sub
      }
    } catch {
      // Not a token this secret signed; next-auth treats it as no session as well.
    }
  }
  return null
}

/** Where a refused link lands: the profile, which says why (#1223). */
export function oauthLinkRefusedRedirect(provider: string): string {
  return `/profile?oauthLinkRefused=${encodeURIComponent(provider)}`
}

export const authOptions: NextAuthOptions = {
  adapter: CustomPrismaAdapter(prisma),
  providers: [
    // Include providers only when configured to avoid build-time errors
    // Each OAuth provider keeps its default profile() and adds whether it vouched for
    // the email it returned (lib/oauth-email-verification.ts, #1142); events.linkAccount
    // reads that instead of marking every OAuth address verified.
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [
        (() => {
          const credentials = {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          }
          const defaults = GitHubProvider(credentials)
          return GitHubProvider({
            ...credentials,
            // GitHub's /user carries no verification flag; this asks /user/emails.
            userinfo: withGitHubEmailVerification(defaults.userinfo),
            profile: withProviderEmailVerified('github', defaults.profile),
          })
        })(),
      ]
      : []),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
        (() => {
          const credentials = {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }
          return GoogleProvider({
            ...credentials,
            profile: withProviderEmailVerified('google', GoogleProvider(credentials).profile),
          })
        })(),
      ]
      : []),
    ...(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
      ? [
        (() => {
          const credentials = {
            clientId: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET,
          }
          return DiscordProvider({
            ...credentials,
            // The scope is replaced as a whole string, not merged with the provider default
            // (`identify email`). `role_connections.write` lets lib/discord/role-connection.ts
            // write Linked Roles metadata with the user's own token (#939). `email` is also
            // what makes Discord return `verified`.
            authorization: { params: { scope: 'identify email role_connections.write' } },
            profile: withProviderEmailVerified('discord', DiscordProvider(credentials).profile),
          })
        })(),
      ]
      : []),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        rememberMe: { label: 'Remember Me', type: 'text' },
      },
      async authorize(credentials) {
        const parsedCredentials = loginSchema.safeParse({
          email: credentials?.email,
          password: credentials?.password,
        })

        if (!parsedCredentials.success) {
          return null
        }

        const { email, password } = parsedCredentials.data

        // `insensitiveEquals`, not a bare `equals` + `mode`: that pair compiles
        // to an unescaped ILIKE, so an address with `_` or `%` in it was matched
        // as a pattern and this lookup could hand back a different account's row
        // (#1055). The password check below then fails, so the user is locked
        // out of their own account with the right password.
        const user = await prisma.users.findFirst({
          where: {
            email: insensitiveEquals(email),
          },
          select: {
            id: true,
            email: true,
            username: true,
            image: true,
            avatarUrl: true,
            passwordHash: true,
            emailVerified: true,
            role: true,
            suspended: true,
          },
        })

        // One bcrypt comparison on every path, the dummy hash standing in when there is
        // no password to check, so an unknown address, an OAuth-only account and a
        // suspended one all take as long as a wrong password (#1142). Who may sign in
        // is unchanged: the same three refusals, only after the comparison.
        const isValid = await comparePassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)

        if (!user || !user.passwordHash || !isValid) {
          return null
        }

        if (user.suspended) {
          return null
        }

        const rememberMe = String(credentials?.rememberMe ?? 'false') === 'true'

        return {
          id: user.id,
          email: user.email ?? email,
          name: user.username,
          image: user.image,
          avatarUrl: user.avatarUrl,
          emailVerified: user.emailVerified,
          role: user.role,
          suspended: user.suspended,
          rememberMe,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: REMEMBER_ME_MAX_AGE_SECONDS,
  },
  jwt: {
    async encode(params) {
      const rememberMe = params.token?.rememberMe !== false
      return defaultJwtEncode({
        ...params,
        maxAge: getCredentialsSessionMaxAgeSeconds(rememberMe),
      })
    },
    decode: decodeSessionToken,
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error-oauth',
  },
  callbacks: {
    async signIn({ user, account, profile, email, credentials }) {
      // Handle OAuth sign-ins (Google, GitHub, Discord)
      if (account?.provider && account.provider !== 'credentials') {
        try {
          // Manual linking handled in events.linkAccount callback
          // Here we just validate and allow/deny the sign-in

          // Check if there's already an account with this provider + providerAccountId
          const existingAccount = await prisma.accounts.findUnique({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId
              }
            },
            include: { user: true }
          })

          // Already signed in, with a provider account that is not this user's (#1223).
          // Past this callback next-auth links an unlinked provider account to whoever the
          // session cookie names, with no confirmation and no notice, so on a shared device
          // someone else's Google, GitHub or Discord could end up able to sign in as the
          // signed-in account. Nothing is linked this way any more: the explicit flow is
          // /discord/link (#1218), which never comes through next-auth. A provider account
          // linked to a different user is refused the same way; next-auth would only have
          // thrown OAuthAccountNotLinked after this callback had refreshed that user's tokens.
          const signedInUserId = await readSignedInUserId()
          if (signedInUserId && existingAccount?.userId !== signedInUserId) {
            apiLogger('OAuth signIn').warn('OAuth sign-in refused: already signed in as another account', {
              userId: signedInUserId,
              provider: account.provider,
              linkedToAnotherUser: Boolean(existingAccount),
            })
            return oauthLinkRefusedRedirect(account.provider)
          }

          if (existingAccount) {
            if (existingAccount.user.suspended) {
              const log = apiLogger('OAuth signIn')
              log.warn('Suspended user OAuth sign-in denied', {
                userId: existingAccount.userId,
                provider: account.provider,
              })
              return '/suspended'
            }

            // Refresh the stored OAuth tokens on every sign-in. The adapter's linkAccount
            // is the only other writer and fires once, when the row is created, so without
            // this a Discord row linked before `role_connections.write` existed would keep
            // its legacy scope and its 7-day token forever, and every Linked Roles write
            // for it would 403 (#939). Only fields the provider actually returned are written.
            const tokenUpdate: {
              scope?: string
              access_token?: string
              refresh_token?: string
              expires_at?: number
            } = {}
            if (typeof account.scope === 'string' && account.scope.length > 0) tokenUpdate.scope = account.scope
            if (typeof account.access_token === 'string' && account.access_token.length > 0) tokenUpdate.access_token = account.access_token
            if (typeof account.refresh_token === 'string' && account.refresh_token.length > 0) tokenUpdate.refresh_token = account.refresh_token
            if (typeof account.expires_at === 'number') tokenUpdate.expires_at = account.expires_at
            if (Object.keys(tokenUpdate).length > 0) {
              await prisma.accounts.update({
                where: { id: existingAccount.id },
                data: tokenUpdate,
              })
            }

            // Account already exists - allow sign in. Its address is marked verified
            // only when the provider vouches for the address it returned and that is
            // the account's own (#1142); it used to be marked verified unconditionally.
            if (
              !existingAccount.user.emailVerified &&
              providerVerifiesAccountEmail({
                providerVerified: providerAssertsEmailVerified(account.provider, profile),
                providerEmail: (profile as { email?: unknown } | undefined)?.email,
                accountEmail: existingAccount.user.email,
              })
            ) {
              await prisma.users.update({
                where: { id: existingAccount.userId },
                data: { emailVerified: new Date() }
              })

              const log = apiLogger('OAuth signIn')
              log.info('Auto-verified existing OAuth user', { userId: existingAccount.userId })
            }
            return true
          }

          const normalizedOAuthEmail = typeof user.email === 'string'
            ? user.email.trim().toLowerCase()
            : null

          if (!normalizedOAuthEmail) {
            const log = apiLogger('OAuth signIn')
            log.info('OAuth sign-in without email; skipping existing email lookup', {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            })
            return true
          }

          // New OAuth account - check if user with this email already exists
          // `insensitiveEquals`, not a bare `equals` + `mode`: that pair
          // compiles to an unescaped ILIKE (#1055), and this is the lookup that
          // links a new OAuth identity to an existing account. A pattern match
          // here links it to the wrong account: `john_smith@example.com` signing
          // in with a provider matched the account `john.smith@example.com`, one
          // character apart at the `_`, and adopted it.
          const existingUserByEmail = await prisma.users.findFirst({
            where: {
              email: insensitiveEquals(normalizedOAuthEmail),
            },
            select: {
              id: true,
              emailVerified: true,
              suspended: true,
            },
          })

          if (existingUserByEmail) {
            if (existingUserByEmail.suspended) {
              const log = apiLogger('OAuth signIn')
              log.warn('Suspended user OAuth sign-in denied (email match)', {
                existingUserId: existingUserByEmail.id,
                provider: account.provider,
              })
              return '/suspended'
            }

            // Deliberately does not write emailVerified here. This branch is
            // reached on nothing more than an email match, before any linking is
            // decided, and no provider sets allowDangerousEmailAccountLinking —
            // so the sign-in that follows actually fails with
            // OAuthAccountNotLinked. Writing from here let anyone who created a
            // provider account with someone else's address mark that stranger's
            // account as verified, defeating our own proof of ownership (#802).
            const log = apiLogger('OAuth signIn')
            log.info('OAuth sign-in reached an existing account with this email', {
              existingUserId: existingUserByEmail.id,
              provider: account.provider,
            })
            return true
          }

          // New provider identity with a new email, and nobody signed in (a signed-in
          // request was refused above, #1223): the adapter creates a SEPARATE user for it.
          // /auth/link, the profile's page for linking on purpose, was removed in #1140,
          // and /discord/link does not come through here: it links server-side, bound to
          // the session, and never issues a session (lib/discord/account-link.ts, #1218).
          const log = apiLogger('OAuth signIn')
          // No address here or anywhere below: the ids identify the account (#1132).
          log.info('New OAuth user will be created', {
            provider: account.provider,
          })

        } catch (error) {
          // Through the logger, not console.error, so an address inside a provider or
          // database error is masked like every other log line (#1132).
          apiLogger('OAuth signIn').error('Error in signIn callback', error)
          return false
        }
      }
      return true
    },
    async jwt({ token, user, trigger }) {
      // On sign in, add user data to token
      if (user) {
        token.id = user.id
        token.email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : user.email
        token.name = (user as { username?: string }).username || user.email?.split('@')[0] || 'user'
        token.picture = (user as { avatarUrl?: string | null }).avatarUrl ?? (user as { image?: string | null }).image ?? null
        token.emailVerified = user.emailVerified
        token.role = (user as { role?: 'user' | 'admin' }).role ?? token.role ?? 'user'
        token.suspended = (user as { suspended?: boolean }).suspended ?? token.suspended ?? false
        token.banReason = (user as { banReason?: string | null }).banReason ?? token.banReason ?? null
        token.banExpiresAt = (user as { banExpiresAt?: string | null }).banExpiresAt ?? token.banExpiresAt ?? null
        token.rememberMe = (user as { rememberMe?: boolean }).rememberMe ?? token.rememberMe ?? true
        token.authenticatedAt = Date.now()
      }

      if (typeof token.rememberMe !== 'boolean') {
        token.rememberMe = true
      }

      // Ensure we have user data from database
      if (!token.id && token.email) {
        const tokenEmail = String(token.email).trim().toLowerCase()
        // `insensitiveEquals`: same unescaped-ILIKE pattern match as the two
        // lookups above, and this one decides which row a token is filled in
        // from (#1055).
        const dbUser = await prisma.users.findFirst({
          where: {
            email: insensitiveEquals(tokenEmail),
          },
          select: {
            id: true,
            username: true,
            emailVerified: true,
            role: true,
            suspended: true,
            banReason: true,
            banExpiresAt: true,
          }
        })
        if (dbUser) {
          token.id = dbUser.id
          token.name = dbUser.username
          token.emailVerified = dbUser.emailVerified
          token.role = dbUser.role
          token.suspended = dbUser.suspended
          token.banReason = dbUser.banReason
          token.banExpiresAt = dbUser.banExpiresAt?.toISOString() ?? null
        }
      }

      // Refresh mutable user fields/status on update trigger
      if (trigger === 'update' && token.id) {
        const dbUser = await prisma.users.findUnique({
          where: { id: String(token.id) },
          select: {
            email: true,
            username: true,
            image: true,
            avatarUrl: true,
            emailVerified: true,
            role: true,
            suspended: true,
            banReason: true,
            banExpiresAt: true,
          },
        })
        if (dbUser) {
          token.email = dbUser.email
          token.name = dbUser.username
          token.picture = dbUser.avatarUrl ?? dbUser.image ?? null
          token.emailVerified = dbUser.emailVerified
          token.role = dbUser.role
          token.suspended = dbUser.suspended
          token.banReason = dbUser.banReason
          token.banExpiresAt = dbUser.banExpiresAt?.toISOString() ?? null
        }
      }

      // Sync avatar + username + verification status from DB (throttled to once per 30 minutes)
      // Acts as a backstop for emailVerified in case the client-triggered `update()` is missed
      // (e.g. called before the session hook's initial fetch settles, where it's a silent no-op)
      const THIRTY_MINUTES = 30 * 60 * 1000
      const lastAvatarSync = token.avatarResolved as number | boolean | undefined
      const lastAvatarSyncTime = typeof lastAvatarSync === 'number' ? lastAvatarSync : 0
      if (token.id && (typeof lastAvatarSync !== 'number' || Date.now() - lastAvatarSyncTime > THIRTY_MINUTES)) {
        const dbUser = await prisma.users.findUnique({
          where: { id: String(token.id) },
          // role and suspended are re-read here on purpose: proxy.ts decides
          // admin access and the suspension redirect from these claims, and a
          // 30-day session would otherwise keep asserting them long after the
          // database changed (#803). The reason and the expiry travel with the
          // flag: someone suspended while signed in lands on /suspended through
          // this sync, and the Terms promise that page states the reason and,
          // for a temporary suspension, the end date (#1166).
          select: {
            avatarUrl: true,
            username: true,
            image: true,
            emailVerified: true,
            role: true,
            suspended: true,
            banReason: true,
            banExpiresAt: true,
          },
        })
        token.picture = dbUser?.avatarUrl ?? dbUser?.image ?? null
        if (dbUser?.username) token.name = dbUser.username
        if (dbUser?.emailVerified) token.emailVerified = dbUser.emailVerified
        if (dbUser) {
          token.role = dbUser.role
          token.suspended = dbUser.suspended
          token.banReason = dbUser.banReason
          token.banExpiresAt = dbUser.banExpiresAt?.toISOString() ?? null
        }
        token.avatarResolved = Date.now()
      }

      // Update lastActiveAt for authenticated users (throttled to once per 5 minutes)
      if (token.id && !token.lastActiveUpdate) {
        token.lastActiveUpdate = Date.now()
      }
      const now = Date.now()
      const lastUpdate = token.lastActiveUpdate as number || 0
      const fiveMinutes = 5 * 60 * 1000

      if (token.id && now - lastUpdate > fiveMinutes) {
        // Awaited (not fire-and-forget): Vercel serverless functions can kill pending
        // promises once the response is sent (see #509), which would silently orphan
        // this write and its DB connection under load. Failures are swallowed here
        // deliberately — a stale lastActiveAt shouldn't block auth.
        try {
          await prisma.users.update({
            where: { id: token.id as string },
            data: { lastActiveAt: new Date() }
          })
        } catch {
          // Silently fail to avoid blocking auth
        }

        token.lastActiveUpdate = now
      }

      return token
    },
    async session({ session, token }) {
      // Add user data to session
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.image = token.picture as string
        session.user.emailVerified = token.emailVerified as Date | null
        session.user.role = (token.role as 'user' | 'admin' | undefined) ?? 'user'
        session.user.suspended = Boolean(token.suspended)
        session.user.banReason = (token.banReason as string | null | undefined) ?? null
        session.user.banExpiresAt = (token.banExpiresAt as string | null | undefined) ?? null
        // When this session signed in (ms). PATCH /api/user/profile asks for a
        // recent sign-in before an account without a password changes its
        // email (#1136).
        session.user.authenticatedAt =
          typeof token.authenticatedAt === 'number' ? token.authenticatedAt : null
      }
      return session
    },
  },
  events: {
    async signIn({ user }) {
      // A sign-in is activity (#1130). The jwt callback below writes lastActiveAt at most
      // every five minutes and not on the sign-in itself, so a short visit – the one the
      // inactive-account warning asks for – would otherwise leave the account marked
      // inactive and still due for deletion. Never blocks the sign-in.
      if (!user?.id) return
      try {
        await prisma.users.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })
      } catch {
        // A stale lastActiveAt must not block auth.
      }
    },
    async createUser({ user }) {
      // Auto-verify email for new OAuth users
      // Note: This event fires BEFORE accounts are linked by PrismaAdapter
      // We'll verify in signIn callback instead when we can check account type
      const log = apiLogger('OAuth createUser')
      log.info('New user created', { userId: user.id })
    },
    async linkAccount({ user, account, profile }) {
      // Fires when the adapter links an OAuth account: to a user it has just created,
      // or to the signed-in user linking another provider.
      //
      // The address is marked verified only when the provider vouched for the one it
      // returned and that is the account's own address (#1142). Discord hands out
      // unverified addresses, and a provider verifying a different address says
      // nothing about this one; the account's own verification email covers the rest.
      //
      // No username write any more: createUser already chose one, and the old
      // `email.split('@')[0]` overwrote a name the person had picked every time they
      // linked a provider, and collided on the unique index for two addresses with
      // the same local part (#1142).
      const verifies =
        !user.emailVerified &&
        providerVerifiesAccountEmail({
          providerVerified: readProviderEmailVerified(profile),
          providerEmail: profile?.email,
          accountEmail: user.email,
        })

      await prisma.users.update({
        where: { id: user.id },
        data: {
          image: null,
          ...(verifies ? { emailVerified: new Date() } : {}),
        }
      })

      const log = apiLogger('OAuth linkAccount')
      log.info('OAuth account linked successfully', {
        userId: user.id,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      })
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
}
