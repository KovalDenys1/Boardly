import { faceUpCardIds, idsAddedSince, matchedCardIds, takeRemoteFlips } from '@/lib/memory-motion'

const card = (id: string, isFlipped = false, isMatched = false) => ({ id, isFlipped, isMatched })

describe('memory motion', () => {
  it('reports nothing new for the first snapshot', () => {
    expect(idsAddedSince(null, ['a', 'b'])).toEqual([])
  })

  it('finds cards that just turned face up or just matched', () => {
    const before = [card('a'), card('b', true), card('c')]
    const after = [card('a', true), card('b', true, true), card('c')]
    expect(idsAddedSince(new Set(faceUpCardIds(before)), faceUpCardIds(after))).toEqual(['a'])
    expect(idsAddedSince(new Set(matchedCardIds(before)), matchedCardIds(after))).toEqual(['b'])
  })

  it('separates the viewer’s own flips from arriving ones, once each', () => {
    const own = new Set(['a'])
    expect(takeRemoteFlips(['a', 'b'], own)).toEqual(['b'])
    // 'a' was consumed: if it goes face down and the opponent turns it later, it sounds.
    expect(own.has('a')).toBe(false)
    expect(takeRemoteFlips(['a'], own)).toEqual(['a'])
  })
})
