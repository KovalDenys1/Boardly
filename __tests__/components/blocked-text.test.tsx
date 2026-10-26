import { fireEvent, render, screen } from '@testing-library/react'
import BlockedText from '@/components/BlockedText'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

let mockList: { ready: boolean; unknown: boolean; accountId?: string } = { ready: true, unknown: false }
jest.mock('@/hooks/useBlockedPlayers', () => ({
  useBlockedPlayers: () => mockList,
}))

beforeEach(() => {
  mockList = { ready: true, unknown: false, accountId: 'me' }
})

describe('BlockedText', () => {
  it('shows the text of a player the viewer has not blocked', () => {
    render(<BlockedText blocked={false} from="rival" title="I can juggle">I can juggle</BlockedText>)

    expect(screen.getByText('I can juggle')).toBeInTheDocument()
    expect(screen.getByTitle('I can juggle')).toBeInTheDocument()
    expect(screen.queryByText('blockedPlayers.hiddenText')).not.toBeInTheDocument()
  })

  it('collapses a blocked player\'s text to one line until Show is pressed', () => {
    render(<BlockedText blocked from="rival" title="I can juggle">I can juggle</BlockedText>)

    expect(screen.queryByText('I can juggle')).not.toBeInTheDocument()
    expect(screen.queryByTitle('I can juggle')).not.toBeInTheDocument()
    expect(screen.getByText('blockedPlayers.hiddenText')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'blockedPlayers.show' }))

    expect(screen.getByText('I can juggle')).toBeInTheDocument()
    expect(screen.queryByText('blockedPlayers.hiddenText')).not.toBeInTheDocument()
  })

  it.each([
    ['is still loading', { ready: false, unknown: false, accountId: 'me' }],
    ['could not be read', { ready: true, unknown: true, accountId: 'me' }],
  ])('folds another player\'s text while the block list %s (#1510)', (_state, list) => {
    mockList = list

    render(<BlockedText blocked={false} from="rival" title="I can juggle">I can juggle</BlockedText>)

    expect(screen.queryByText('I can juggle')).not.toBeInTheDocument()
    expect(screen.queryByTitle('I can juggle')).not.toBeInTheDocument()
    expect(screen.getByText('blockedPlayers.hiddenText')).toBeInTheDocument()
  })

  it('keeps the viewer\'s own text while the block list is unknown', () => {
    mockList = { ready: false, unknown: false, accountId: 'me' }

    render(<BlockedText blocked={false} from="me">I can juggle</BlockedText>)

    expect(screen.getByText('I can juggle')).toBeInTheDocument()
  })
})
