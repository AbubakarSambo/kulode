import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TipSection } from './TipSection'

const base = { presets: [1000, 3000, 5000], waiterName: 'Amina B', billDue: 23500 }

describe('TipSection', () => {
  it('stays collapsed until the guest asks to tip', () => {
    render(<TipSection {...base} value={0} onChange={() => {}} />)
    expect(screen.queryByText('₦3,000')).toBeNull()
    fireEvent.click(screen.getByText('Add tip'))
    expect(screen.getByText('₦3,000')).toBeTruthy()
    expect(screen.getByText('Tip for Amina B')).toBeTruthy()
  })

  it('picks a preset', () => {
    const onChange = vi.fn()
    render(<TipSection {...base} value={0} onChange={onChange} />)
    fireEvent.click(screen.getByText('Add tip'))
    fireEvent.click(screen.getByText('₦3,000'))
    expect(onChange).toHaveBeenCalledWith(3000)
  })

  it('takes a custom amount', () => {
    const onChange = vi.fn()
    render(<TipSection {...base} value={0} onChange={onChange} />)
    fireEvent.click(screen.getByText('Add tip'))
    fireEvent.click(screen.getByText('Custom'))
    fireEvent.change(screen.getByPlaceholderText('Tip amount'), { target: { value: '2500' } })
    expect(onChange).toHaveBeenLastCalledWith(2500)
  })

  it('says so when no waiter owns the order', () => {
    render(<TipSection {...base} waiterName={null} value={1000} onChange={() => {}} />)
    expect(screen.getByText('Tip (no waiter on this order)')).toBeTruthy()
  })

  it('hand-to-guest shows who the tip is for and commits only on confirm', () => {
    const onChange = vi.fn()
    render(<TipSection {...base} value={0} onChange={onChange} />)
    fireEvent.click(screen.getByText('Add tip'))
    fireEvent.click(screen.getByText('Hand to guest'))
    expect(screen.getByText('It goes to Amina B.')).toBeTruthy()

    // Two ₦5,000 buttons now exist (cashier view behind, guest view in front) — take the guest's.
    const fives = screen.getAllByText('₦5,000')
    fireEvent.click(fives[fives.length - 1])
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Confirm ₦5,000 tip'))
    expect(onChange).toHaveBeenCalledWith(5000)
    expect(screen.queryByText('It goes to Amina B.')).toBeNull()
  })
})
