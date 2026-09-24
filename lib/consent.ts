/**
 * Reopens Google's EEA/UK consent message via the Funding Choices
 * `googlefc` revocation API (#1153).
 *
 * Snippet per Google's own docs (fetched 2026-09-24,
 * https://support.google.com/adsense/answer/10959060): the recommended
 * revocation link is
 * `<a href="javascript:googlefc.callbackQueue.push(googlefc.showRevocationMessage)">Privacy and cookie settings</a>`.
 * `googlefc` only exists once the adsbygoogle loader has run — which is
 * production only (#1152) — so callers must gate rendering the control on
 * the same condition; this function itself is a no-op anywhere `googlefc`
 * hasn't loaded, so a stray click before the async loader finishes fails
 * silently rather than throwing.
 */
export function reopenGoogleConsentMessage(): void {
  if (typeof window === 'undefined') return

  const googlefc = (
    window as typeof window & {
      googlefc?: {
        callbackQueue: Array<() => void>
        showRevocationMessage?: () => void
      }
    }
  ).googlefc

  if (!googlefc?.showRevocationMessage) return
  googlefc.callbackQueue.push(googlefc.showRevocationMessage)
}
