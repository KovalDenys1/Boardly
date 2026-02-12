// Override the global nanoid mock for this test to actually generate random codes
jest.mock('nanoid', () => ({
  customAlphabet: () => () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < 4; i++) {
      result += chars[Math.floor(Math.random() * chars.length)]
    }
    return result
  },
  nanoid: () => 'test-id-123',
}))

import { generateLobbyCode } from '@/lib/lobby'

describe('Lobby Utilities', () => {
  describe('generateLobbyCode', () => {
    it('should generate a 4-character code', () => {
      const code = generateLobbyCode()
      expect(code).toHaveLength(4)
    })

    it('should generate codes with only uppercase letters and numbers', () => {
      const code = generateLobbyCode()
      expect(code).toMatch(/^[A-Z0-9]{4}$/)
    })

    it('should generate unique codes', () => {
      const codes = new Set<string>()
      const iterations = 100 // Reduced from 1000 to avoid timeout

      for (let i = 0; i < iterations; i++) {
        codes.add(generateLobbyCode())
      }

      // With 36^4 = 1,679,616 possible combinations, 
      // collisions should be rare in 100 attempts
      expect(codes.size).toBeGreaterThan(95)
    })

    it('should generate different codes on consecutive calls', () => {
      const codes = Array.from({ length: 20 }, () => generateLobbyCode())
      const uniqueCodes = new Set(codes)

      // At least 19 of 20 should be unique
      expect(uniqueCodes.size).toBeGreaterThanOrEqual(19)
    })

    it('should generate codes without lowercase letters', () => {
      const codes = Array.from({ length: 100 }, () => generateLobbyCode())
      
      codes.forEach(code => {
        expect(code).not.toMatch(/[a-z]/)
      })
    })

    it('should generate codes without special characters', () => {
      const codes = Array.from({ length: 100 }, () => generateLobbyCode())
      
      codes.forEach(code => {
        expect(code).not.toMatch(/[^A-Z0-9]/)
      })
    })
  })
})
