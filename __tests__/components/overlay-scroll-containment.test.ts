import { readFileSync } from 'fs'
import path from 'path'

// A scroll region inside an overlay hands its leftover scroll to the page behind it unless it contains it.
const OVERLAYS = ['components/Modal.tsx', 'components/Header/NavDrawer.tsx', 'components/FriendsListModal.tsx']

describe.each(OVERLAYS)('%s', (file) => {
  it('contains the scroll of every scrolling region it draws', () => {
    const src = readFileSync(path.join(__dirname, '..', '..', file), 'utf8')
    const scrolling = src.split('\n').filter((line) => /\boverflow-(?:y-)?auto\b/.test(line))
    expect(scrolling.length).toBeGreaterThan(0)
    expect(scrolling.filter((line) => !line.includes('overscroll-contain')).map((line) => line.trim())).toEqual([])
  })
})
