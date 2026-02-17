import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'

describe('getLobbyPlayerRequirements', () => {
  it('returns bot-friendly requirements for yahtzee', () => {
    const requirements = getLobbyPlayerRequirements('yahtzee')

    expect(requirements).toEqual({
      gameType: 'yahtzee',
      supportsBots: true,
      minPlayersRequired: 1,
      desiredPlayerCount: 2,
    })
  })

  it('returns strict minimum requirements for non-bot games', () => {
    const requirements = getLobbyPlayerRequirements('guess_the_spy')

    expect(requirements).toEqual({
      gameType: 'guess_the_spy',
      supportsBots: false,
      minPlayersRequired: 3,
      desiredPlayerCount: 3,
    })
  })

  it('keeps two-player requirement for bot-enabled duel games', () => {
    const requirements = getLobbyPlayerRequirements('tic_tac_toe')

    expect(requirements).toEqual({
      gameType: 'tic_tac_toe',
      supportsBots: true,
      minPlayersRequired: 2,
      desiredPlayerCount: 2,
    })
  })

  it('uses default game type when input is empty', () => {
    const requirements = getLobbyPlayerRequirements('   ')

    expect(requirements).toEqual({
      gameType: 'yahtzee',
      supportsBots: true,
      minPlayersRequired: 1,
      desiredPlayerCount: 2,
    })
  })

  it('falls back to safe defaults for unknown game type', () => {
    const requirements = getLobbyPlayerRequirements('unknown_game')

    expect(requirements).toEqual({
      gameType: 'unknown_game',
      supportsBots: false,
      minPlayersRequired: 2,
      desiredPlayerCount: 2,
    })
  })
})
