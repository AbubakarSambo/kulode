import { describe, it, expect } from 'vitest'
import { getRestrictedHrefsUnion } from './posRoleNav'

describe('getRestrictedHrefsUnion — storekeeper', () => {
  it('shows a storekeeper only the catalogue', () => {
    expect(getRestrictedHrefsUnion(['STOREKEEPER'])).toEqual(['/inventory'])
  })

  it('adds the catalogue to a cashier who also keeps the store', () => {
    const hrefs = getRestrictedHrefsUnion(['CASHIER', 'STOREKEEPER'])
    expect(hrefs).toContain('/inventory')
    expect(hrefs).toContain('/pos/orders')
  })

  it('leaves a storekeeper who is also a manager unrestricted', () => {
    expect(getRestrictedHrefsUnion(['STOREKEEPER', 'MANAGER'])).toBeNull()
  })
})
