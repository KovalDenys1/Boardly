import {
  formatSellerAddress,
  getSellerIdentity,
  parseSellerAddress,
} from '@/lib/seller-identity'
import { SUPPORT_EMAIL } from '@/lib/organization-json-ld'

const NAME_VAR = 'NEXT_PUBLIC_SELLER_LEGAL_NAME'
const ADDRESS_VAR = 'NEXT_PUBLIC_SELLER_ADDRESS'

describe('getSellerIdentity', () => {
  const originalName = process.env[NAME_VAR]
  const originalAddress = process.env[ADDRESS_VAR]

  afterEach(() => {
    if (originalName === undefined) {
      delete process.env[NAME_VAR]
    } else {
      process.env[NAME_VAR] = originalName
    }
    if (originalAddress === undefined) {
      delete process.env[ADDRESS_VAR]
    } else {
      process.env[ADDRESS_VAR] = originalAddress
    }
  })

  it('is null while neither variable is set', () => {
    delete process.env[NAME_VAR]
    delete process.env[ADDRESS_VAR]
    expect(getSellerIdentity()).toBeNull()
  })

  it('is null with a name but no address, and with an address but no name', () => {
    process.env[NAME_VAR] = 'Ola Nordmann'
    delete process.env[ADDRESS_VAR]
    expect(getSellerIdentity()).toBeNull()

    delete process.env[NAME_VAR]
    process.env[ADDRESS_VAR] = 'Storgata 1|0155 Oslo'
    expect(getSellerIdentity()).toBeNull()
  })

  it('is null when either value is blank or whitespace', () => {
    process.env[NAME_VAR] = '   '
    process.env[ADDRESS_VAR] = 'Storgata 1|0155 Oslo'
    expect(getSellerIdentity()).toBeNull()

    process.env[NAME_VAR] = 'Ola Nordmann'
    process.env[ADDRESS_VAR] = ' | '
    expect(getSellerIdentity()).toBeNull()
  })

  it('returns the name, the address lines and the support email once both are set', () => {
    process.env[NAME_VAR] = ' Ola Nordmann '
    process.env[ADDRESS_VAR] = 'Storgata 1|0155 Oslo'

    expect(getSellerIdentity()).toEqual({
      legalName: 'Ola Nordmann',
      addressLines: ['Storgata 1', '0155 Oslo'],
      email: SUPPORT_EMAIL,
    })
  })
})

describe('parseSellerAddress', () => {
  it('splits on | and trims every line', () => {
    expect(parseSellerAddress(' Storgata 1 | 0155 Oslo ')).toEqual(['Storgata 1', '0155 Oslo'])
  })

  it('splits on newlines, including Windows line endings', () => {
    expect(parseSellerAddress('Storgata 1\n0155 Oslo')).toEqual(['Storgata 1', '0155 Oslo'])
    expect(parseSellerAddress('Storgata 1\r\n0155 Oslo')).toEqual(['Storgata 1', '0155 Oslo'])
  })

  it('accepts both separators in one value and drops empty lines', () => {
    expect(parseSellerAddress('Storgata 1|\n\n0155 Oslo||')).toEqual(['Storgata 1', '0155 Oslo'])
  })

  it('is empty for nothing at all', () => {
    expect(parseSellerAddress(undefined)).toEqual([])
    expect(parseSellerAddress(null)).toEqual([])
    expect(parseSellerAddress('')).toEqual([])
  })
})

describe('formatSellerAddress', () => {
  it('joins the lines with commas', () => {
    expect(
      formatSellerAddress({ legalName: 'Ola Nordmann', addressLines: ['Storgata 1', '0155 Oslo'], email: SUPPORT_EMAIL })
    ).toBe('Storgata 1, 0155 Oslo')
  })
})
