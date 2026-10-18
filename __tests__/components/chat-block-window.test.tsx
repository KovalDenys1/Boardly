/**
 * #1466, refuter breach 2: a signed-in player's blocks live on the account, so every Chat and the
 * chat hook used to show and sound a blocked player's messages until GET /api/user/blocks answered,
 * and for the rest of the page when it failed. Now the last list is kept on the device and by the
 * page, nothing is shown before a list is known, and a block reaches every instance at once.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import Chat from '@/components/Chat'
import { useLobbyChat } from '@/app/lobby/[code]/hooks/useLobbyChat'
import { useBlockedPlayers } from '@/hooks/useBlockedPlayers'
import { playCue } from '@/lib/sound-engine'
import type { ChatMessagePayload } from '@/types/game'

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'u1', name: 'Me' } }, status: 'authenticated' }),
}))
jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: false, guestToken: null, guestId: null, guestName: null }),
}))
jest.mock('@/lib/fetch-with-guest', () => ({ fetchWithGuest: jest.fn() }))
jest.mock('@/lib/client/fetch-with-guest', () => ({ fetchWithGuest: jest.fn(), getGuestData: jest.fn() }))
jest.mock('@/lib/i18n-toast', () => ({ showToast: { error: jest.fn() } }))
jest.mock('@/lib/i18n-helpers', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

const CACHE = 'boardly_blocked_players_account:u1'
const BOB = { id: 'u2', username: 'Bob', blockedAt: '2026-10-18T12:00:00.000Z' }
const messages = [
  { id: 'm1', userId: 'u3', username: 'Alice', message: 'hello there', timestamp: Date.now() },
  { id: 'm2', userId: 'u2', username: 'Bob', message: 'BLOCKED TEXT', timestamp: Date.now() },
]

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

type Answer = (response: Response) => void

/** GET /api/user/blocks per `read`; POST per `post`. */
function serve({ read, post }: { read: () => Promise<Response>; post?: () => Promise<Response> }) {
  const fetchMock = jest.fn((url: string, init?: RequestInit) => {
    if (url === '/api/user/blocks' && (init?.method ?? 'GET') === 'GET') return read()
    if (url === '/api/user/blocks' && init?.method === 'POST') return post ? post() : Promise.resolve(json({ blocks: [] }))
    return Promise.resolve(json({}))
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

const pending = (capture: (answer: Answer) => void = () => {}) => () =>
  new Promise<Response>((resolve) => capture(resolve))

const renderChat = () =>
  render(<Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />)

describe('Chat and the block list of a signed-in player (#1466)', () => {
  const originalFetch = global.fetch

  beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn()
  })

  beforeEach(() => {
    window.localStorage.clear()
    jest.clearAllMocks()
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('never renders a blocked player while the list is read again, when the last list is on the device', async () => {
    window.localStorage.setItem(CACHE, JSON.stringify([BOB]))
    let answer: Answer = () => {}
    serve({ read: pending((resolve) => (answer = resolve)) })

    renderChat()
    expect(screen.queryByText('BLOCKED TEXT')).toBeNull()
    expect(screen.getByText('hello there')).toBeTruthy()

    await act(async () => answer(json({ blocks: [BOB] })))
    expect(screen.queryByText('BLOCKED TEXT')).toBeNull()
  })

  it('renders no message until the first list answers, then only the ones not blocked', async () => {
    let answer: Answer = () => {}
    serve({ read: pending((resolve) => (answer = resolve)) })

    renderChat()
    await act(async () => {})
    expect(screen.queryByText('hello there')).toBeNull()
    expect(screen.queryByText('BLOCKED TEXT')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('common.loading')

    await act(async () => answer(json({ blocks: [BOB] })))
    expect(screen.getByText('hello there')).toBeTruthy()
    expect(screen.queryByText('BLOCKED TEXT')).toBeNull()
  })

  it('keeps hiding the player with the last list when the read fails', async () => {
    window.localStorage.setItem(CACHE, JSON.stringify([BOB]))
    const fetchMock = serve({ read: () => Promise.resolve(json({ error: 'x' }, 500)) })

    renderChat()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByText('BLOCKED TEXT')).toBeNull()
    expect(screen.getByText('hello there')).toBeTruthy()
    expect(screen.queryByText('blockedPlayers.loadFailed')).toBeNull()
  })

  it('says so, with Retry, when the read fails and no list is known, and shows the messages meanwhile', async () => {
    let fail = true
    const fetchMock = serve({
      read: () => Promise.resolve(fail ? json({ error: 'x' }, 500) : json({ blocks: [BOB] })),
    })

    renderChat()
    expect(await screen.findByText('blockedPlayers.loadFailed')).toBeTruthy()
    expect(screen.getByText('hello there')).toBeTruthy()
    expect(screen.getByText('BLOCKED TEXT')).toBeTruthy()

    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'blockedPlayers.retry' }))
    await waitFor(() => expect(screen.queryByText('BLOCKED TEXT')).toBeNull())
    expect(screen.queryByText('blockedPlayers.loadFailed')).toBeNull()
    expect(fetchMock.mock.calls.filter(([url, init]) => url === '/api/user/blocks' && !init?.method)).toHaveLength(2)
  })

  it('has no window when a chat tab remounts its Chat, even if the device keeps nothing', async () => {
    serve({ read: () => Promise.resolve(json({ blocks: [BOB] })) })
    function Holder() {
      useBlockedPlayers()
      return null
    }
    const { rerender } = render(
      <>
        <Holder />
        <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />
      </>
    )
    await waitFor(() => expect(screen.getByText('hello there')).toBeTruthy())
    expect(screen.queryByText('BLOCKED TEXT')).toBeNull()

    rerender(<Holder />)
    window.localStorage.clear()
    serve({ read: pending() })
    rerender(
      <>
        <Holder />
        <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />
      </>
    )
    expect(screen.getByText('hello there')).toBeTruthy()
    expect(screen.queryByText('BLOCKED TEXT')).toBeNull()
  })
})

describe('useLobbyChat and the block list of a signed-in player (#1466)', () => {
  const originalFetch = global.fetch
  const sound = playCue as jest.MockedFunction<typeof playCue>
  let chat: ReturnType<typeof useLobbyChat> | null = null

  function Page({ expose }: { expose: (hook: ReturnType<typeof useLobbyChat>) => void }) {
    const hook = useLobbyChat({ code: 'ABCD', isChatVisible: false })
    useEffect(() => {
      expose(hook)
    })
    return <Chat messages={hook.chatMessages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />
  }
  const renderPage = () =>
    render(
      <Page
        expose={(hook) => {
          chat = hook
        }}
      />
    )

  const say = (id: string, userId: string, text: string) =>
    act(() => chat!.onChatMessage({ id, userId, username: userId === 'u2' ? 'Bob' : 'Alice', message: text, timestamp: 1 } as ChatMessagePayload))

  beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn()
  })

  beforeEach(() => {
    window.localStorage.clear()
    jest.clearAllMocks()
    chat = null
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('neither counts nor sounds a message that lands before any list is known', async () => {
    serve({ read: pending() })
    renderPage()
    await act(async () => {})

    say('x1', 'u2', 'BLOCKED TEXT')
    expect(chat!.unreadCount).toBe(0)
    expect(sound).not.toHaveBeenCalled()
  })

  it('goes quiet about a player the moment they are blocked, before the server answers', async () => {
    let answerPost: Answer = () => {}
    serve({ read: () => Promise.resolve(json({ blocks: [] })), post: pending((resolve) => (answerPost = resolve)) })
    renderPage()
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    say('x1', 'u2', 'first')
    const blockButton = await screen.findByRole('button', { name: 'chat.blockPlayer' })
    await waitFor(() => expect((blockButton as HTMLButtonElement).disabled).toBe(false))
    expect(chat!.unreadCount).toBe(1)
    expect(sound).toHaveBeenCalledTimes(1)

    fireEvent.click(blockButton)
    fireEvent.click(screen.getByRole('button', { name: 'chat.blockAction' }))
    await waitFor(() => expect(screen.queryByText('first')).toBeNull())

    say('x2', 'u2', 'second')
    expect(chat!.unreadCount).toBe(1)
    expect(sound).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('second')).toBeNull()

    await act(async () => answerPost(json({ blocks: [BOB] })))
    expect(screen.queryByText('second')).toBeNull()
  })
})
