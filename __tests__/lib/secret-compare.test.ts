/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { constantTimeEqual } from '@/lib/secret-compare'

describe('constantTimeEqual', () => {
  it('is true for identical strings', () => {
    expect(constantTimeEqual('same-secret', 'same-secret')).toBe(true)
  })

  it('is false for different strings of the same length', () => {
    expect(constantTimeEqual('secret-aaaa', 'secret-bbbb')).toBe(false)
  })

  it('is false for different lengths, without throwing', () => {
    expect(constantTimeEqual('short', 'a-much-longer-secret')).toBe(false)
  })

  it('is true for two empty strings', () => {
    expect(constantTimeEqual('', '')).toBe(true)
  })
})
