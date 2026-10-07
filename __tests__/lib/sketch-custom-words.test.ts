import { parseSketchCustomWords, resolveSketchCustomWords, sketchCustomWordsRules } from '@/lib/sketch-custom-words'

describe('sketch custom words (#1086)', () => {
  it('splits on commas and lines, trims, drops repeats regardless of case and anything over 32 characters', () => {
    expect(parseSketchCustomWords('pizza,  Pizza\n big   dog ,,' + 'x'.repeat(33) + ', hat')).toEqual(['pizza', 'big dog', 'hat'])
  })

  it('takes the list only at ten words or more', () => {
    const nine = Array.from({ length: 9 }, (_, i) => `w${i}`)
    expect(resolveSketchCustomWords({ customWords: nine })).toBeNull()
    expect(resolveSketchCustomWords({ customWords: [...nine, 'w9'], customWordsOnly: true })).toEqual({ words: [...nine, 'w9'], only: true })
    expect(sketchCustomWordsRules({ text: nine.join(','), only: true })).toEqual({})
  })

  it('ignores what is not text', () => {
    expect(resolveSketchCustomWords({ customWords: [1, null, {}] })).toBeNull()
    expect(resolveSketchCustomWords(null)).toBeNull()
  })
})
