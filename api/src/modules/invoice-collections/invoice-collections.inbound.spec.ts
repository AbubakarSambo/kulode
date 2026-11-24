import { classifyReply } from './invoice-collections.inbound';

// Thursday 10 December 2026, 11:00 in Lagos
const NOW = new Date('2026-12-10T10:00:00Z');
const TZ = 'Africa/Lagos';
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const classify = (t: string) => classifyReply(t, NOW, TZ);

describe('classifyReply', () => {
  it.each(['STOP', 'stop', 'Please unsubscribe me', "don't message me again", 'remove my number', 'opt out'])('%s is an opt-out', (t) => {
    expect(classify(t).intent).toBe('OPT_OUT');
  });

  it.each(['I have paid', "i've paid already", 'Payment done', 'I don pay', 'I just transferred it', 'already paid o'])('%s claims payment', (t) => {
    expect(classify(t).intent).toBe('CLAIMS_PAID');
  });

  it.each(["I haven't paid yet", 'not paid, will do it soon', 'I am yet to pay'])('%s is not a payment claim', (t) => {
    expect(classify(t).intent).not.toBe('CLAIMS_PAID');
  });

  it.each([
    ['I will pay tomorrow', '2026-12-11'],
    ['tomorrow', '2026-12-11'],
    ['I go pay today', '2026-12-10'],
    ['will transfer on Friday', '2026-12-11'],
    ['I will send it monday', '2026-12-14'],
    ['will pay next week', '2026-12-17'],
    ['I will pay in 3 days', '2026-12-13'],
    ['will settle by 15 Dec', '2026-12-15'],
    ['I will pay on the 20th of december', '2026-12-20'],
    ['will pay dec 18', '2026-12-18'],
    ['pay 22/12', '2026-12-22'],
    ['I will pay end of the month', '2026-12-31'],
    ['will send by end of week', '2026-12-11'],
  ])('"%s" promises %s', (text, iso) => {
    expect(classify(text)).toEqual({ intent: 'WILL_PAY_ON', promisedDate: day(iso) });
  });

  it('treats the same weekday as next week, not today', () => {
    expect(classify('will pay thursday').promisedDate).toEqual(day('2026-12-17'));
  });

  it('rolls a past month/day into next year', () => {
    expect(classifyReply('will pay 5 jan', NOW, TZ).promisedDate).toEqual(day('2027-01-05'));
  });

  it('does not mistake words for weekdays or months', () => {
    expect(classify('I will send money after the market opens').intent).toBe('OTHER');
  });

  it('hands promises beyond 30 days to the owner', () => {
    expect(classify('I will pay on 28 feb').intent).toBe('OTHER');
  });

  it('rejects impossible dates', () => {
    expect(classify('will pay 31 feb').intent).toBe('OTHER');
  });

  it('does not read a date into a message that is not about paying', () => {
    expect(classify('please call my manager tomorrow about the delivery problem').intent).toBe('OTHER');
  });

  it('uses the business time zone for "today"', () => {
    // 23:30 UTC on the 10th is already the 11th in Lagos
    const late = new Date('2026-12-10T23:30:00Z');
    expect(classifyReply('tomorrow', late, TZ).promisedDate).toEqual(day('2026-12-12'));
  });

  it('sends empty and unclear text to the owner', () => {
    expect(classify('').intent).toBe('OTHER');
    expect(classify('who is this?').intent).toBe('OTHER');
    expect(classify('this invoice is wrong, I did not order 40 units').intent).toBe('OTHER');
  });
});
