-- Backfill service_item_id on existing invoice_items by matching description
-- (case-insensitive) against service_items.name within the same organization.
-- Only exact matches are updated; unmatched rows remain NULL and fall into "Other".
UPDATE invoice_items
SET service_item_id = si.id
FROM invoices inv,
     service_items si
WHERE invoice_items.invoice_id = inv.id
  AND si.organization_id = inv.organization_id
  AND LOWER(si.name) = LOWER(invoice_items.description)
  AND invoice_items.service_item_id IS NULL;
