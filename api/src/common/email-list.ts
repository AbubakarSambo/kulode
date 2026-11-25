import { isEmail, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

export const MAX_REPORT_EMAILS = 5;

/** "a@x.com, B@y.com ,a@x.com" -> ["a@x.com", "b@y.com"]: trimmed, lower-cased, de-duplicated. */
export function parseEmailList(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const part of (raw ?? '').split(/[,;\n]/)) {
    const email = part.trim().toLowerCase();
    if (email) seen.add(email);
  }
  return [...seen];
}

/** Empty is allowed (it clears the setting); otherwise every entry must be an email, at most 5. */
@ValidatorConstraint({ name: 'emailList', async: false })
export class EmailListConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value !== 'string') return false;
    const emails = parseEmailList(value);
    return emails.length <= MAX_REPORT_EMAILS && emails.every((e) => isEmail(e));
  }
  defaultMessage(): string {
    return `Enter up to ${MAX_REPORT_EMAILS} valid email addresses, separated by commas`;
  }
}
