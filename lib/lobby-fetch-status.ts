/**
 * Which HTTP statuses mean "this lobby is really gone" (#991).
 *
 * Anything else — a 429 from a shared IP, a transient 5xx, a gateway blip — is a
 * failure to fetch, not a dead lobby, and must leave a game in progress on
 * screen. #987 fixed the pages that ejected with `router.push`; these are the
 * two that did the same thing by dropping the lobby into the error screen.
 */
export function isLobbyGoneStatus(status: number): boolean {
  return status === 404 || status === 403 || status === 410
}
