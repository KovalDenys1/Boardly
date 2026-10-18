import { fetchWithGuest } from '@/lib/fetch-with-guest'

/** True when the server refused a post because the sender has not accepted the terms yet (#1466). */
export async function isTermsRequired(response: Response): Promise<boolean> {
  if (response.status !== 403) return false
  try {
    const body: unknown = await response.json()
    return (body as { code?: unknown } | null)?.code === 'TERMS_REQUIRED'
  } catch {
    return false
  }
}

/** Records the viewer's acceptance of the Terms of Use and the Community Rules; resolves false when it was not stored. */
export async function acceptTerms(): Promise<boolean> {
  try {
    const response = await fetchWithGuest('/api/user/accept-terms', { method: 'POST' })
    return Boolean(response?.ok)
  } catch {
    return false
  }
}
