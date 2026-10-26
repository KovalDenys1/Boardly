import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TermsConsentPanel from '@/components/TermsConsentPanel'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('TermsConsentPanel', () => {
  it('speaks about chat by default and about play in a game', () => {
    const { unmount } = render(<TermsConsentPanel onAccept={async () => true} />)
    expect(screen.getByRole('group', { name: 'chat.termsPrompt' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'chat.termsAccept' })).toBeTruthy()
    unmount()

    render(<TermsConsentPanel onAccept={async () => true} context="play" />)
    expect(screen.getByRole('group', { name: 'chat.termsPromptPlay' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'chat.termsAcceptPlay' })).toBeTruthy()
  })

  it('keeps the sentence as the group name and shows a lead and both links in the compact row', () => {
    render(<TermsConsentPanel onAccept={async () => true} context="play" compact />)
    expect(screen.getByRole('group', { name: 'chat.termsPromptPlay' })).toBeTruthy()
    expect(screen.getByText('chat.termsPromptPlay').className).toContain('sr-only')
    expect(screen.getByText('chat.termsCompactLead')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'chat.termsTerms' }).getAttribute('href')).toBe('/terms')
    expect(screen.getByRole('link', { name: 'chat.termsRules' }).getAttribute('href')).toBe('/rules')
  })

  it('says so when the acceptance was not stored', async () => {
    render(<TermsConsentPanel onAccept={async () => false} compact />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.termsAccept' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('chat.termsFailed'))
  })
})
