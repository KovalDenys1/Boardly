/**
 * @jest-environment node
 */
/**
 * #1142: a new OAuth account's username follows the site's rule (3-20 of [A-Za-z0-9_]),
 * never comes from the email address, and gets a suffix instead of a unique-index
 * failure when the name is taken.
 */
import { oauthUsernameBase, pickOAuthUsername, withNumericSuffix } from '@/lib/oauth-username'
import { CustomPrismaAdapter } from '@/lib/custom-prisma-adapter'

const RULE = /^[A-Za-z0-9_]{3,20}$/

describe('oauthUsernameBase', () => {
  it('cuts a display name down to the username alphabet', () => {
    expect(oauthUsernameBase('John Doe')).toBe('John_Doe')
    expect(oauthUsernameBase('José Álvarez')).toBe('Jose_Alvarez')
    expect(oauthUsernameBase('  --neo--  ')).toBe('neo')
    expect(oauthUsernameBase('A very long display name indeed')).toBe('A_very_long_display')
  })

  it('gives up on a name with nothing usable left', () => {
    expect(oauthUsernameBase('Денис')).toBeNull()
    expect(oauthUsernameBase('ab')).toBeNull()
    expect(oauthUsernameBase(null)).toBeNull()
  })
})

describe('withNumericSuffix', () => {
  it('stays within 20 characters', () => {
    expect(withNumericSuffix('A_very_long_display')).toMatch(/^A_very_long_dis_\d{4}$/)
    // A cut that ends on an underscore does not leave a double one before the suffix.
    expect(withNumericSuffix('abcdefghijklmn_pqrs')).toMatch(/^abcdefghijklmn_\d{4}$/)
    expect(withNumericSuffix('player', 8)).toMatch(/^player_\d{8}$/)
    expect(withNumericSuffix('abcdefghijklmnopqrst', 8)).toHaveLength(20)
  })
})

describe('pickOAuthUsername', () => {
  it('uses the cleaned name when it is free', async () => {
    await expect(pickOAuthUsername('John Doe', async () => false)).resolves.toBe('John_Doe')
  })

  it('adds a suffix when the name is taken, whatever its case', async () => {
    const taken = new Set(['john_doe'])
    const name = await pickOAuthUsername('John Doe', async (candidate) => taken.has(candidate.toLowerCase()))
    expect(name).toMatch(/^John_Doe_\d{4}$/)
  })

  it('falls back to player_NNNN, never to anything from the email', async () => {
    const name = await pickOAuthUsername('Денис', async () => false)
    expect(name).toMatch(/^player_\d{4}$/)
    expect(name).toMatch(RULE)
  })
})

describe('CustomPrismaAdapter.createUser', () => {
  function adapterWith(existing: string[], createImpl?: jest.Mock) {
    const users = {
      findMany: jest.fn(async ({ where }: { where: { username: { equals: string } } }) => {
        const wanted = where.username.equals.replace(/\\/g, '').toLowerCase()
        return existing.filter((name) => name.toLowerCase() === wanted).map((username) => ({ username }))
      }),
      create:
        createImpl ??
        jest.fn(async ({ data }) => ({ id: 'u1', image: null, ...data })),
    }
    return { adapter: CustomPrismaAdapter({ users, accounts: {} } as never), users }
  }

  it('creates the user with a rule-abiding name from the provider, not from the email', async () => {
    const { adapter, users } = adapterWith([])
    await adapter.createUser!({ id: '', name: 'John Doe', email: 'jdoe.1987@example.com', emailVerified: null } as never)

    const data = users.create.mock.calls[0][0].data
    expect(data.username).toBe('John_Doe')
    expect(data.username).toMatch(RULE)
    expect(data.username).not.toContain('jdoe')
    expect(data.emailVerified).toBeNull()
  })

  it('creates the preferences row with the account, so it starts friends-only (#1131)', async () => {
    const { adapter, users } = adapterWith([])
    await adapter.createUser!({ id: '', name: 'John Doe', email: 'j@example.com', emailVerified: null } as never)
    expect(users.create.mock.calls[0][0].data.accountPreferences).toEqual({ create: {} })
  })

  it('suffixes a name someone already holds', async () => {
    const { adapter, users } = adapterWith(['JOHN_DOE'])
    await adapter.createUser!({ id: '', name: 'John Doe', email: 'j@example.com', emailVerified: null } as never)
    expect(users.create.mock.calls[0][0].data.username).toMatch(/^John_Doe_\d{4}$/)
  })

  it('picks again when a concurrent sign-up took the name between check and insert', async () => {
    const conflict = Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: ['username'] } })
    const create = jest
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async ({ data }) => ({ id: 'u1', image: null, ...data }))
    const { adapter } = adapterWith([], create)

    const created = await adapter.createUser!({ id: '', name: 'John Doe', email: 'j@example.com', emailVerified: null } as never)
    expect(create).toHaveBeenCalledTimes(2)
    expect(created.id).toBe('u1')
  })

  it('does not swallow any other error', async () => {
    const create = jest.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: 'P1001' }))
    const { adapter } = adapterWith([], create)
    await expect(
      adapter.createUser!({ id: '', name: 'John Doe', email: 'j@example.com', emailVerified: null } as never)
    ).rejects.toThrow('boom')
    expect(create).toHaveBeenCalledTimes(1)
  })
})
