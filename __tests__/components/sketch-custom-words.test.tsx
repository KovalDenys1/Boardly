import { fireEvent, render, screen } from '@testing-library/react'
import SketchCustomWords from '@/app/lobby/[code]/components/SketchCustomWords'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}))

describe('SketchCustomWords (#1086)', () => {
  beforeEach(() => window.localStorage.clear())

  it('keeps the host\'s list on this device and says how it will be used', () => {
    const { unmount } = render(<SketchCustomWords />)
    expect(screen.getByTestId('sketch-custom-words-row').textContent).toContain('customWords.summaryOff')
    fireEvent.click(screen.getByTestId('sketch-custom-words-row'))

    const box = screen.getByRole('textbox')
    fireEvent.change(box, { target: { value: 'a, b, c' } })
    expect(screen.getByText(/customWords.tooFew/)).toBeTruthy()
    fireEvent.change(box, { target: { value: 'a,b,c,d,e,f,g,h,i,j,k' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByText('games.guess_my_drawing.customWords.save'))
    expect(screen.getByTestId('sketch-custom-words-row').textContent).toContain('customWords.summaryOnly:{"count":11}')
    unmount()

    render(<SketchCustomWords />)
    expect(screen.getByTestId('sketch-custom-words-row').textContent).toContain('customWords.summaryOnly:{"count":11}')
  })
})
