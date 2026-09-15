import { render, screen } from '@testing-library/react'
import Chat from '@/components/Chat'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

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
