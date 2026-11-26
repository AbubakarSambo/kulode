export interface TransferDetails {
  accountNumber: string;
  accountName: string | null;
  bankName: string;
  /** Naira, with two decimals. */
  amount: string;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * Reads where to send the one-time transfer from a Direct Debit charge response. The two layouts use
 * different units: fields directly on `data` give the amount in kobo (as we sent it), while a nested
 * `transferDetails` object gives naira ("50.00"). Returns null unless the account, bank and amount are
 * all there: a customer must never be shown a partial or wrongly scaled instruction.
 */
export function readTransferDetails(data: any): TransferDetails | null {
  const nested = data?.transferDetails;
  const source = nested ?? data ?? {};

  const accountNumber = source.account_number != null ? String(source.account_number) : null;
  const bankName =
    text(source.bank_name) ?? text(source.bankName) ?? text(source.bank) ?? text(source.bank?.name);
  const raw = Number(source.amount);
  const naira = nested ? raw : raw / 100;

  if (!accountNumber || !bankName || !Number.isFinite(naira) || naira <= 0) return null;
  return { accountNumber, accountName: text(source.account_name) ?? text(source.accountName), bankName, amount: naira.toFixed(2) };
}

/**
 * For the log when a response can't be read: every field name, plus the values of bank and amount
 * fields only, so nothing about the customer is written down.
 */
export function describeResponseShape(value: unknown, path = ''): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const name = path ? `${path}.${key}` : key;
    if (child && typeof child === 'object') return describeResponseShape(child, name);
    return [/bank_?name|^bank$|bank\.name$|amount|display_text/i.test(name) ? `${name}=${String(child)}` : name];
  });
}
