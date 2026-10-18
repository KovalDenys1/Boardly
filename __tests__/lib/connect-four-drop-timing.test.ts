import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { C4_FALL_SHARE, c4DropDurationMs, c4FallDistancePx, c4LandingMs } from '@/lib/connect-four-drop-timing'

describe('Connect Four drop timing', () => {
    it('lands the sound on the c4-drop keyframe where the disc first touches the bottom', () => {
        const css = readFileSync(join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8')
        const block = /@keyframes c4-drop \{([\s\S]*?)\n\}/.exec(css)?.[1]
        expect(block).toBeDefined()
        const firstContact = /(\d+(?:\.\d+)?)%\s*\{\s*transform:\s*translateY\(0\)/.exec(block!)?.[1]
        expect(Number(firstContact) / 100).toBe(C4_FALL_SHARE)
    })

    it('is the board’s own fall, cut at first contact', () => {
        const duration = c4DropDurationMs(c4FallDistancePx(5, 46))
        expect(duration).toBe(240 + Math.round(6 * 52 * 0.9))
        expect(c4LandingMs(5, 46)).toBe(Math.round(duration * C4_FALL_SHARE))
    })
})
