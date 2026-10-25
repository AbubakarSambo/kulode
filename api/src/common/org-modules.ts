import { BadRequestException } from '@nestjs/common';
import { OrgModule } from '@prisma/client';

// Invoicing is now an add-on to the POS (BOTH), not a product on its own. Orgs that were already
// invoicing-only before that decision keep their setting untouched, but no org may *become*
// invoicing-only — a new org, or an existing POS/BOTH one being reconfigured.
export function assertNotBecomingInvoicingOnly(current: OrgModule | undefined, next: OrgModule | undefined) {
  if (next === OrgModule.INVOICING && current !== OrgModule.INVOICING) {
    throw new BadRequestException('Invoicing-only is no longer offered — use POS + Invoicing (BOTH) instead');
  }
}
