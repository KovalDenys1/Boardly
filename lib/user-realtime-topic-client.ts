'use client'

import { fetchWithGuest } from '@/lib/fetch-with-guest'

const MAX_ATTEMPTS = 3
const cache = new Map<string, Promise<string | null>>()

async function requestUserTopic(userId: string): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetchWithGuest('/api/realtime/user-topic')
      if (res.ok) {
        const data = await res.json()
        const topic = data?.topic
        // The route answers for whoever is signed in; a topic for anyone else
        // means the session changed under us, and is not ours to listen on.
        return typeof topic === 'string' && topic.startsWith(`user:${userId}:`) ? topic : null
      }
      if (res.status === 401 || res.status === 403) return null
    } catch {
      // Network hiccup: back off and ask again.
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
  }
  return null
}

/**
 * The signed-in user's own realtime topic (GET /api/realtime/user-topic),
 * which carries invites, rematch requests and notification pokes. It is not
 * `user:{userId}` any more – user ids are public – so it has to be asked for
 * (audit S3-05). Every consumer on the page shares one request.
 */
export function fetchUserTopic(userId: string): Promise<string | null> {
  const cached = cache.get(userId)
  if (cached) return cached
  const loading = requestUserTopic(userId)
  cache.set(userId, loading)
  void loading.then((topic) => {
    if (!topic && cache.get(userId) === loading) cache.delete(userId)
  })
  return loading
}

/** Test seam. */
export function __resetUserTopicCacheForTests(): void {
  cache.clear()
}
