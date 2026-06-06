---
name: nigerian-tax-filing-compliance
description: "Expert on Nigerian Tax Laws (Finance Act updates, Withholding Tax Regulations 2024, VAT). Guides on calculating VAT, withholding tax deductions, and exporting tax schedules for FIRS filing."
risk: safe
source: local
date_added: "2026-06-01"
---

# Nigerian Tax Filing and Compliance

You are an expert on Nigerian tax laws, including the **Finance Act (2023/2024 updates)** and the **Withholding Tax (WHT) Regulations 2024**. This skill guides developers in implementing tax calculation logic, VAT invoicing requirements, and generating data exports suitable for filing with the **Federal Inland Revenue Service (FIRS)** and State Internal Revenue Services (SIRS).

## Use this skill when:
- Adding tax calculation fields (VAT, WHT) to invoices, quotes, or purchase orders.
- Designing tax reporting dashboards showing collected VAT and deducted WHT.
- Building data export modules (CSV/Excel) for FIRS e-filing portals.
- Setting up tax exemption thresholds and business categorization logic.

---

## 1. Core Nigerian Tax Rates & Rules

### Value Added Tax (VAT)
- **Rate:** **7.5%** on all vatable goods and services.
- **Exemptions:** Basic food items, medical goods/services, books and educational materials, and businesses with an annual turnover of less than **₦25,000,000** (exempt from VAT registration and collection, though they can choose to opt-in).
- **Invoicing Requirement:** Vatable invoices must display the supplier's **TIN (Tax Identification Number)** and show the 7.5% VAT calculation clearly as a separate line item.

### Withholding Tax (WHT) - *Regulations 2024 Update*
WHT is an advance payment of income tax deducted at source. The 2024 regulations simplified WHT compliance:
- **Exemptions:** 
  - Transactions below **₦50,000** in value are exempt from WHT.
  - Small companies (turnover under ₦25M) are generally exempt from WHT deductions on transactions.
- **Key Rates (Reduced/Simplified):**
  - **Contracts for Construction/Supplies:** 2% (reduced from 5% for corporate entities).
  - **Professional / Consultancy Services:** 5% for corporate entities (formerly 10%), 2% for individuals.
  - **Rent / Royalties:** 10% for both individuals and corporates.
  - **Director Fees:** 10%.

### Companies Income Tax (CIT)
Based on annual corporate turnover:
- **Small Companies (< ₦25M):** 0% CIT rate.
- **Medium Companies (₦25M - ₦100M):** 20% CIT rate.
- **Large Companies (> ₦100M):** 30% CIT rate.

### Tertiary Education Tax (TET)
- **Rate:** **3%** of assessable profits for all registered corporate companies in Nigeria (increased from 2.5% under the Finance Act 2023).

---

## 2. Invoicing Data Structure & Validations

To automate tax computations, invoices must support distinct calculation blocks for VAT and WHT.

### Zod Validation Schema (Example)
```typescript
import { z } from 'zod';

export const TaxCalculationSchema = z.object({
  subTotal: z.number().nonnegative(),
  isVatExempt: z.boolean().default(false),
  vatRate: z.number().default(0.075), // 7.5%
  vatAmount: z.number().nonnegative(),
  
  applyWht: z.boolean().default(false),
  whtCategory: z.enum([
    'CONSULTANCY_PROFESSIONAL', // 5% corp / 2% indiv
    'CONSTRUCTION_SUPPLIES',     // 2% corp
    'RENT_ROYALTIES',           // 10%
    'COMMISSION_FEES',          // 2%
    'NONE'
  ]).default('NONE'),
  whtRate: z.number().default(0.0),
  whtAmount: z.number().nonnegative(),
  
  totalAmountPayable: z.number().positive(), // subTotal + vatAmount - whtAmount
});
```

---

## 3. Generating FIRS Tax Filing Schedules

FIRS requires tax schedules to be submitted in specific tabular formats. Your tax export modules should generate clean CSVs containing the following headers:

### VAT Schedule Format
- `SerialNumber`
- `CustomerName`
- `CustomerTIN` (Must validate as a 10 or 12-digit number)
- `InvoiceNumber`
- `InvoiceDate` (YYYY-MM-DD)
- `TransactionAmount` (Exclude VAT)
- `VATAmount` (TransactionAmount * 0.075)

### WHT Schedule Format
- `SerialNumber`
- `BeneficiaryName` (Supplier who was paid)
- `BeneficiaryTIN`
- `PaymentDate`
- `TransactionType` (e.g., "Consultancy", "Rent")
- `GrossAmount`
- `WHTRate`
- `WHTAmountDeducted`

---

## 4. Implementation Best Practices
1. **Immutable Invoices:** Once an invoice is sent or marked as paid, its tax calculations must be locked to prevent historic tax record alteration.
2. **Exemption Certificates:** Allow users to upload Tax Exemption Certificates (such as small business status or agricultural exemptions) to automatically toggle `isVatExempt` to `true`.
3. **Double-Taxation Prevention:** Ensure WHT is calculated on the **Gross Amount** (before VAT is added) and never computed on the VAT portion itself.
