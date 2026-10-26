import en from '@/locales/en'
import ru from '@/locales/ru'
import no from '@/locales/no'
import uk from '@/locales/uk'
import de from '@/locales/de'
import es from '@/locales/es'

// The pill is 10px/800 with 1px 4px padding under a die that is 49.6px wide on a
// 320px screen; measured in Chromium, five letters fit in every alphabet the site uses
// and "Behalten", "Guardado" and "Тримаю" did not.
const MAX_HELD_LABEL_CHARS = 5

describe('Yahtzee Held label (#1491)', () => {
  it.each(Object.entries({ en, ru, no, uk, de, es }))('fits under a die at 320px in %s', (_locale, messages) => {
    const label = (messages as typeof en).yahtzee.ui.heldLabel
    expect(label.length).toBeLessThanOrEqual(MAX_HELD_LABEL_CHARS)
  })
})
