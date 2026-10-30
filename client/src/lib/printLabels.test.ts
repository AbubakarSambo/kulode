import { describe, it, expect } from 'vitest'
import { barcodeSvg, labelHtml } from './printLabels'

describe('labelHtml', () => {
  it('renders the header, a Code 128 barcode, the code, name and price', () => {
    const html = labelHtml({ name: 'Kathrine boubou', barcode: '0264', sellPrice: 160500 }, { header: 'DZYN' })
    const el = document.createElement('div')
    el.innerHTML = html

    expect(el.querySelector('.header')?.textContent).toBe('DZYN')
    expect(el.querySelector('svg.barcode rect')).not.toBeNull()
    expect(el.querySelector('.code')?.textContent).toBe('0264')
    expect(el.querySelector('.name')?.textContent).toBe('Kathrine boubou')
    expect(el.querySelector('.price')?.textContent).toBe('₦160,500')
  })

  it('leaves out a blank header and a missing price', () => {
    const el = document.createElement('div')
    el.innerHTML = labelHtml({ name: 'Zoey Dress', barcode: '133890', sellPrice: null }, { header: '  ' })

    expect(el.querySelector('.header')).toBeNull()
    expect(el.querySelector('.price')).toBeNull()
  })

  it('escapes item names so they cannot inject markup', () => {
    const el = document.createElement('div')
    el.innerHTML = labelHtml({ name: '<img src=x onerror=alert(1)>', barcode: '0001' }, {})

    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('.name')?.textContent).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('barcodeSvg', () => {
  it('stretches to the label box rather than a fixed pixel size', () => {
    const el = document.createElement('div')
    el.innerHTML = barcodeSvg('0264')
    const svg = el.querySelector('svg')!

    expect(svg.getAttribute('preserveAspectRatio')).toBe('none')
    expect(svg.hasAttribute('width')).toBe(false)
  })
})
