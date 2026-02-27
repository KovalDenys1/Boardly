import { loginSchema, registerSchema } from '@/lib/validation/auth'

describe('auth validation schemas', () => {
  it('normalizes login email by trimming and lowercasing', () => {
    const parsed = loginSchema.parse({
      email: '  User.Name+Test@Example.COM  ',
      password: 'secret-password',
    })

    expect(parsed.email).toBe('user.name+test@example.com')
    expect(parsed.password).toBe('secret-password')
  })

  it('normalizes register email by trimming and lowercasing', () => {
    const parsed = registerSchema.parse({
      email: '  NewUser@Example.COM  ',
      username: 'Player_123',
      password: 'StrongPass1',
    })

    expect(parsed.email).toBe('newuser@example.com')
    expect(parsed.username).toBe('Player_123')
  })
})
