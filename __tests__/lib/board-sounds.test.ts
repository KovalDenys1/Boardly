import { tttMarkSemis } from '@/lib/board-sounds'

it('taps X at the sample’s pitch and O a whole tone up', () => {
    expect(tttMarkSemis('X')).toBe(0)
    expect(tttMarkSemis('O')).toBe(2)
})
