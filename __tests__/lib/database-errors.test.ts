import { isTransactionWriteConflict } from '@/lib/database-errors'

describe('isTransactionWriteConflict', () => {
  it('recognises the P2034 a failing statement produces', () => {
    const error = Object.assign(new Error('write conflict'), { code: 'P2034' })
    expect(isTransactionWriteConflict(error)).toBe(true)
  })

  it('recognises the adapter error a failing COMMIT produces', () => {
    const error = Object.assign(new Error('TransactionWriteConflict'), {
      name: 'DriverAdapterError',
      cause: { kind: 'TransactionWriteConflict' },
    })
    expect(isTransactionWriteConflict(error)).toBe(true)
  })

  it('leaves every other error alone', () => {
    expect(isTransactionWriteConflict(new Error('boom'))).toBe(false)
    expect(isTransactionWriteConflict(Object.assign(new Error('x'), { code: 'P2002' }))).toBe(false)
    expect(
      isTransactionWriteConflict(
        Object.assign(new Error('x'), { name: 'DriverAdapterError', cause: { kind: 'TooManyConnections' } })
      )
    ).toBe(false)
    expect(isTransactionWriteConflict(null)).toBe(false)
    expect(isTransactionWriteConflict('P2034')).toBe(false)
  })
})
