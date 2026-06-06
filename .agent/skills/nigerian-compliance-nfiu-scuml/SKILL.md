---
name: nigerian-compliance-nfiu-scuml
description: "Expert on Nigerian Financial Intelligence Unit (NFIU) and Special Control Unit against Money Laundering (SCUML) reporting guidelines. Guides on AML/CFT compliance, DNFBP transaction threshold monitoring, CTR/STR generation, and KYC requirements in Nigeria."
risk: safe
source: local
date_added: "2026-06-01"
---

# Nigerian AML/CFT Compliance (NFIU & SCUML)

You are an expert on anti-money laundering (AML) and countering the financing of terrorism (CFT) regulations in Nigeria, focusing on **NFIU** (Nigerian Financial Intelligence Unit) and **SCUML** (Special Control Unit against Money Laundering) reporting requirements. 

This skill covers Designated Non-Financial Businesses and Professions (DNFBPs)—such as car dealers, real estate developers, hotels, and jewelers—who must report high-value transactions.

## Use this skill when:
- Designing or implementing KYC/KYB workflows for Nigerian organizations.
- Building transaction monitoring logic for Cash Transaction Reports (CTRs) or Suspicious Transaction Reports (STRs).
- Implementing data structures matching the NFIU **goAML** XML schema or SCUML reporting portals.
- Setting up compliance threshold alert hooks on invoices and cash payments.

---

## 1. Regulatory Context & Thresholds

DNFBPs (Designated Non-Financial Businesses and Professions) are legally mandated under the **Money Laundering (Prevention and Prohibition) Act, 2022** to report transactions above specific limits:

- **Cash Transaction Thresholds (CTR):**
  - **Individuals:** Any single cash transaction of **₦5,000,000** or above.
  - **Body Corporate (Companies):** Any single cash transaction of **₦10,000,000** or above.
- **Reporting Deadlines:** 
  - CTRs must be reported to SCUML/NFIU within **7 days** of transaction occurrence.
  - Suspicious Transaction Reports (STRs) must be reported within **24 hours** of detection, regardless of the transaction amount.

---

## 2. Customer Identification & Verification (KYC)

For transactions matching or nearing reporting thresholds, the system must collect and verify:
- **For Individuals:**
  - Full Name, Residential Address, Phone Number, Date of Birth.
  - Biometric IDs: **NIN** (National Identification Number) or **BVN** (Bank Verification Number).
  - Valid Government ID (International Passport, Driver’s License, Voter’s Card).
- **For Corporates:**
  - Company Registered Name, Registered Office Address.
  - **CAC Registration Number (RC Number)**.
  - **TIN** (Tax Identification Number) / SCUML registration certificate.
  - Beneficial Ownership declaration.

---

## 3. Designing Technical Implementations

### Zod Validation Schema (Example)
Ensure Zod strictly sanitizes and validates transaction metadata before generating reports:

```typescript
import { z } from 'zod';

export const DnfbpTransactionReportSchema = z.object({
  transactionId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3).default('NGN'),
  paymentMode: z.enum(['CASH', 'TRANSFER', 'CHQ', 'POS']),
  customerType: z.enum(['INDIVIDUAL', 'CORPORATE']),
  customerDetails: z.object({
    name: z.string().min(3),
    phone: z.string().regex(/^\+?234\d{10}$/, 'Invalid Nigerian phone number'),
    email: z.string().email().optional(),
    identityNumber: z.string().min(10).max(11), // NIN or BVN or RC Number
    identityType: z.enum(['NIN', 'BVN', 'CAC_RC', 'PASSPORT', 'DRIVER_LICENSE']),
    address: z.string().min(10),
  }),
  assetDetails: z.object({
    assetType: z.string(), // e.g., "VEHICLE", "PROPERTY"
    description: z.string(),
    uniqueIdentifier: z.string().optional(), // VIN (Chassis No) for cars, Land Registry ID for properties
  }),
  sourceOfFunds: z.string().min(5),
  complianceStatus: z.enum(['PENDING_REPORT', 'SUBMITTED', 'EXEMPT']),
});
```

### goAML / SCUML Report Export Pattern
Most NFIU reports are uploaded through the **goAML web portal** using XML schemas. Establish service patterns to generate standard goAML structures:

```typescript
// Example schema structure for goAML XML export
export interface GoAMLReport {
  reportHeader: {
    rentityId: string; // Reporting Entity SCUML Registration ID
    submissionDate: string;
    reportType: 'CTR' | 'STR';
  };
  transactions: Array<{
    transactionNumber: string;
    valueDate: string;
    amountLocal: number;
    paymentType: string;
    transactor: {
      firstName: string;
      lastName: string;
      idNumber: string;
      address: string;
    };
  }>;
}
```

---

## 4. Operational Best Practices

1. **Transaction Splitting Detection (Structuring):** Design analytics hooks that look for multiple cash payments from the same customer within 48-72 hours that aggregate to ₦5,000,000+ to flag structuring attempts.
2. **Audit Logs:** Maintain an immutable record of all threshold violations, reports generated, and portal receipt uploads.
3. **Data Security:** Encrypt customer NIN/BVN identifiers at rest using AES-256-GCM. Never store plain text identifiers in search index logs.
