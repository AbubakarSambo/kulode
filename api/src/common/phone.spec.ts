import { normalisePhone, phoneDigitVariants } from './phone';

const ok = (raw: string, e164: string) => expect(normalisePhone(raw)).toEqual({ ok: true, e164 });
const bad = (raw: string, reason: string, blocklist: string[] = []) =>
  expect(normalisePhone(raw, 'NG', blocklist)).toEqual({ ok: false, reason });

describe('normalisePhone', () => {
  it('normalises every Nigerian format seen in production to +234', () => {
    ok('08032088266', '+2348032088266');
    ok('2348032088266', '+2348032088266');
    ok('+234 803 208 8266', '+2348032088266');
    ok('+234 8032088266', '+2348032088266');
    ok('8032088266', '+2348032088266');
    ok('0803-208-8266', '+2348032088266');
    ok('‪+234 803 208 8266‬', '+2348032088266'); // WhatsApp direction marks
    ok('07068344668..', '+2347068344668'); // trailing dots are formatting
  });

  it('accepts the Nigerian mobile prefixes 070, 080, 081, 090, 091', () => {
    ['07031234569', '08031234569', '08131234569', '09031234569', '09131234569'].forEach((n) =>
      expect(normalisePhone(n).ok).toBe(true),
    );
  });

  it('rejects Nigerian numbers with other prefixes or wrong length', () => {
    bad('08231234569', 'INVALID');
    bad('0803123456', 'INVALID');
    bad('080312345690', 'INVALID');
    bad('+2346789009887', 'INVALID');
  });

  it('rejects placeholders and non-numbers', () => {
    bad('090xxxx', 'FORMAT');
    bad('070....', 'INVALID');
    bad('080', 'INVALID');
    bad('', 'EMPTY');
    bad('   ', 'EMPTY');
  });

  it('rejects all-same digits and straight sequences (P4)', () => {
    bad('08000000000', 'REPEATED');
    bad('08033333333', 'REPEATED');
    bad('08012345678', 'SEQUENCE');
    bad('09087654321', 'SEQUENCE');
  });

  it('accepts a real number that merely contains a short run', () => {
    expect(normalisePhone('08031234569').ok).toBe(true); // 1234 is only a 4-run
  });

  it('accepts valid international numbers and rejects invalid ones', () => {
    ok('+44 7911 123456', '+447911123456');
    ok('0044 7911 123456', '+447911123456');
    ok('+1 650-253-0000', '+16502530000');
    bad('+44 1234', 'INVALID');
  });

  it('honours the admin blocklist in any stored format', () => {
    bad('08031234569', 'BLOCKED', ['08031234569']);
    bad('+2348031234569', 'BLOCKED', ['+234 803 123 4569']);
  });
});

describe('phoneDigitVariants', () => {
  it('lists the forms a Nigerian number may be stored as', () => {
    expect(phoneDigitVariants('+2348032088266')).toEqual(['2348032088266', '08032088266', '8032088266']);
  });
  it('returns just the digits for an international number', () => {
    expect(phoneDigitVariants('+447911123456')).toEqual(['447911123456']);
  });
});
