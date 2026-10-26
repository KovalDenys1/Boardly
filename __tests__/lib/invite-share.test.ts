import {
  buildInviteSharePayload,
  canShareInvite,
  shareInvite,
  type InviteShareNavigator,
  type InviteSharePayload,
} from '@/lib/invite-share'

const PAYLOAD: InviteSharePayload = {
  title: 'Join my game on Boardly',
  text: 'Jump into my lobby and play a round with me.',
  url: 'https://boardly.online/lobby/AB12?via=invite',
}

function abortError(): Error {
  const error = new Error('Share canceled')
  error.name = 'AbortError'
  return error
}

describe('invite share (#927)', () => {
  it('shares the same marked link the clipboard copy uses (#920)', () => {
    expect(
      buildInviteSharePayload({
        code: 'AB12',
        origin: 'https://boardly.online',
        title: PAYLOAD.title,
        text: PAYLOAD.text,
      })
    ).toEqual(PAYLOAD)
  })

  describe('canShareInvite', () => {
    it('is false without a share method – every desktop browser', () => {
      expect(canShareInvite({}, PAYLOAD)).toBe(false)
      expect(canShareInvite(null, PAYLOAD)).toBe(false)
    })

    it('trusts share alone when canShare is not implemented', () => {
      expect(canShareInvite({ share: jest.fn() }, PAYLOAD)).toBe(true)
    })

    it('respects a canShare that rejects the payload, or throws', () => {
      expect(canShareInvite({ share: jest.fn(), canShare: () => false }, PAYLOAD)).toBe(false)
      expect(
        canShareInvite(
          {
            share: jest.fn(),
            canShare: () => {
              throw new Error('nope')
            },
          },
          PAYLOAD
        )
      ).toBe(false)
    })
  })

  describe('shareInvite', () => {
    it('uses the share sheet on a touch device, and does not also copy', async () => {
      const share = jest.fn().mockResolvedValue(undefined)
      const writeText = jest.fn().mockResolvedValue(undefined)
      const nav: InviteShareNavigator = { share, clipboard: { writeText } }

      await expect(shareInvite({ payload: PAYLOAD, navigator: nav, touch: true })).resolves.toBe('shared')
      expect(share).toHaveBeenCalledWith(PAYLOAD)
      expect(writeText).not.toHaveBeenCalled()
    })

    it('copies on a pointer device even when the browser has a share sheet', async () => {
      const share = jest.fn().mockResolvedValue(undefined)
      const writeText = jest.fn().mockResolvedValue(undefined)
      const nav: InviteShareNavigator = { share, clipboard: { writeText } }

      await expect(shareInvite({ payload: PAYLOAD, navigator: nav, touch: false })).resolves.toBe('copied')
      expect(share).not.toHaveBeenCalled()
      expect(writeText).toHaveBeenCalledWith(PAYLOAD.url)
    })

    it('reports a cancelled share sheet as dismissed, not as a copy', async () => {
      const writeText = jest.fn().mockResolvedValue(undefined)
      const nav: InviteShareNavigator = {
        share: jest.fn().mockRejectedValue(abortError()),
        clipboard: { writeText },
      }

      await expect(shareInvite({ payload: PAYLOAD, navigator: nav, touch: true })).resolves.toBe('dismissed')
      expect(writeText).not.toHaveBeenCalled()
    })

    it('falls back to the clipboard when the share sheet fails for any other reason', async () => {
      const writeText = jest.fn().mockResolvedValue(undefined)
      const nav: InviteShareNavigator = {
        share: jest.fn().mockRejectedValue(new Error('in-app browser')),
        clipboard: { writeText },
      }

      await expect(shareInvite({ payload: PAYLOAD, navigator: nav, touch: true })).resolves.toBe('copied')
      expect(writeText).toHaveBeenCalledWith(PAYLOAD.url)
    })

    it('copies the link when there is no share sheet', async () => {
      const writeText = jest.fn().mockResolvedValue(undefined)

      await expect(
        shareInvite({ payload: PAYLOAD, navigator: { clipboard: { writeText } }, touch: true })
      ).resolves.toBe('copied')
      expect(writeText).toHaveBeenCalledWith(PAYLOAD.url)
    })

    it('fails when neither path is available or the clipboard is refused', async () => {
      await expect(shareInvite({ payload: PAYLOAD, navigator: {}, touch: true })).resolves.toBe('failed')
      await expect(shareInvite({ payload: PAYLOAD, navigator: null, touch: true })).resolves.toBe('failed')
      await expect(
        shareInvite({
          payload: PAYLOAD,
          navigator: { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) } },
          touch: true,
        })
      ).resolves.toBe('failed')
    })
  })
})
