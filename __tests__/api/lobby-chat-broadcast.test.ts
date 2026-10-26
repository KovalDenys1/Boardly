/**
 * What keeps lobby chat private, and what makes it arrive.
 *
 * #801 answered the first question by taking the message text off the
 * broadcast: the topic was `lobby:{code}` with a four-digit code, so anyone
 * enumerating names could read every conversation. #845 answered it properly by
 * renaming the topic to carry a per-lobby secret, and #852 showed why the
 * interim answer could not stay — it made delivery depend on a Redis that is
 * allowed to not exist, and in production does not, so nobody but the sender
 * ever saw a message.
 *
 * The privacy guarantee now lives in the topic name. These assertions guard the
 * two halves that remain: nothing broadcasts an email address as a display
 * name, and no code path composes the old guessable topic.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.join(__dirname, '..', '..')

describe('lobby broadcasts', () => {
  it('never falls back to an email address for a display name', () => {
    for (const file of ['app/api/lobby/[code]/kick-player/route.ts', 'lib/lobby-leave.ts']) {
      const source = readFileSync(path.join(root, file), 'utf8')
      expect(source).not.toMatch(/username\s*\|\|\s*[\w.]*\.email/)
    }
  })

  it('builds the lobby topic in one place, so the two sides cannot drift apart', () => {
    // A client subscribed to a different name than the server broadcasts to
    // raises no error anywhere — the lobby just goes quiet.
    const server = readFileSync(path.join(root, 'lib/supabase-server.ts'), 'utf8')
    const client = readFileSync(
      path.join(root, 'app/(site)/lobby/[code]/hooks/useRealtimeConnection.ts'),
      'utf8'
    )

    expect(server).toContain("buildLobbyTopic(lobbyCode, lobby.realtimeSecret)")
    // The client is handed the finished name by the server; it never composes one.
    expect(client).toContain('fetchLobbyTopic')
    expect(client).not.toMatch(/channel\(`lobby:\$\{code\}`\)/)
    expect(server).not.toMatch(/`lobby:\$\{lobbyCode\}`/)
  })
})
