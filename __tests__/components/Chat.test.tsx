import { fireEvent, render, screen } from '@testing-library/react'
import Chat from '@/components/Chat'
import { fetchWithGuest } from '@/lib/client/fetch-with-guest'

jest.mock('@/lib/client/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
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
    const link = screen.getByRole('link', { name: 'chat.rulesNewTab' })
    expect(link.getAttribute('href')).toBe('/rules')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.textContent).toBe('chat.rules')
    expect(link.closest('.chat-titlebar')).toBe(container.querySelector('.chat-titlebar'))
    // Rarely opened, so it does not prefetch /rules on every game screen.
    expect(link.getAttribute('data-prefetch')).toBe('false')
  })

  // WCAG 2.5.3 Label in Name: a voice-control user says what they see, so the accessible name
  // must contain the visible label; here it starts with it, in every locale.
  it.each(['en', 'no', 'ru', 'uk'])('%s: the accessible name starts with the visible label', (locale) => {
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
    render(<Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" onToggleMinimize={jest.fn()} />)
    expect(screen.getByRole('link', { name: 'chat.rulesNewTab' })).toBeTruthy()
    expect(screen.getByLabelText('chat.minimize')).toBeTruthy()
  })

  it('adds no block to the panel', () => {
    const { container } = render(
      <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" fullScreen />
    )
    const panel = container.firstElementChild as HTMLElement
    expect(panel.children).toHaveLength(3)
  })
})

// #1088: a mute is the viewer's own, per lobby, and survives a reload on this device.
describe('Chat mute action (#1088)', () => {
  beforeEach(() => window.localStorage.clear())

  it("hides a player's messages, keeps the mute for this lobby, and lets the viewer undo it", () => {
    const { unmount } = render(
      <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />
    )
    expect(screen.queryByRole('button', { name: 'chat.mutePlayer' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'chat.mutePlayer' }))
    expect(screen.queryByText('hi back')).toBeNull()
    expect(screen.getByText('hello there')).toBeTruthy()
    unmount()

    // Reload: still hidden in this lobby, visible in another.
    const { unmount: unmount2 } = render(
      <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />
    )
    expect(screen.queryByText('hi back')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'chat.unmuteAll' }))
    expect(screen.getByText('hi back')).toBeTruthy()
    unmount2()

    render(<Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="9999" fullScreen />)
    expect(screen.getByText('hi back')).toBeTruthy()
  })

  it('hides the player in every chat on the page, as one per layout tree is mounted', () => {
    render(
      <>
        <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />
        <Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u1" lobbyCode="4821" fullScreen />
      </>
    )
    expect(screen.getAllByText('hi back')).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'chat.mutePlayer' })[0])
    expect(screen.queryAllByText('hi back')).toHaveLength(0)
  })

  it('offers no mute on your own message or without a lobby', () => {
    render(<Chat messages={messages} onSendMessage={jest.fn()} currentUserId="u2" fullScreen />)
    expect(screen.queryByRole('button', { name: 'chat.mutePlayer' })).toBeNull()
  })
})
