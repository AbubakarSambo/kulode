import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Re-declaring the schemas from InvoiceForm.tsx since they are local to that file
const invoiceItemSchema = z.object({
  serviceItemId: z.string().optional(),
  inventoryItemId: z.string().optional(),
  description: z.string(),
  quantity: z.number().min(0.01, 'Quantity must be greater than 0'),
  unitPrice: z.number().min(0, 'Price must be 0 or greater'),
})

const installmentSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  percentage: z.number().min(1).max(100),
})

const invoiceSchema = z.object({
  clientId: z.string().min(1, 'Client is required'),
  issueDate: z.string().min(1, 'Issue date is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  discountPercent: z.number().min(0).optional(),
  installments: z.array(installmentSchema).optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
})

describe('Invoice Zod Schemas', () => {
  describe('invoiceItemSchema', () => {
    it('should validate a valid invoice item', () => {
      const validItem = {
        description: 'Consulting Services',
        quantity: 2,
        unitPrice: 1500,
      }
      expect(invoiceItemSchema.safeParse(validItem).success).toBe(true)
    })

    it('should allow optional serviceItemId and inventoryItemId', () => {
      const itemWithIds = {
        description: 'Physical Product',
        quantity: 10,
        unitPrice: 50,
        serviceItemId: 'srv-123',
        inventoryItemId: 'inv-456',
      }
      expect(invoiceItemSchema.safeParse(itemWithIds).success).toBe(true)
    })

    it('should fail validation when quantity is 0 or less', () => {
      const zeroQty = {
        description: 'Test Item',
        quantity: 0,
        unitPrice: 100,
      }
      const negativeQty = {
        description: 'Test Item',
        quantity: -1.5,
        unitPrice: 100,
      }

      const zeroResult = invoiceItemSchema.safeParse(zeroQty)
      expect(zeroResult.success).toBe(false)
      if (!zeroResult.success) {
        expect(zeroResult.error.issues[0].message).toBe('Quantity must be greater than 0')
      }

      const negativeResult = invoiceItemSchema.safeParse(negativeQty)
      expect(negativeResult.success).toBe(false)
      if (!negativeResult.success) {
        expect(negativeResult.error.issues[0].message).toBe('Quantity must be greater than 0')
      }
    })

    it('should fail validation when unitPrice is less than 0', () => {
      const negativePrice = {
        description: 'Test Item',
        quantity: 1,
        unitPrice: -50,
      }
      const result = invoiceItemSchema.safeParse(negativePrice)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Price must be 0 or greater')
      }
    })
  })

  describe('installmentSchema', () => {
    it('should validate a valid installment', () => {
      const validInstallment = {
        label: 'Deposit',
        percentage: 50,
      }
      expect(installmentSchema.safeParse(validInstallment).success).toBe(true)
    })

    it('should fail validation with empty label', () => {
      const emptyLabel = {
        label: '',
        percentage: 50,
      }
      const result = installmentSchema.safeParse(emptyLabel)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Label is required')
      }
    })

    it('should fail validation if percentage is out of range 1-100', () => {
      const tooLow = { label: 'First payment', percentage: 0 }
      const tooHigh = { label: 'First payment', percentage: 101 }

      expect(installmentSchema.safeParse(tooLow).success).toBe(false)
      expect(installmentSchema.safeParse(tooHigh).success).toBe(false)
    })
  })

  describe('invoiceSchema', () => {
    const validInvoiceData = {
      clientId: 'client-987',
      issueDate: '2026-06-10',
      dueDate: '2026-07-10',
      items: [
        {
          description: 'Software Setup',
          quantity: 1,
          unitPrice: 500,
        },
      ],
    }

    it('should validate a valid invoice with only required fields', () => {
      expect(invoiceSchema.safeParse(validInvoiceData).success).toBe(true)
    })

    it('should validate a valid invoice with all optional fields', () => {
      const fullInvoice = {
        ...validInvoiceData,
        discountType: 'PERCENTAGE' as const,
        discountPercent: 10,
        installments: [
          { label: 'Milestone 1', percentage: 40 },
          { label: 'Milestone 2', percentage: 60 },
        ],
        notes: 'Payment within 30 days.',
        terms: 'No refunds.',
      }
      expect(invoiceSchema.safeParse(fullInvoice).success).toBe(true)
    })

    it('should fail validation if clientId, issueDate, or dueDate is empty', () => {
      const missingClient = { ...validInvoiceData, clientId: '' }
      const result = invoiceSchema.safeParse(missingClient)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Client is required')
      }

      const missingIssue = { ...validInvoiceData, issueDate: '' }
      const resultIssue = invoiceSchema.safeParse(missingIssue)
      expect(resultIssue.success).toBe(false)
      if (!resultIssue.success) {
        expect(resultIssue.error.issues[0].message).toBe('Issue date is required')
      }

      const missingDue = { ...validInvoiceData, dueDate: '' }
      const resultDue = invoiceSchema.safeParse(missingDue)
      expect(resultDue.success).toBe(false)
      if (!resultDue.success) {
        expect(resultDue.error.issues[0].message).toBe('Due date is required')
      }
    })

    it('should fail validation if items array is empty', () => {
      const noItems = { ...validInvoiceData, items: [] }
      const result = invoiceSchema.safeParse(noItems)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('At least one item is required')
      }
    })

    it('should fail validation with invalid discountType enum value', () => {
      const invalidDiscount = {
        ...validInvoiceData,
        discountType: 'INVALID_ENUM',
      }
      expect(invoiceSchema.safeParse(invalidDiscount).success).toBe(false)
    })
  })
})
