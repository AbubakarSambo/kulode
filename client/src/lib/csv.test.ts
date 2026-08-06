import { describe, it, expect } from 'vitest'
import { parseCsv, toCsv } from './csv'

describe('parseCsv', () => {
  it('parses simple comma-separated rows', () => {
    expect(parseCsv('Name,Phone\nTunde,123\nAmaka,456')).toEqual([
      ['Name', 'Phone'],
      ['Tunde', '123'],
      ['Amaka', '456'],
    ])
  })

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('Name,Notes\nTunde,"Loves rice, spicy"')).toEqual([
      ['Name', 'Notes'],
      ['Tunde', 'Loves rice, spicy'],
    ])
  })

  it('handles escaped double quotes inside quoted fields', () => {
    expect(parseCsv('Name,Notes\nTunde,"Says ""hi"""')).toEqual([
      ['Name', 'Notes'],
      ['Tunde', 'Says "hi"'],
    ])
  })

  it('ignores blank lines', () => {
    expect(parseCsv('Name,Phone\nTunde,123\n\nAmaka,456\n')).toEqual([
      ['Name', 'Phone'],
      ['Tunde', '123'],
      ['Amaka', '456'],
    ])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('Name,Phone\r\nTunde,123\r\n')).toEqual([
      ['Name', 'Phone'],
      ['Tunde', '123'],
    ])
  })
})

describe('toCsv', () => {
  it('quotes fields containing commas', () => {
    expect(toCsv([['Name', 'Notes'], ['Tunde', 'Loves rice, spicy']])).toBe(
      'Name,Notes\nTunde,"Loves rice, spicy"',
    )
  })

  it('round-trips through parseCsv', () => {
    const rows = [
      ['Name', 'Notes'],
      ['Tunde', 'Says "hi", loudly'],
    ]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
})
