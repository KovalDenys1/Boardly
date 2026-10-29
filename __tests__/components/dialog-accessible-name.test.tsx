/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import Modal from '@/components/Modal'
import FriendList from '@/components/friendship/FriendList'

jest.mock('@/lib/i18n-helpers', () => {
  const en = require('@/locales/en').default
  return {
    useTranslation: () => ({
      t: (key: string, params: Record<string, string> = {}) => {
        const text = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en)
        return typeof text === 'string' ? text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => params[name] ?? '') : key
      },
    }),
  }
})

/** A screen reader announces a dialog by its name; an unnamed one is read as just "dialog". */
describe('every Modal dialog has an accessible name', () => {
  const noop = () => {}

  it('takes its name from the title', () => {
    render(
      <Modal isOpen onClose={noop} title="Game settings">
        body
      </Modal>
    )

    expect(screen.getByRole('dialog', { name: 'Game settings' })).toBeInTheDocument()
  })

  it('takes its name from a heading inside it', () => {
    render(
      <Modal isOpen onClose={noop} aria-labelledby="inner-heading">
        <h3 id="inner-heading">Leave the game?</h3>
      </Modal>
    )

    expect(screen.getByRole('dialog', { name: 'Leave the game?' })).toBeInTheDocument()
  })

  it('takes its name from a label when nothing visible names it', () => {
    render(
      <Modal isOpen onClose={noop} aria-label="Player card">
        body
      </Modal>
    )

    expect(screen.getByRole('dialog', { name: 'Player card' })).toBeInTheDocument()
  })

  it('does not compile without a name', () => {
    const unnamed = () => (
      // @ts-expect-error a dialog needs title, aria-labelledby or aria-label
      <Modal isOpen onClose={noop}>
        body
      </Modal>
    )
    expect(typeof unnamed).toBe('function')
  })

  it('names the remove-friend dialog by its question', () => {
    render(
      <FriendList
        friends={[
          {
            id: 'friend-1',
            username: 'Aksel',
            avatar: null,
            publicProfileId: 'public-friend-1',
            friendshipId: 'friendship-friend-1',
            friendsSince: '2026-01-02T00:00:00.000Z',
          },
        ]}
        presenceOf={() => 'offline'}
        loadFailed={false}
        onRetry={noop}
        onRemove={noop}
        empty={null}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove Aksel' }))

    expect(screen.getByRole('dialog', { name: 'Remove this friend?' })).toBeInTheDocument()
  })
})
