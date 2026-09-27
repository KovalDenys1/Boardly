/**
 * @jest-environment node
 */
/**
 * The Control Panel's bearer secret (#1231): at least 32 characters, or it counts as unset,
 * and scripts/check-env.ts reports it by the same floor.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  CONTROL_PANEL_API_SECRET_MIN_LENGTH,
  getControlPanelApiSecret,
  hasValidControlPanelSecret,
} from '@/lib/control-panel-api-auth'

const original = process.env.CONTROL_PANEL_API_SECRET

afterEach(() => {
  if (original === undefined) delete process.env.CONTROL_PANEL_API_SECRET
  else process.env.CONTROL_PANEL_API_SECRET = original
})

function withBearer(value: string) {
  return new Request('http://localhost:3000/api/internal/admin/remove-content', {
    method: 'POST',
    headers: { authorization: `Bearer ${value}` },
  })
}

describe('CONTROL_PANEL_API_SECRET', () => {
  it('is used from 32 characters, after trimming', () => {
    const secret = 'a'.repeat(32)
    process.env.CONTROL_PANEL_API_SECRET = `  ${secret}\n`

    expect(getControlPanelApiSecret()).toBe(secret)
    expect(hasValidControlPanelSecret(withBearer(secret))).toBe(true)
  })

  it('counts as unset below 32 characters, so its own value does not open anything', () => {
    const short = 'a'.repeat(31)
    process.env.CONTROL_PANEL_API_SECRET = short

    expect(getControlPanelApiSecret()).toBeNull()
    expect(hasValidControlPanelSecret(withBearer(short))).toBe(false)
  })

  it('has the floor scripts/check-env.ts reports it by', () => {
    const script = readFileSync(path.join(__dirname, '..', '..', 'scripts', 'check-env.ts'), 'utf8')
    const floor = script.match(/CONTROL_PANEL_API_SECRET:\s*(\d+)/)

    expect(floor).not.toBeNull()
    expect(Number(floor?.[1])).toBe(CONTROL_PANEL_API_SECRET_MIN_LENGTH)
    expect(CONTROL_PANEL_API_SECRET_MIN_LENGTH).toBe(32)
  })
})
