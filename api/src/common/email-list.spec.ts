import { EmailListConstraint, parseEmailList } from './email-list';

describe('email list', () => {
  it('trims, lower-cases and de-duplicates', () => {
    expect(parseEmailList(' Boss@X.com, a@y.com ;boss@x.com,')).toEqual(['boss@x.com', 'a@y.com']);
    expect(parseEmailList(null)).toEqual([]);
    expect(parseEmailList('  ')).toEqual([]);
  });

  it('accepts empty and valid lists, rejects bad addresses and more than five', () => {
    const c = new EmailListConstraint();
    expect(c.validate('')).toBe(true);
    expect(c.validate(undefined)).toBe(true);
    expect(c.validate('a@x.com, b@y.org')).toBe(true);
    expect(c.validate('a@x.com, nope')).toBe(false);
    expect(c.validate('1@x.com,2@x.com,3@x.com,4@x.com,5@x.com,6@x.com')).toBe(false);
    expect(c.validate(42)).toBe(false);
  });
});
