/**
 * @jest-environment node
 */
import { isPlayApp } from '@/lib/app-shell'

describe('isPlayApp on the server', () => {
  it('is false without a document', () => {
    expect(typeof document).toBe('undefined')
    expect(isPlayApp()).toBe(false)
  })
})
