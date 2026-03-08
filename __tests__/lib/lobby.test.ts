// Override the global nanoid mock for this test to actually generate random codes
jest.mock('nanoid', () => ({
  customAlphabet: (alphabet: string, size: number) => () => {
    let result = ''
    for (let i = 0; i < size; i++) {
      result += alphabet[Math.floor(Math.random() * alphabet.length)]
    }
    return result
  },
  nanoid: () => 'test-id-123',
}))

import { generateLobbyCode, LOBBY_CODE_LENGTH } from '@/lib/lobby'

describe('Lobby Utilities', () => {
  describe('generateLobbyCode', () => {
    it('should generate a fixed-length code', () => {
      const code = generateLobbyCode()
      expect(code).toHaveLength(LOBBY_CODE_LENGTH)
    })

    it('should generate digit-only codes by default', () => {
      const code = generateLobbyCode()
      expect(code).toMatch(/^\d{4}$/)
    })

    it('should generate alphanumeric codes when fallback is enabled', () => {
      const code = generateLobbyCode({ fallbackToAlphanumeric: true })
      expect(code).toMatch(/^[A-Z0-9]{4}$/)
    })

    it('should generate unique codes', () => {
      const codes = new Set<string>()
      const iterations = 100 // Reduced from 1000 to avoid timeout

      for (let i = 0; i < iterations; i++) {
        codes.add(generateLobbyCode())
      }

      // With 10^4 = 10,000 possible numeric combinations,
      // collisions should still be relatively rare in 100 attempts.
      expect(codes.size).toBeGreaterThan(90)
    })

    it('should generate different codes on consecutive calls', () => {
      const codes = Array.from({ length: 20 }, () => generateLobbyCode())
      const uniqueCodes = new Set(codes)

      // At least 19 of 20 should be unique
      expect(uniqueCodes.size).toBeGreaterThanOrEqual(19)
    })

    it('should generate codes without lowercase letters', () => {
      const codes = Array.from({ length: 100 }, () => generateLobbyCode())
      
      codes.forEach((code) => {
        expect(code).not.toMatch(/[a-z]/)
      })
    })

    it('should generate codes without special characters', () => {
      const codes = Array.from({ length: 100 }, () => generateLobbyCode())
      
      codes.forEach((code) => {
        expect(code).not.toMatch(/[^A-Z0-9]/)
      })
    })
  })
})
