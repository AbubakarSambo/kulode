import { BadRequestException } from '@nestjs/common';
import { assertNotBecomingInvoicingOnly } from './org-modules';

describe('assertNotBecomingInvoicingOnly', () => {
  it.each([
    ['POS', 'INVOICING'],
    ['BOTH', 'INVOICING'],
    [undefined, 'INVOICING'],
  ] as const)('refuses switching %s → %s', (current, next) => {
    expect(() => assertNotBecomingInvoicingOnly(current, next)).toThrow(BadRequestException);
  });

  it.each([
    ['INVOICING', 'INVOICING'], // a legacy org re-saving its own value (e.g. editing another field)
    ['INVOICING', 'BOTH'], // a legacy org adding the POS
    ['POS', 'BOTH'],
    ['BOTH', 'POS'],
    ['INVOICING', undefined], // modules not part of this update
  ] as const)('allows %s → %s', (current, next) => {
    expect(() => assertNotBecomingInvoicingOnly(current, next)).not.toThrow();
  });
});
