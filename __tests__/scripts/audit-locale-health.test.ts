// @ts-nocheck

import { inspectLocales } from '@/scripts/audit-locale-health'

const bundles = (overrides: Record<string, unknown> = {}) => ({
  en: { lobby: { create: 'Create lobby' } },
  no: { lobby: { create: 'Lag lobby' } },
  ru: { lobby: { create: 'Создать лобби' } },
  uk: { lobby: { create: 'Створити лобі' } },
  ...overrides,
})

describe('audit-locale-health — placeholder parity', () => {
  /**
   * The silent one. i18next interpolates nothing when the placeholder is not in
   * the string, so a translator who drops `{{game}}` deletes the game's name
   * from the sentence with no error anywhere.
   */
  it('catches a placeholder a translation dropped', () => {
    const report = inspectLocales({
      en: { lobby: { heading: 'Set up your {{game}} room' } },
      no: { lobby: { heading: 'Sett opp {{game}}-rommet' } },
      ru: { lobby: { heading: 'Настройте комнату' } },
      uk: { lobby: { heading: 'Налаштуйте кімнату {{game}}' } },
    })

    expect(report.placeholderMismatches).toEqual([
      'ru lobby.heading: en interpolates [game], ru interpolates [none]',
    ])
  })

  it('catches a placeholder a translation invented', () => {
    const report = inspectLocales({
      en: { lobby: { heading: 'Your room' } },
      no: { lobby: { heading: 'Rommet ditt' } },
      ru: { lobby: { heading: 'Комната {{name}}' } },
      uk: { lobby: { heading: 'Ваша кімната' } },
    })

    expect(report.placeholderMismatches).toHaveLength(1)
    expect(report.placeholderMismatches[0]).toContain('ru interpolates [name]')
  })

  it('does not care about placeholder order', () => {
    const report = inspectLocales({
      en: { lobby: { line: '{{a}} then {{b}}' } },
      no: { lobby: { line: '{{b}} etter {{a}}' } },
      ru: { lobby: { line: '{{b}} после {{a}}' } },
      uk: { lobby: { line: '{{b}} після {{a}}' } },
    })

    expect(report.placeholderMismatches).toEqual([])
  })

  it('is quiet when every locale agrees', () => {
    expect(inspectLocales(bundles()).placeholderMismatches).toEqual([])
  })
})

describe('audit-locale-health — duplicate values', () => {
  it('reports two keys holding one string in the same namespace', () => {
    const report = inspectLocales(
      bundles({ en: { game: { ui: { versus: 'vs', vs: 'vs' } } } })
    )

    expect(report.duplicateValues).toEqual(['game.ui: "vs" — game.ui.versus, game.ui.vs'])
  })

  it('does not report the same string in two different namespaces', () => {
    const report = inspectLocales(
      bundles({ en: { header: { close: 'Close' }, footer: { close: 'Close' } } })
    )

    expect(report.duplicateValues).toEqual([])
  })

  /**
   * English's base form and `_one` are the same sentence, so a plural family is
   * one key wearing several suffixes, not a duplicate of itself.
   */
  it('treats a plural family as one key', () => {
    const report = inspectLocales(
      bundles({
        en: { lobby: { n: '{{count}} lobby', n_one: '{{count}} lobby', n_other: '{{count}} lobbies' } },
      })
    )

    expect(report.duplicateValues).toEqual([])
  })

  it('ignores values that are not copy', () => {
    const report = inspectLocales(bundles({ en: { game: { a: '·', b: '·' } } }))

    expect(report.duplicateValues).toEqual([])
  })
})

describe('audit-locale-health — untranslated values', () => {
  it('reports a value left identical to English', () => {
    const report = inspectLocales({
      en: { profile: { save: 'Save changes' } },
      no: { profile: { save: 'Lagre endringer' } },
      ru: { profile: { save: 'Save changes' } },
      uk: { profile: { save: 'Зберегти зміни' } },
    })

    expect(report.untranslated).toEqual(['ru profile.save = "Save changes"'])
  })

  it('does not report a word that is genuinely the same in both languages', () => {
    const report = inspectLocales({
      en: { footer: { discord: 'Discord' } },
      no: { footer: { discord: 'Discord' } },
      ru: { footer: { discord: 'Discord' } },
      uk: { footer: { discord: 'Discord' } },
    })

    // It is reported — the script cannot know — which is exactly why this check
    // is ratcheted against a baseline rather than run as a hard gate.
    expect(report.untranslated).toHaveLength(3)
  })
})
