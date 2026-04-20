import { resolveDedicatedLobbyPageGameType } from '@/lib/lobby-page-routing'

describe('resolveDedicatedLobbyPageGameType', () => {
  it('keeps all waiting lobbies on the shared lobby shell', () => {
    expect(resolveDedicatedLobbyPageGameType('tic_tac_toe', 'waiting')).toBeNull()
    expect(resolveDedicatedLobbyPageGameType('rock_paper_scissors', 'waiting')).toBeNull()
    expect(resolveDedicatedLobbyPageGameType('alias', 'waiting')).toBeNull()
    expect(resolveDedicatedLobbyPageGameType('liars_party', 'waiting')).toBeNull()
  })

  it('routes dedicated games after they start or finish', () => {
    expect(resolveDedicatedLobbyPageGameType('tic_tac_toe', 'playing')).toBe('tic_tac_toe')
    expect(resolveDedicatedLobbyPageGameType('rock_paper_scissors', 'finished')).toBe('rock_paper_scissors')
    expect(resolveDedicatedLobbyPageGameType('alias', 'playing')).toBe('alias')
    expect(resolveDedicatedLobbyPageGameType('liars_party', 'finished')).toBe('liars_party')
  })

  it('does not route games rendered by the shared lobby page', () => {
    expect(resolveDedicatedLobbyPageGameType('yahtzee', 'playing')).toBeNull()
    expect(resolveDedicatedLobbyPageGameType('guess_the_spy', 'finished')).toBeNull()
    expect(resolveDedicatedLobbyPageGameType('memory', 'playing')).toBeNull()
  })
})
