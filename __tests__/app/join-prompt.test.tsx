import { fireEvent, render, screen } from '@testing-library/react'
import JoinPrompt from '@/app/lobby/[code]/components/JoinPrompt'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('JoinPrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders guest join and auth actions inline for anonymous visitors', () => {
    const onJoin = jest.fn()
    const onJoinAsGuest = jest.fn()

    render(
      <JoinPrompt
        lobby={{
          code: 'ABCD',
          name: 'Secret Lobby',
          isPrivate: true,
          gameType: 'yahtzee',
        }}
        viewerMode="anonymous"
        guestName="Guest One"
        setGuestName={jest.fn()}
        password=""
        setPassword={jest.fn()}
        error={null}
        isJoining={false}
        onJoin={onJoin}
        onJoinAsGuest={onJoinAsGuest}
        onLogin={jest.fn()}
        onRegister={jest.fn()}
      />
    )

    expect(screen.getByPlaceholderText('guest.namePlaceholder')).toBeTruthy()
    expect(screen.getByPlaceholderText('lobby.joinSection.passwordPlaceholder')).toBeTruthy()
    expect(screen.getByRole('button', { name: /guest\.playAsGuest/ }).getAttribute('disabled')).toBeNull()
    expect(screen.getByRole('button', { name: /auth\.login\.submit/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /auth\.register\.title/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /guest\.playAsGuest/ }))

    expect(onJoinAsGuest).toHaveBeenCalledTimes(1)
    expect(onJoin).not.toHaveBeenCalled()
  })

  it('keeps authenticated users on the regular join action flow', () => {
    const onJoin = jest.fn()

    render(
      <JoinPrompt
        lobby={{
          code: 'WXYZ',
          name: 'Open Lobby',
          isPrivate: false,
          gameType: 'spy',
        }}
        viewerMode="authenticated"
        guestName=""
        setGuestName={jest.fn()}
        password=""
        setPassword={jest.fn()}
        error={null}
        isJoining={false}
        onJoin={onJoin}
        onJoinAsGuest={jest.fn()}
        onLogin={jest.fn()}
        onRegister={jest.fn()}
      />
    )

    expect(screen.queryByPlaceholderText('guest.namePlaceholder')).toBeNull()
    expect(screen.queryByRole('button', { name: /auth\.login\.submit/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /auth\.register\.title/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /lobby\.joinSection\.join/ }))

    expect(onJoin).toHaveBeenCalledTimes(1)
  })
})
