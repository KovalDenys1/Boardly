import i18n, { changeLanguageLazy } from '@/i18n'

/**
 * Russian and Ukrainian have three plural forms where English has two: `one`
 * (1, 21, 31 …), `few` (2-4, 22-24 …) and `many` (5-20, 0 …). Until #1059 the
 * locale files carried only a base key and `_other`, so "Пригласить 3 друзей"
 * and "3 очков" shipped - wrong in the middle of a game.
 *
 * These assertions fail if someone deletes a `_few` or `_many` form. Nothing
 * throws when that happens and no type breaks, because i18next quietly falls
 * back to the base key; the only symptom is that 1, 3 and 5 start rendering
 * the same noun again. So the comparison has to be on the WORDS, with the
 * number itself masked out - otherwise "1 повідомлення" and "3 повідомлення"
 * look different while being the same broken form.
 *
 * `scripts/check-locales.ts` is the other half of the guard: it allows a
 * `_few` key whose base exists in `en`, and still rejects a stray one.
 */

/** Keys whose three forms are genuinely distinct words in both languages. */
const THREE_FORM_KEYS = [
  'lobby.create.rounds',
  'lobby.create.preview.players',
  'games.rock_paper_scissors.playersCount',
  'game.ui.playersInLobby',
  'yahtzee.results.points',
  'yahtzee.ui.holdingDice',
  'profile.chips.games',
  'profile.chips.friends',
] as const

const LOCALES = ['ru', 'uk'] as const

/** The rendered string with the number masked, i.e. the plural form alone. */
function form(key: string, count: number): string {
  return i18n.t(key, { count }).replace(String(count), '#')
}

describe('Russian and Ukrainian plural forms', () => {
  for (const locale of LOCALES) {
    describe(locale, () => {
      beforeAll(async () => {
        await changeLanguageLazy(locale)
      })

      it.each(THREE_FORM_KEYS)('has three distinct forms for %s', (key) => {
        expect(new Set([form(key, 1), form(key, 3), form(key, 5)]).size).toBe(3)
      })

      it.each(THREE_FORM_KEYS)('follows the teens and -1/-2 rules for %s', (key) => {
        // 21 takes `one`, 22 takes `few`, 11 takes `many` — the part of the
        // rule a two-form locale file cannot express at all.
        expect(form(key, 21)).toBe(form(key, 1))
        expect(form(key, 22)).toBe(form(key, 3))
        expect(form(key, 11)).toBe(form(key, 5))
      })

      it('puts the count inside the sentence, not after a colon', () => {
        // v1.24.0 (#889) phrased these count-neutral ("Удерживает кубиков: 3")
        // because `_few` could not be added yet. Plurals work now, so the
        // label form should not come back.
        const unwound = [
          'yahtzee.ui.holdingDice',
          'yahtzee.ui.rollsLeftCount',
          'yahtzee.history.heldForNext',
          'alias.playersCount',
          'alias.wordsCount',
          'alias.secondsRemainingAria',
          'games.tictactoe.game.drawsCount',
        ]

        for (const key of unwound) {
          for (const count of [1, 3, 5]) {
            expect(i18n.t(key, { count })).not.toMatch(/:\s*\d+\s*\.?$/)
          }
        }
      })
    })
  }

  it('leaves English on its own two forms', async () => {
    await changeLanguageLazy('en')

    expect(i18n.t('lobby.invite.send', { count: 1 })).toBe('Invite 1 friend')
    expect(i18n.t('lobby.invite.send', { count: 3 })).toBe('Invite 3 friends')
    // English has no `few`: 3 and 5 are the same form, which is the point.
    expect(form('lobby.invite.send', 3)).toBe(form('lobby.invite.send', 5))
  })
})
