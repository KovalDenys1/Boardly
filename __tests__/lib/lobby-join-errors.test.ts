import {
  LOBBY_JOIN_REFUSAL_CODES,
  getLobbyJoinRefusalMessageKey,
  isLobbyJoinRefusalCode,
} from '@/lib/lobby-join-errors'
import en from '@/locales/en'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'

function lookup(locale: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>(
    (node, segment) =>
      node && typeof node === 'object' ? (node as Record<string, unknown>)[segment] : undefined,
    locale
  )
}

describe('lobby join refusal codes (#967)', () => {
  it('maps every refusal to a key, and nothing else to one', () => {
    expect(getLobbyJoinRefusalMessageKey('LOBBY_FULL')).toBe('lobby.joinSection.lobbyFull')
    expect(getLobbyJoinRefusalMessageKey('GAME_IN_PROGRESS')).toBe('lobby.joinSection.gameInProgress')
    expect(getLobbyJoinRefusalMessageKey('WRONG_PASSWORD')).toBeNull()
    expect(getLobbyJoinRefusalMessageKey(undefined)).toBeNull()
    expect(isLobbyJoinRefusalCode('Lobby is full')).toBe(false)
  })

  it('has a real sentence in all four locales for each refusal', () => {
    // The point of the ticket: the join screen showed the server's English to
    // every locale, so a missing key here is the bug coming back.
    for (const code of LOBBY_JOIN_REFUSAL_CODES) {
      const key = getLobbyJoinRefusalMessageKey(code)!
      for (const [name, locale] of [['en', en], ['no', no], ['ru', ru], ['uk', uk]] as const) {
        expect({ code, name, value: typeof lookup(locale, key) }).toEqual({
          code,
          name,
          value: 'string',
        })
        expect(lookup(locale, key)).not.toHaveLength(0)
      }
    }
  })

  it('does not repeat the English sentence in the other three locales', () => {
    const key = getLobbyJoinRefusalMessageKey('LOBBY_FULL')!
    const english = lookup(en, key)
    for (const locale of [no, ru, uk]) {
      expect(lookup(locale, key)).not.toBe(english)
    }
  })
})
