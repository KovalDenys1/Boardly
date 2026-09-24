import { reopenGoogleConsentMessage } from '@/lib/consent'

/**
 * #1153: the footer's "reopen consent message" control calls this. Snippet
 * per Google's own docs (support.google.com/adsense/answer/10959060):
 * `googlefc.callbackQueue.push(googlefc.showRevocationMessage)`.
 */
describe('reopenGoogleConsentMessage', () => {
  afterEach(() => {
    delete (window as { googlefc?: unknown }).googlefc
  })

  it('pushes showRevocationMessage onto the googlefc callback queue', () => {
    const showRevocationMessage = jest.fn()
    const callbackQueue: Array<() => void> = []
    ;(window as { googlefc?: unknown }).googlefc = { callbackQueue, showRevocationMessage }

    reopenGoogleConsentMessage()

    expect(callbackQueue).toEqual([showRevocationMessage])
  })

  it('does nothing when googlefc has not loaded yet', () => {
    expect(() => reopenGoogleConsentMessage()).not.toThrow()
  })

  it('does nothing when googlefc exists but showRevocationMessage does not', () => {
    const callbackQueue: Array<() => void> = []
    ;(window as { googlefc?: unknown }).googlefc = { callbackQueue }

    expect(() => reopenGoogleConsentMessage()).not.toThrow()
    expect(callbackQueue).toHaveLength(0)
  })
})
