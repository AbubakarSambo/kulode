-- 3- and 6-month subscription terms alongside monthly and annual.
ALTER TYPE "BillingPeriod" ADD VALUE 'QUARTERLY';
ALTER TYPE "BillingPeriod" ADD VALUE 'BIANNUAL';
