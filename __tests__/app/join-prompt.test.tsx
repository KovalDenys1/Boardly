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

  describe('a full lobby is not a dead end (#957)', () => {
    const fullLobby = {
      code: 'ABCD',
      name: 'Open Lobby',
      isPrivate: false,
      gameType: 'connect_four',
    }

    it('offers a lobby of their own for the same game when the room is full', () => {
      const onCreateOwnLobby = jest.fn()

      render(
        <JoinPrompt
          lobby={fullLobby}
          viewerMode="authenticated"
          guestName=""
          setGuestName={jest.fn()}
          password=""
          setPassword={jest.fn()}
          error="lobby.joinSection.lobbyFull"
          errorCode="LOBBY_FULL"
          isJoining={false}
          onJoin={jest.fn()}
          onJoinAsGuest={jest.fn()}
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onCreateOwnLobby={onCreateOwnLobby}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /lobby\.joinSection\.createOwnLobby/ }))

      expect(onCreateOwnLobby).toHaveBeenCalledTimes(1)
    })

    it('leaves other join failures alone – only a full room gets the fallback', () => {
      render(
        <JoinPrompt
          lobby={fullLobby}
          viewerMode="authenticated"
          guestName=""
          setGuestName={jest.fn()}
          password=""
          setPassword={jest.fn()}
          error="Wrong password"
          isJoining={false}
          onJoin={jest.fn()}
          onJoinAsGuest={jest.fn()}
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onCreateOwnLobby={jest.fn()}
        />
      )

      expect(screen.queryByRole('button', { name: /lobby\.joinSection\.createOwnLobby/ })).toBeNull()
    })

    it('waits for a usable name before an anonymous visitor can take it', () => {
      const { rerender } = render(
        <JoinPrompt
          lobby={fullLobby}
          viewerMode="anonymous"
          guestName=""
          setGuestName={jest.fn()}
          password=""
          setPassword={jest.fn()}
          error="lobby.joinSection.lobbyFull"
          errorCode="LOBBY_FULL"
          isJoining={false}
          onJoin={jest.fn()}
          onJoinAsGuest={jest.fn()}
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onCreateOwnLobby={jest.fn()}
        />
      )

      expect(
        screen.getByRole('button', { name: /lobby\.joinSection\.createOwnLobby/ }).hasAttribute('disabled')
      ).toBe(true)

      rerender(
        <JoinPrompt
          lobby={fullLobby}
          viewerMode="anonymous"
          guestName="Guest One"
          setGuestName={jest.fn()}
          password=""
          setPassword={jest.fn()}
          error="lobby.joinSection.lobbyFull"
          errorCode="LOBBY_FULL"
          isJoining={false}
          onJoin={jest.fn()}
          onJoinAsGuest={jest.fn()}
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onCreateOwnLobby={jest.fn()}
        />
      )

      expect(
        screen.getByRole('button', { name: /lobby\.joinSection\.createOwnLobby/ }).hasAttribute('disabled')
      ).toBe(false)
    })

    it('shows the room-is-full fallback off the code, not the English sentence (#967)', () => {
      // The server still sends "Lobby is full" as its `error` body, but the
      // sentence the visitor reads is now translated, so matching on it would
      // have silently dropped the fallback for every non-English locale.
      render(
        <JoinPrompt
          lobby={{ ...fullLobby, allowSpectators: true }}
          viewerMode="authenticated"
          guestName=""
          setGuestName={jest.fn()}
          password=""
          setPassword={jest.fn()}
          error="Лобби заполнено"
          errorCode="LOBBY_FULL"
          isJoining={false}
          onJoin={jest.fn()}
          onJoinAsGuest={jest.fn()}
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onWatchAsSpectator={jest.fn()}
          onCreateOwnLobby={jest.fn()}
        />
      )

      expect(screen.getByRole('button', { name: /lobby\.joinSection\.watchInstead/ })).toBeTruthy()
      expect(screen.getByRole('button', { name: /lobby\.joinSection\.createOwnLobby/ })).toBeTruthy()
    })

    it('does not offer a seat elsewhere for a game already in progress', () => {
      render(
        <JoinPrompt
          lobby={{ ...fullLobby, allowSpectators: true }}
          viewerMode="authenticated"
          guestName=""
          setGuestName={jest.fn()}
          password=""
          setPassword={jest.fn()}
          error="lobby.joinSection.gameInProgress"
          errorCode="GAME_IN_PROGRESS"
          isJoining={false}
          onJoin={jest.fn()}
          onJoinAsGuest={jest.fn()}
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onWatchAsSpectator={jest.fn()}
          onCreateOwnLobby={jest.fn()}
        />
      )

      expect(screen.queryByRole('button', { name: /lobby\.joinSection\.createOwnLobby/ })).toBeNull()
    })

    it('still offers to watch a game already in progress (#972)', () => {
      // The visitor used to be redirected to the spectator page for this refusal, so
      // dropping the redirect has to leave the offer somewhere they can take it.
      const onWatchAsSpectator = jest.fn()

      render(
        <JoinPrompt
          lobby={{ ...fullLobby, allowSpectators: true }}
          viewerMode="authenticated"
          guestName=""
          setGuestName={jest.fn()}
          password=""
          setPassword={jest.fn()}
          error="lobby.joinSection.gameInProgress"
          errorCode="GAME_IN_PROGRESS"
          isJoining={false}
          onJoin={jest.fn()}
          onJoinAsGuest={jest.fn()}
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onWatchAsSpectator={onWatchAsSpectator}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /lobby\.joinSection\.watchInstead/ }))

      expect(onWatchAsSpectator).toHaveBeenCalledTimes(1)
    })

    it('does not offer to watch a lobby that has spectators switched off', () => {
      render(
        <JoinPrompt
          lobby={{ ...fullLobby, allowSpectators: false }}
          viewerMode="authenticated"
          guestName=""
          setGuestName={jest.fn()}
          password=""
          setPassword={jest.fn()}
          error="lobby.joinSection.lobbyFull"
          errorCode="LOBBY_FULL"
          isJoining={false}
          onJoin={jest.fn()}
          onJoinAsGuest={jest.fn()}
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onWatchAsSpectator={jest.fn()}
        />
      )

      expect(screen.queryByRole('button', { name: /lobby\.joinSection\.watchInstead/ })).toBeNull()
    })

    it('translates the spectator fallback instead of hardcoding English', () => {
      render(
        <JoinPrompt
          lobby={{ ...fullLobby, allowSpectators: true }}
          viewerMode="authenticated"
          guestName=""
          setGuestName={jest.fn()}
          password=""
          setPassword={jest.fn()}
          error="lobby.joinSection.lobbyFull"
          errorCode="LOBBY_FULL"
          isJoining={false}
          onJoin={jest.fn()}
          onJoinAsGuest={jest.fn()}
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onWatchAsSpectator={jest.fn()}
        />
      )

      expect(screen.getByRole('button', { name: /lobby\.joinSection\.watchInstead/ })).toBeTruthy()
      expect(screen.queryByText(/Watch as spectator instead/)).toBeNull()
    })
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
