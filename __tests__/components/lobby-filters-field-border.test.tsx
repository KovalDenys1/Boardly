import { render } from '@testing-library/react'
import LobbyFilters from '@/components/LobbyFilters'

// --bd-line is a decorative 1.3:1 edge; a field's resting border needs 3:1 (WCAG 1.4.11), which is --bd-input-border.
it('draws every lobby filter field with the input border, not the decorative line', () => {
  const { container } = render(
    <LobbyFilters filters={{ status: 'all', search: 'x', minPlayers: 2, sortBy: 'createdAt', sortOrder: 'desc' }} onFiltersChange={() => {}} />,
  )
  const fields = [...container.querySelectorAll('input')]
  expect(fields.length).toBeGreaterThanOrEqual(3)
  for (const field of fields) {
    expect(field.className).not.toMatch(/(?<![\w:-])border-bd-line\b/)
    expect(field.className).toMatch(/border-(?:\(--bd-input-border\)|bd-input-border)(?![\w-])/)
  }
})
