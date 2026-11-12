import { parsePhoneNumberFromString } from 'libphonenumber-js';

// Phone numbers are the key to a customer (loyalty, phone-collection credits), so every number is
// normalised to E.164 ("+2348031234567") before it is saved or compared. Pure and dependency-light
// so it can be unit-tested exhaustively.
//
// Numbers typed WITHOUT a country code are read as the org's default country. Only NG has the
// stricter mobile-prefix rule today (070/080/081/090/091); any other country falls back to
// libphonenumber's own validity check. Numbers WITH a country code (+44…, 0044…, 234…) are
// validated as real numbers for whatever country they name, so international customers work.

export type PhoneRejection = 'EMPTY' | 'FORMAT' | 'INVALID' | 'REPEATED' | 'SEQUENCE' | 'BLOCKED';

export type PhoneResult =
  | { ok: true; e164: string }
  | { ok: false; reason: PhoneRejection };

export const DEFAULT_PHONE_COUNTRY = 'NG';

const NG_MOBILE = /^(70|80|81|90|91)\d{8}$/; // 10 digits, no leading 0

// Invisible direction marks (LRE/RLE/PDF/LRM/RLM/isolates) that WhatsApp/contacts copy in.
const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;

/** True when 7+ identical digits in a row, or 7+ digits in a straight ascending/descending run. */
function isTrivial(digits: string): 'REPEATED' | 'SEQUENCE' | null {
  let same = 1;
  let up = 1;
  let down = 1;
  for (let i = 1; i < digits.length; i++) {
    const d = Number(digits[i]);
    const p = Number(digits[i - 1]);
    same = d === p ? same + 1 : 1;
    up = d === p + 1 ? up + 1 : 1;
    down = d === p - 1 ? down + 1 : 1;
    if (same >= 7) return 'REPEATED';
    if (up >= 7 || down >= 7) return 'SEQUENCE';
  }
  return null;
}

export function normalisePhone(
  raw: string | null | undefined,
  country: string = DEFAULT_PHONE_COUNTRY,
  blocklist: readonly string[] = [],
): PhoneResult {
  const cleaned = (raw ?? '').replace(INVISIBLE, '').trim();
  if (!cleaned) return { ok: false, reason: 'EMPTY' };

  // Spaces, dashes, dots and brackets are formatting; anything else (letters, "xxx") is not a number.
  const compact = cleaned.replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(compact)) return { ok: false, reason: 'FORMAT' };

  let e164: string;
  let national: string; // significant digits without country code or trunk 0

  const hasPlus = compact.startsWith('+');
  const digits = compact.replace(/^\+/, '');

  if (hasPlus || digits.startsWith('00')) {
    const intl = '+' + digits.replace(/^00/, '');
    const parsed = parsePhoneNumberFromString(intl);
    if (!parsed || !parsed.isValid()) return { ok: false, reason: 'INVALID' };
    e164 = parsed.number;
    national = parsed.nationalNumber;
    if (parsed.countryCallingCode === '234' && !NG_MOBILE.test(national)) return { ok: false, reason: 'INVALID' };
  } else if (country === 'NG') {
    if (/^234\d{10}$/.test(digits)) national = digits.slice(3);
    else if (/^0\d{10}$/.test(digits)) national = digits.slice(1);
    else if (/^\d{10}$/.test(digits)) national = digits;
    else return { ok: false, reason: 'INVALID' };
    if (!NG_MOBILE.test(national)) return { ok: false, reason: 'INVALID' };
    e164 = '+234' + national;
  } else {
    const parsed = parsePhoneNumberFromString(digits, country as never);
    if (!parsed || !parsed.isValid()) return { ok: false, reason: 'INVALID' };
    e164 = parsed.number;
    national = parsed.nationalNumber;
  }

  const trivial = isTrivial(national);
  if (trivial) return { ok: false, reason: trivial };

  const blocked = new Set(blocklist.map((b) => b.replace(/\D/g, '').replace(/^0+/, '')));
  if (blocked.has(e164.replace(/\D/g, '')) || blocked.has(national)) return { ok: false, reason: 'BLOCKED' };

  return { ok: true, e164 };
}

/**
 * Digit-only forms a stored number might take for the same phone. Existing customers were saved
 * as free text ("0803 …", "+234 803 …", "234803…"), so a lookup compares digits only against these.
 */
export function phoneDigitVariants(e164: string): string[] {
  const digits = e164.replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length === 13) {
    const national = digits.slice(3);
    return [digits, '0' + national, national];
  }
  return [digits];
}

export const PHONE_REJECTION_MESSAGES: Record<PhoneRejection, string> = {
  EMPTY: 'Enter a phone number',
  FORMAT: 'Phone number can only contain digits',
  INVALID: 'That is not a valid phone number',
  REPEATED: 'That number looks made up (repeated digits)',
  SEQUENCE: 'That number looks made up (digits in sequence)',
  BLOCKED: 'That number is not allowed',
};
