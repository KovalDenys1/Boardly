import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import Chat from '@/components/Chat'
import { fetchWithGuest } from '@/lib/client/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'

jest.mock('@/lib/client/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({ data: null, status: 'unauthenticated' })),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn() },
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// A plain anchor that shows what `prefetch` next/link was given; the rules link is the only
// Link in the panel.
jest.mock('next/link', () => {
  const React = require('react')
  const MockLink = React.forwardRef(
    ({ prefetch, children, ...rest }: { prefetch?: boolean; children?: React.ReactNode }, ref: unknown) =>
      React.createElement('a', { ...rest, ref, 'data-prefetch': String(prefetch) }, children)
  )
  MockLink.displayName = 'MockLink'
  return { __esModule: true, default: MockLink }
})

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView, which Chat's auto-scroll effect calls
  Element.prototype.scrollIntoView = jest.fn()
})

const messages = [
  { id: 'm1', userId: 'u1', username: 'Alice', message: 'hello there', timestamp: Date.now() },
  { id: 'm2', userId: 'u2', username: 'Bob', message: 'hi back', timestamp: Date.now() },
]

describe('Chat', () => {
  it('renders messages with usernames', () => {
    render(
      <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" fullScreen />
    )
    expect(screen.getByText('hello there')).toBeTruthy()
    expect(screen.getByText('hi back')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('shows unread badge in minimized mode', () => {
    render(
      <Chat messages={messages} onSendMessage={jest.fn()} isMinimized unreadCount={3} onToggleMinimize={jest.fn()} />
    )
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('hides the minimize control in fullScreen mode', () => {
    render(
      <Chat messages={[]} onSendMessage={jest.fn()} fullScreen />
    )
    expect(screen.queryByLabelText('chat.minimize')).toBeNull()
  })

  // #902: the title strip and the composer were ordinary flex items, so in a
  // short panel they shrank below their content and `overflow: hidden` cut
  // them off – Connect Four showed the title and nothing else, Memory put the
  // composer on top of its only message.
  it('keeps the title strip and the composer unshrinkable, and the list flexible', () => {
    const { container } = render(
      <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" fullScreen />
    )
    const titlebar = container.querySelector('.chat-titlebar') as HTMLElement
    const composer = container.querySelector('.chat-composer') as HTMLElement
    const list = container.querySelector('.chat-messages') as HTMLElement

    expect(titlebar.className).toContain('shrink-0')
    expect(composer.className).toContain('shrink-0')
    expect(list.className).toContain('flex-1')
    expect(list.className).toContain('min-h-0')
  })

  it('renders the composer for writers', () => {
    render(
      <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" fullScreen />
    )
    expect(screen.getByPlaceholderText('chat.placeholder')).toBeTruthy()
    expect(screen.getByLabelText('chat.send')).toBeTruthy()
  })

  it('hides the composer when readOnly (spectators)', () => {
    render(
      <Chat messages={messages} onSendMessage={jest.fn()} currentUserId={null} fullScreen readOnly />
    )
    expect(screen.queryByPlaceholderText('chat.placeholder')).toBeNull()
    expect(screen.queryByLabelText('chat.send')).toBeNull()
    // messages still visible
    expect(screen.getByText('hello there')).toBeTruthy()
  })
})

// #1172: another player's message can be reported from the bubble's own time row.
describe('Chat report action (#1172)', () => {
  const systemMessage = {
    id: 's1', userId: 'system', username: 'System', message: 'Bob joined', timestamp: Date.now(), type: 'system' as const,
  }

  it("offers Report on another player's message only: not your own, not a system line", () => {
    render(
      <Chat messages={[...messages, systemMessage]} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />
    )
    const buttons = screen.getAllByRole('button', { name: 'report.reportMessage' })
    expect(buttons).toHaveLength(1)
    expect(buttons[0].closest('.chat-messages')).not.toBeNull()
  })

  it('offers nothing without a lobby to report it in', () => {
    render(<Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" fullScreen />)
    expect(screen.queryByRole('button', { name: 'report.reportMessage' })).toBeNull()
  })

  it('offers nothing to a viewer with no identity to report as', () => {
    render(<Chat messages={messages} onSendMessage={jest.fn()} currentUserId={null} lobbyCode="4821" fullScreen readOnly />)
    expect(screen.queryByRole('button', { name: 'report.reportMessage' })).toBeNull()
  })

  it('adds no block to the panel: the action lives inside the message list', () => {
    const { container } = render(
      <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />
    )
    const panel = container.firstElementChild as HTMLElement
    // Title strip, message list, composer: the same three children as before.
    expect(panel.children).toHaveLength(3)
  })

  it('opens the report form with the message quoted and sends it as that message', async () => {
    ;(fetchWithGuest as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, duplicate: false }), { status: 201 })
    )
    render(<Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />)

    fireEvent.click(screen.getByRole('button', { name: 'report.reportMessage' }))
    expect(await screen.findByText('report.title')).toBeTruthy()
    // Once in the bubble, once quoted back in the form.
    expect(screen.getAllByText('hi back')).toHaveLength(2)

    fireEvent.click(screen.getByLabelText('report.reasons.spam'))
    fireEvent.click(screen.getByRole('button', { name: 'report.submit' }))
    await screen.findByText('report.successTitle')

    const [, init] = (fetchWithGuest as jest.Mock).mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({
      targetType: 'chat_message',
      targetId: 'm2',
      lobbyCode: '4821',
      reportedUserId: 'u2',
      quotedText: 'hi back',
      reason: 'spam',
    })
  })

  it('does not minimize the floating chat while the report form is in use', async () => {
    const onToggleMinimize = jest.fn()
    render(
      <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" onToggleMinimize={onToggleMinimize} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'report.reportMessage' }))
    const title = await screen.findByText('report.title')
    fireEvent.mouseDown(title)
    expect(onToggleMinimize).not.toHaveBeenCalled()
  })
})

// #1173: the community rules are one tap from every chat, and reaching them costs a game
// screen no room.
describe('Chat community rules link (#1173)', () => {
  it('links /rules from the title strip, in a new tab so a game is never left', () => {
    const { container } = render(
      <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" fullScreen />
    )
    const link = within(container.querySelector('.chat-titlebar') as HTMLElement).getByRole('link', { name: 'chat.rulesNewTab' })
    expect(link.getAttribute('href')).toBe('/rules')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.textContent).toBe('chat.rules')
    // Rarely opened, so it does not prefetch /rules on every game screen.
    expect(link.getAttribute('data-prefetch')).toBe('false')
  })

  // WCAG 2.5.3 Label in Name: a voice-control user says what they see, so the accessible name
  // must contain the visible label; here it starts with it, in every locale.
  it.each(['en', 'no', 'ru', 'uk', 'de', 'es'])('%s: the accessible name starts with the visible label', (locale) => {
    const bundle = require(`@/locales/${locale}`).default as { chat: { rules: string; rulesNewTab: string } }
    const visible = bundle.chat.rules.toLocaleLowerCase()
    const name = bundle.chat.rulesNewTab.toLocaleLowerCase()
    const firstWords = name.split(/[\s(),.:;]+/).slice(0, visible.split(/\s+/).length).join(' ')
    expect(firstWords).toBe(visible)
  })

  it('is there for spectators and in the floating panel too', () => {
    const { unmount } = render(
      <Chat messages={messages} onSendMessage={jest.fn()} currentUserId={null} fullScreen readOnly />
    )
    expect(screen.getByRole('link', { name: 'chat.rulesNewTab' })).toBeTruthy()
    unmount()
    const { container } = render(<Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" onToggleMinimize={jest.fn()} />)
    expect(within(container.querySelector('.chat-titlebar') as HTMLElement).getByRole('link', { name: 'chat.rulesNewTab' })).toBeTruthy()
    expect(screen.getByLabelText('chat.minimize')).toBeTruthy()
  })

  // #1466 review: short phones (waiting room, max-height 720px) and the phone-landscape side
  // column hide the title strip; globals.css shows this one there instead.
  it('keeps a Rules link in the composer row for the layouts that hide the title strip', () => {
    const { container } = render(<Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" fullScreen />)
    const link = within(container.querySelector('form.chat-composer') as HTMLElement).getByRole('link', { name: 'chat.rulesNewTab' })
    expect(link.getAttribute('href')).toBe('/rules')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('data-prefetch')).toBe('false')
    expect(link.classList.contains('chat-composer-rules')).toBe(true)
  })

  it('adds no block to the panel', () => {
    const { container } = render(
      <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" fullScreen />
    )
    const panel = container.firstElementChild as HTMLElement
    expect(panel.children).toHaveLength(3)
  })
})

// #1466: Block replaces the per-lobby Mute (#1088). It is the viewer's own, for every game,
// kept on the account or, for a guest, on this device.
describe('Chat block action (#1466)', () => {
  const systemMessage = {
    id: 's1', userId: 'system', username: 'System', message: 'Bob joined', timestamp: Date.now(), type: 'system' as const,
  }

  beforeEach(() => {
    window.localStorage.clear()
    jest.clearAllMocks()
  })

  afterEach(() => jest.restoreAllMocks())

  it("asks first, then hides that player's messages and nobody else's, in every game", async () => {
    const { unmount } = render(
      <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />
    )
    const blockButton = screen.getByRole('button', { name: 'chat.blockPlayer' })
    await waitFor(() => expect((blockButton as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(blockButton)

    const confirm = screen.getByRole('alertdialog')
    expect(confirm.textContent).toContain('chat.blockConfirm')
    expect(screen.getByText('hi back')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'chat.blockAction' }))
    await waitFor(() => expect(screen.queryByText('hi back')).toBeNull())
    expect(screen.getByText('hello there')).toBeTruthy()
    // The Block button left with Bob's messages; focus lands on the chat's heading, not the page.
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'chat.title' }))
    unmount()

    render(<Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="9999" fullScreen />)
    await waitFor(() => expect(screen.queryByText('hi back')).toBeNull())
    expect(screen.getByText('hello there')).toBeTruthy()
  })

  it('hides the player in every chat on the page, as one per layout tree is mounted', async () => {
    render(
      <>
        <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />
        <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />
      </>
    )
    expect(screen.getAllByText('hi back')).toHaveLength(2)
    const [first] = screen.getAllByRole('button', { name: 'chat.blockPlayer' })
    await waitFor(() => expect((first as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(first)
    fireEvent.click(screen.getByRole('button', { name: 'chat.blockAction' }))
    await waitFor(() => expect(screen.queryAllByText('hi back')).toHaveLength(0))
  })

  it('puts focus on the composer after a block when the title strip is hidden', async () => {
    const hide = document.createElement('style')
    hide.textContent = '.chat-titlebar { display: none; }'
    document.head.appendChild(hide)
    try {
      const { container } = render(<Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />)
      const blockButton = screen.getByRole('button', { name: 'chat.blockPlayer' })
      await waitFor(() => expect((blockButton as HTMLButtonElement).disabled).toBe(false))
      fireEvent.click(blockButton)
      fireEvent.click(screen.getByRole('button', { name: 'chat.blockAction' }))

      await waitFor(() => expect(screen.queryByText('hi back')).toBeNull())
      expect(document.activeElement).toBe(container.querySelector('form.chat-composer'))
    } finally {
      hide.remove()
    }
  })

  it('offers no Block on your own message or a system line', () => {
    render(
      <Chat messages={[...messages, systemMessage]} onSendMessage={jest.fn()} currentUserId="u2" lobbyCode="4821" fullScreen />
    )
    // Only Alice's message: Bob is the viewer, and the system line belongs to nobody.
    expect(screen.getAllByRole('button', { name: 'chat.blockPlayer' })).toHaveLength(1)
  })

  it('closes the question with Cancel or Escape, blocks nobody, and gives focus back', async () => {
    render(<Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />)
    const blockButton = screen.getByRole('button', { name: 'chat.blockPlayer' })
    await waitFor(() => expect((blockButton as HTMLButtonElement).disabled).toBe(false))

    fireEvent.click(blockButton)
    expect(blockButton.getAttribute('aria-expanded')).toBe('true')
    // Keyboard-reachable: focus moves into the question.
    expect(screen.getByRole('alertdialog').contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(blockButton)

    fireEvent.click(blockButton)
    fireEvent.click(screen.getByRole('button', { name: 'chat.cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByText('hi back')).toBeTruthy()
    expect(window.localStorage.getItem('boardly_blocked_players')).toBeNull()
  })

  it('scrolls only the message list to show the question from its first line, and never the page', async () => {
    render(<Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />)
    const blockButton = screen.getByRole('button', { name: 'chat.blockPlayer' })
    await waitFor(() => expect((blockButton as HTMLButtonElement).disabled).toBe(false))
    const list = screen.getByRole('log')
    const focus = jest.spyOn(HTMLElement.prototype, 'focus')
    // A 110px list showing its last bubble; the question opens below it and is taller than the list.
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const top = this === list ? 150 : this.getAttribute('role') === 'alertdialog' ? 240 - list.scrollTop : 0
      const height = this === list ? 110 : this.getAttribute('role') === 'alertdialog' ? 130 : 0
      return { top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect
    })

    fireEvent.click(blockButton)

    expect(list.scrollTop).toBe(90)
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('says so when the block could not be kept, and shows the messages still', async () => {
    jest.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    render(<Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />)
    const blockButton = screen.getByRole('button', { name: 'chat.blockPlayer' })
    await waitFor(() => expect((blockButton as HTMLButtonElement).disabled).toBe(false))

    fireEvent.click(blockButton)
    fireEvent.click(screen.getByRole('button', { name: 'chat.blockAction' }))

    await waitFor(() => expect(showToast.error).toHaveBeenCalledWith('chat.blockFailed', undefined, { player: 'Bob' }))
    expect(screen.getByText('hi back')).toBeTruthy()
  })

  it("puts focus back on the Block button when a signed-in player's block is rolled back", async () => {
    const originalFetch = global.fetch
    ;(useSession as jest.Mock).mockReturnValue({ data: { user: { id: 'u1' } }, status: 'authenticated' })
    let answerPost: (response: Response) => void = () => {}
    global.fetch = jest.fn((url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Promise<Response>((resolve) => {
            answerPost = resolve
          })
        : Promise.resolve(new Response(JSON.stringify({ blocks: [] }), { status: 200 }))
    ) as typeof fetch
    try {
      render(<Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />)
      // No message shows before the account's list has answered.
      const blockButton = await screen.findByRole('button', { name: 'chat.blockPlayer' })
      await waitFor(() => expect((blockButton as HTMLButtonElement).disabled).toBe(false))
      fireEvent.click(blockButton)
      fireEvent.click(screen.getByRole('button', { name: 'chat.blockAction' }))

      // Shown blocked before the server answers, which takes the button out with the message.
      await waitFor(() => expect(screen.queryByText('hi back')).toBeNull())
      await act(async () => {
        answerPost(new Response(JSON.stringify({ error: 'nope' }), { status: 500 }))
      })

      await waitFor(() => expect(showToast.error).toHaveBeenCalledWith('chat.blockFailed', undefined, { player: 'Bob' }))
      expect(screen.getByText('hi back')).toBeTruthy()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'chat.blockPlayer' }))
    } finally {
      global.fetch = originalFetch
      ;(useSession as jest.Mock).mockReturnValue({ data: null, status: 'unauthenticated' })
    }
  })
})

// #1466: Google Play's UGC policy – nobody posts before accepting the terms and the rules.
describe('Chat terms consent (#1466)', () => {
  function ChatWithTerms({
    initial,
    accept = async () => true,
    send = jest.fn(),
  }: {
    initial: boolean | null
    accept?: () => Promise<boolean>
    send?: (message: string, refuse: () => void) => void | Promise<string | null>
  }) {
    const [termsAccepted, setTermsAccepted] = useState<boolean | null>(initial)
    return (
      <Chat
        messages={messages}
        onSendMessage={(message) => send(message, () => setTermsAccepted(false))}
        currentUserId="u1"
        lobbyCode="4821"
        fullScreen
        termsAccepted={termsAccepted}
        onAcceptTerms={async () => {
          const ok = await accept()
          if (ok) setTermsAccepted(true)
          return ok
        }}
      />
    )
  }

  it('shows the consent panel instead of the composer until the terms are accepted', () => {
    render(<ChatWithTerms initial={false} />)
    expect(screen.queryByPlaceholderText('chat.placeholder')).toBeNull()
    expect(screen.getByText('chat.termsPrompt')).toBeTruthy()

    const terms = screen.getByRole('link', { name: 'chat.termsTerms' })
    const rules = screen.getByRole('link', { name: 'chat.termsRules' })
    expect(terms.getAttribute('href')).toBe('/terms')
    expect(rules.getAttribute('href')).toBe('/rules')
    for (const link of [terms, rules]) {
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
    }
    expect(screen.getByRole('button', { name: 'chat.termsAccept' })).toBeTruthy()
  })

  it('keeps the composer while the answer is unknown, and for spectators asks nothing', () => {
    const { unmount } = render(<ChatWithTerms initial={null} />)
    expect(screen.getByPlaceholderText('chat.placeholder')).toBeTruthy()
    expect(screen.queryByText('chat.termsPrompt')).toBeNull()
    unmount()

    render(
      <Chat messages={messages} onSendMessage={jest.fn()} currentUserId={null} fullScreen readOnly termsAccepted={false} onAcceptTerms={jest.fn()} />
    )
    expect(screen.queryByText('chat.termsPrompt')).toBeNull()
  })

  it('accepts, then gives the player the composer', async () => {
    const accept = jest.fn(async () => true)
    render(<ChatWithTerms initial={false} accept={accept} />)

    fireEvent.click(screen.getByRole('button', { name: 'chat.termsAccept' }))

    const input = await screen.findByPlaceholderText('chat.placeholder')
    expect(accept).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('chat.termsPrompt')).toBeNull()
    expect(document.activeElement).toBe(input)
  })

  it('says so when accepting failed, and keeps asking', async () => {
    render(<ChatWithTerms initial={false} accept={async () => false} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.termsAccept' }))

    expect((await screen.findByRole('alert')).textContent).toBe('chat.termsFailed')
    expect(screen.queryByPlaceholderText('chat.placeholder')).toBeNull()
  })

  it('asks when a send is refused for the terms, and keeps what was typed', async () => {
    const send = jest.fn(async (message: string, refuse: () => void) => {
      refuse()
      return message
    })
    render(<ChatWithTerms initial={null} send={send} />)

    const input = screen.getByPlaceholderText('chat.placeholder')
    fireEvent.change(input, { target: { value: 'gg everyone' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    const accept = await screen.findByRole('button', { name: 'chat.termsAccept' })
    expect(send).toHaveBeenCalledWith('gg everyone', expect.any(Function))
    await waitFor(() => expect(document.activeElement).toBe(accept))
    // Focus lands on the button, so it carries the prompt for a screen reader that skipped it.
    expect(accept).toHaveAccessibleDescription('chat.termsPrompt')
    expect(screen.getByRole('group', { name: 'chat.termsPrompt' }).contains(accept)).toBe(true)

    await act(async () => {
      fireEvent.click(accept)
    })
    expect((screen.getByPlaceholderText('chat.placeholder') as HTMLInputElement).value).toBe('gg everyone')
  })

  it('keeps what was typed after the send as well, behind the refused text', async () => {
    let refuseNow: () => void = () => {}
    const send = jest.fn(
      (message: string, refuse: () => void) =>
        new Promise<string | null>((resolve) => {
          refuseNow = () => {
            refuse()
            resolve(message)
          }
        })
    )
    render(<ChatWithTerms initial={null} send={send} />)

    const input = screen.getByPlaceholderText('chat.placeholder')
    fireEvent.change(input, { target: { value: 'gg everyone' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    fireEvent.change(input, { target: { value: 'well played' } })
    await act(async () => refuseNow())

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'chat.termsAccept' }))
    })
    expect((screen.getByPlaceholderText('chat.placeholder') as HTMLInputElement).value).toBe('gg everyone well played')
  })

  it('clears the composer when the message went through', async () => {
    render(<ChatWithTerms initial={true} send={async () => null} />)
    const input = screen.getByPlaceholderText('chat.placeholder') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'gg' } })
    await act(async () => {
      fireEvent.submit(input.closest('form') as HTMLFormElement)
    })
    expect(input.value).toBe('')
  })
})
