import { Prisma } from '@prisma/client';
import { computeRecipeCost } from './menu.service';

describe('computeRecipeCost', () => {
  it('is null for an item with no recipe rather than zero', () => {
    expect(computeRecipeCost([])).toBeNull();
  });

  it('sums quantity × ingredient cost across recipe lines', () => {
    // 0.25 kg rice @ ₦1,800/kg + 1 chicken portion @ ₦1,200 + 0.05 L oil @ ₦2,600/L
    expect(
      computeRecipeCost([
        { quantityPerUnit: 0.25, unitPrice: 1800 },
        { quantityPerUnit: 1, unitPrice: 1200 },
        { quantityPerUnit: 0.05, unitPrice: 2600 },
      ]),
    ).toBe(1780);
  });

  it('accepts Prisma decimals and rounds to kobo', () => {
    expect(
      computeRecipeCost([{ quantityPerUnit: new Prisma.Decimal('0.333'), unitPrice: new Prisma.Decimal('100.00') }]),
    ).toBe(33.3);
  });

  it('counts an ingredient with no cost set as free', () => {
    expect(computeRecipeCost([{ quantityPerUnit: 2, unitPrice: 0 }, { quantityPerUnit: 1, unitPrice: 500 }])).toBe(500);
  });
});
