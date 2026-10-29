import fs from 'fs'
import path from 'path'
import { render, screen } from '@testing-library/react'
import ConfirmModal from '@/components/ConfirmModal'

// White on coral is 2.8:1 and on sun 1.6:1; text on an accent fill is --bd-ink-on-accent (DESIGN.md, #1171).
describe('buttons on an accent fill', () => {
  it.each(['danger', 'warning'] as const)('ConfirmModal %s writes its confirm label in ink-on-accent', (variant) => {
    render(<ConfirmModal isOpen onClose={() => {}} onConfirm={() => {}} title="Delete?" message="Sure?" confirmText="Yes" variant={variant} />)
    const confirm = screen.getByRole('button', { name: 'Yes' })
    expect(confirm.className).not.toMatch(/\btext-white\b/)
    expect(confirm.className).toMatch(/\btext-bd-ink-on-accent\b/)
  })

  it('ConfirmModal info, an ink fill, writes its confirm label in the page colour', () => {
    render(<ConfirmModal isOpen onClose={() => {}} onConfirm={() => {}} title="Note" message="Sure?" confirmText="OK" variant="info" />)
    expect(screen.getByRole('button', { name: 'OK' }).className).toMatch(/\btext-bd-bg\b/)
  })

  it('the tour writes no white label on its coral buttons and inks the selected sun tile in ink-on-accent', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'Tour', 'TourOverlay.tsx'), 'utf8')
    expect(src).not.toMatch(/\btext-white\b/)
    expect(src).toMatch(/quickStartGame === type \? 'var\(--bd-ink-on-accent\)'/)
  })

  it('the guides hero draws its game glyphs on the sun tiles in ink-on-accent, which stays dark in dark mode', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', '(site)', 'guides', 'page.tsx'), 'utf8')
    expect(src).toMatch(/<GameIcon gameId=\{gameId\} accentColor="var\(--bd-ink-on-accent\)" detailColor="var\(--bd-sun\)"/)
  })
})
