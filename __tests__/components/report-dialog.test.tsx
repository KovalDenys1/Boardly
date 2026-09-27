/**
 * #1172: the report form. It sends the target with a reason and an optional note, and
 * turns every answer the route gives into a sentence the reporter can act on.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ReportDialog, { ReportForm } from '@/components/ReportDialog'
import { fetchWithGuest } from '@/lib/client/fetch-with-guest'
import { REPORT_REASONS, type ReportTarget } from '@/lib/content-reports'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('@/lib/client/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

const post = fetchWithGuest as jest.Mock

function answer(status: number, body: unknown) {
  post.mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
}

const chatTarget: ReportTarget = {
  targetType: 'chat_message',
  targetId: 'msg_1',
  lobbyCode: '4821',
  reportedUserId: 'offender_1',
  quotedText: 'a bad message',
}

function sentBody() {
  const [url, init] = post.mock.calls[0]
  expect(url).toBe('/api/reports')
  expect(init.method).toBe('POST')
  return JSON.parse(init.body as string)
}

describe('ReportForm (#1172)', () => {
  beforeEach(() => {
    post.mockReset()
  })

  it('offers every reason from the fixed list, and cannot be sent without one', () => {
    render(<ReportForm targets={[chatTarget]} onDone={jest.fn()} />)
    for (const reason of REPORT_REASONS) {
      expect(screen.getByLabelText(`report.reasons.${reason}`)).toBeTruthy()
    }
    const submit = screen.getByRole('button', { name: 'report.submit' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('report.reasons.spam'))
    expect(submit.disabled).toBe(false)
  })

  it('shows the reported message back to the reporter', () => {
    render(<ReportForm targets={[chatTarget]} quote="a bad message" onDone={jest.fn()} />)
    expect(screen.getByText('a bad message')).toBeTruthy()
  })

  it('posts the target, the reason and the trimmed note, then thanks the reporter', async () => {
    answer(201, { ok: true, duplicate: false })
    render(<ReportForm targets={[chatTarget]} onDone={jest.fn()} />)

    fireEvent.click(screen.getByLabelText('report.reasons.harassment'))
    fireEvent.change(screen.getByPlaceholderText('report.notePlaceholder'), { target: { value: '  it keeps happening  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'report.submit' }))

    expect(await screen.findByText('report.successTitle')).toBeTruthy()
    expect(screen.getByText('report.successBody')).toBeTruthy()
    // The submit button is gone; focus goes to the result instead of the page behind.
    expect(document.activeElement).toBe(screen.getByText('report.successTitle'))
    expect(sentBody()).toEqual({ ...chatTarget, reason: 'harassment', note: 'it keeps happening' })
  })

  it('takes focus to its heading when asked, as a step inside another menu', () => {
    render(<ReportForm targets={[chatTarget]} onDone={jest.fn()} onBack={jest.fn()} focusHeadingOnMount />)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'report.title' }))
  })

  it('leaves the note out when it is empty', async () => {
    answer(201, { ok: true, duplicate: false })
    render(<ReportForm targets={[chatTarget]} onDone={jest.fn()} />)
    fireEvent.click(screen.getByLabelText('report.reasons.other'))
    fireEvent.click(screen.getByRole('button', { name: 'report.submit' }))
    await screen.findByText('report.successTitle')
    expect(sentBody()).not.toHaveProperty('note')
  })

  it('caps the note at 500 characters in the field itself', () => {
    render(<ReportForm targets={[chatTarget]} onDone={jest.fn()} />)
    const note = screen.getByPlaceholderText('report.notePlaceholder') as HTMLTextAreaElement
    expect(note.maxLength).toBe(500)
  })

  it('says so when the same thing was already reported', async () => {
    answer(200, { ok: true, duplicate: true })
    render(<ReportForm targets={[chatTarget]} onDone={jest.fn()} />)
    fireEvent.click(screen.getByLabelText('report.reasons.spam'))
    fireEvent.click(screen.getByRole('button', { name: 'report.submit' }))
    expect(await screen.findByText('report.duplicate')).toBeTruthy()
  })

  it.each([
    [401, {}, 'report.errors.signIn'],
    [429, {}, 'report.errors.rateLimited'],
    [404, { code: 'TARGET_NOT_FOUND' }, 'report.errors.notFound'],
    [400, { code: 'CANNOT_REPORT_SELF' }, 'report.errors.self'],
    [500, {}, 'report.errors.generic'],
  ])('answers a %i with a sentence the reporter can act on', async (status, body, messageKey) => {
    answer(status, body)
    render(<ReportForm targets={[chatTarget]} onDone={jest.fn()} />)
    fireEvent.click(screen.getByLabelText('report.reasons.spam'))
    fireEvent.click(screen.getByRole('button', { name: 'report.submit' }))
    expect((await screen.findByRole('alert')).textContent).toBe(messageKey)
    // Still the form, so the reporter can try again.
    expect(screen.getByRole('button', { name: 'report.submit' })).toBeTruthy()
  })

  it('lets the reporter pick what they are reporting when there is a choice', async () => {
    answer(201, { ok: true, duplicate: false })
    const targets: ReportTarget[] = [
      { targetType: 'username', targetId: 'offender_1', lobbyCode: '4821' },
      { targetType: 'avatar', targetId: 'offender_1', lobbyCode: '4821' },
    ]
    render(<ReportForm targets={targets} onDone={jest.fn()} />)

    expect(screen.getByText('report.targetLabel')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('report.targets.avatar'))
    fireEvent.click(screen.getByLabelText('report.reasons.sexual'))
    fireEvent.click(screen.getByRole('button', { name: 'report.submit' }))

    await screen.findByText('report.successTitle')
    expect(sentBody()).toEqual({ targetType: 'avatar', targetId: 'offender_1', lobbyCode: '4821', reason: 'sexual' })
  })

  it('shows no target choice for a single target', () => {
    render(<ReportForm targets={[chatTarget]} onDone={jest.fn()} />)
    expect(screen.queryByText('report.targetLabel')).toBeNull()
  })

  it('goes back instead of cancelling when it is a step inside another menu', () => {
    const onBack = jest.fn()
    const onDone = jest.fn()
    render(<ReportForm targets={[chatTarget]} onDone={onDone} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: 'report.back' }))
    expect(onBack).toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('ReportDialog (#1172)', () => {
  it('renders nothing while closed', () => {
    render(<ReportDialog isOpen={false} onClose={jest.fn()} targets={[chatTarget]} />)
    expect(screen.queryByText('report.title')).toBeNull()
  })

  it('closes from Cancel', async () => {
    const onClose = jest.fn()
    render(<ReportDialog isOpen onClose={onClose} targets={[chatTarget]} />)
    await waitFor(() => expect(screen.getByText('report.title')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'report.cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
