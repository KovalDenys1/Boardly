import { parseSketchLiveMessage } from '@/lib/sketch-live'

const expected = { round: 2, drawerId: 'user-2' }
const stroke = { color: '#E4572E', width: 3, points: [{ x: 1, y: 2 }] }

describe('parseSketchLiveMessage', () => {
  it('accepts finished strokes and a stroke in progress from the current drawer', () => {
    expect(parseSketchLiveMessage({ kind: 'strokes', round: 2, drawerId: 'user-2', strokes: [stroke] }, expected))
      .toEqual({ kind: 'strokes', round: 2, drawerId: 'user-2', strokes: [stroke] })
    expect(parseSketchLiveMessage({ kind: 'live', round: 2, drawerId: 'user-2', live: stroke }, expected))
      .toEqual({ kind: 'live', round: 2, drawerId: 'user-2', live: stroke })
    expect(parseSketchLiveMessage({ kind: 'live', round: 2, drawerId: 'user-2', live: null }, expected))
      .toEqual({ kind: 'live', round: 2, drawerId: 'user-2', live: null })
  })

  it('drops another sender, another round, or no drawer at all', () => {
    expect(parseSketchLiveMessage({ kind: 'strokes', round: 2, drawerId: 'user-3', strokes: [] }, expected)).toBeNull()
    expect(parseSketchLiveMessage({ kind: 'strokes', round: 1, drawerId: 'user-2', strokes: [] }, expected)).toBeNull()
    expect(parseSketchLiveMessage({ kind: 'strokes', round: 2, drawerId: '', strokes: [] }, { round: 2, drawerId: '' })).toBeNull()
  })

  it('drops malformed bodies instead of painting them', () => {
    expect(parseSketchLiveMessage(null, expected)).toBeNull()
    expect(parseSketchLiveMessage({ kind: 'other', round: 2, drawerId: 'user-2' }, expected)).toBeNull()
    expect(parseSketchLiveMessage({ kind: 'strokes', round: 2, drawerId: 'user-2', strokes: [{ color: 1 }] }, expected)).toBeNull()
    expect(parseSketchLiveMessage({ kind: 'live', round: 2, drawerId: 'user-2', live: { ...stroke, points: [{ x: 'a', y: 1 }] } }, expected)).toBeNull()
  })

  it('refuses more points than the canvas itself allows', () => {
    const big = { color: '#1F1B16', width: 3, points: Array.from({ length: 3001 }, (_, i) => ({ x: i % 480, y: 1 })) }
    expect(parseSketchLiveMessage({ kind: 'strokes', round: 2, drawerId: 'user-2', strokes: [big] }, expected)).toBeNull()
  })
})
