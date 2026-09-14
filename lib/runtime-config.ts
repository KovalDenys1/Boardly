import { unstable_cache } from 'next/cache'
import { prisma } from './db'
import { apiLogger } from './logger'
import {
  isFakeArtistEnabled,
  isSketchAndGuessEnabled,
  isTelephoneDoodleEnabled,
} from './feature-flags'

const log = apiLogger('runtime-config')

/**
 * Product state the control panel can change without a deploy.
 *
 * Two things lived only in env vars and code: whether a game is switched on, and whether
 * there is anything to say to players. A feature flag read from `process.env` needs a
 * redeploy to change, and a `NEXT_PUBLIC_` one needs a rebuild, so the flag and the person
 * deciding were never in the same place. There was no announcement mechanism at all.
 *
 * Two rules shape this, and both exist so a database problem cannot become an outage:
 *
 *   1. A flag with no row falls back to the env var. An absent table, an unreachable
 *      database or an empty row set therefore behaves exactly as the app does today.
 *   2. Every read is cached and every failure is swallowed into the fallback. This runs on
 *      the render path of every page; it must never be able to make one fail.
 *
 * The cache is short because the point of the feature is that a change lands quickly. Thirty
 * seconds is the compromise between "did my change take effect" and one query per render.
 *
 * SERVER ONLY. This file imports Prisma, and `lib/feature-flags.ts` is reachable from client
 * components, so the dependency runs one way: this file imports the env helpers, never the
 * reverse. Pointing it the other way pulled Prisma into the client bundle and broke the
 * production build with seven chunk errors, which is the reason the arrows are written down.
 */

const CACHE_SECONDS = 30

export type Announcement = {
  id: string
  message: string
  href: string | null
  tone: 'info' | 'success' | 'warning'
}

/**
 * The live announcement, if there is one.
 *
 * Active, and inside its window when it has one: a null start means it has always been
 * running, a null end means it runs until someone turns it off. The newest wins, because
 * two live banners is a mistake and showing the older one would hide the correction.
 */
export const getActiveAnnouncement = unstable_cache(
  async (): Promise<Announcement | null> => {
    try {
      const now = new Date()
      const row = await prisma.announcements.findFirst({
        where: {
          active: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, message: true, href: true, tone: true },
      })
      if (!row) return null
      return {
        id: row.id,
        message: row.message,
        href: row.href,
        tone: row.tone === 'success' || row.tone === 'warning' ? row.tone : 'info',
      }
    } catch (err) {
      // A banner is the least important thing on any page it appears on.
      log.error(
        'Failed to read the active announcement',
        err instanceof Error ? err : new Error(String(err)),
      )
      return null
    }
  },
  ['active-announcement'],
  { revalidate: CACHE_SECONDS, tags: ['announcements'] },
)

/** Every flag override, as a map. Absent keys mean "the env var decides". */
export const getRuntimeFlags = unstable_cache(
  async (): Promise<Record<string, boolean>> => {
    try {
      const rows = await prisma.runtimeFlags.findMany({ select: { key: true, enabled: true } })
      return Object.fromEntries(rows.map((r) => [r.key, r.enabled]))
    } catch (err) {
      log.error(
        'Failed to read runtime flags, falling back to the environment',
        err instanceof Error ? err : new Error(String(err)),
      )
      return {}
    }
  },
  ['runtime-flags'],
  { revalidate: CACHE_SECONDS, tags: ['runtime-flags'] },
)

/**
 * A flag's value: the database row if there is one, otherwise the env var.
 *
 * Async, unlike the env-only helpers it supplements, which is why those stay: a client
 * component and a build-time check cannot await anything, and forcing them to would mean
 * rewriting call sites that are correct as they are.
 */
export async function isFlagEnabled(key: string, envFallback: boolean): Promise<boolean> {
  const flags = await getRuntimeFlags()
  return key in flags ? flags[key] : envFallback
}

/**
 * The three game flags, with a database override when the control panel has set one.
 *
 * Server-side only. The env-only versions in `lib/feature-flags.ts` stay for client
 * components and build-time checks, which cannot await a database read.
 */
export function isTelephoneDoodleEnabledAsync(): Promise<boolean> {
  return isFlagEnabled('telephone_doodle', isTelephoneDoodleEnabled())
}

export function isSketchAndGuessEnabledAsync(): Promise<boolean> {
  return isFlagEnabled('sketch_and_guess', isSketchAndGuessEnabled())
}

export function isFakeArtistEnabledAsync(): Promise<boolean> {
  return isFlagEnabled('fake_artist', isFakeArtistEnabled())
}
