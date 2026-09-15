import {
  describeIdentityProblem,
  probeAppIdentity,
  resolveBaseUrl,
  resolveDevServerPort,
} from './app-identity'

/**
 * Refuse a run against an application that is not Boardly (#900).
 *
 * This runs after the `webServer` plugin, which is the point: by now the suite
 * has either started its own dev server or adopted one that was already
 * listening, and the probe hits whatever the tests are actually about to drive.
 * Throwing here stops the run before the first spec, so a foreign server costs
 * one clear message instead of fourteen failures inside `createGuestLobby`.
 */
export default async function globalSetup(): Promise<void> {
  const baseUrl = resolveBaseUrl()
  const identity = await probeAppIdentity(baseUrl)
  const problem = describeIdentityProblem({
    baseUrl,
    identity,
    startsOwnServer: !process.env.E2E_BASE_URL,
    port: resolveDevServerPort(),
  })
  if (problem) throw new Error(problem)
}
