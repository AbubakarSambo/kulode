import { expiryText, moneyFormatter, rewardEarnedValues, rewardText, welcomeValues } from './loyalty.messages';

const rule = (name: string, threshold: number, items: string[]) => ({ name, thresholdAmount: threshold, items: items.map((n) => ({ menuItem: { name: n } })) });
const money = moneyFormatter('NGN');

describe('loyalty message values', () => {
  it('fills the welcome template slots in order, as in the approved sample', () => {
    const values = welcomeValues(
      'Amaka',
      'The Living Room',
      [rule('Meal Reward', 100000, ['Nigerian Breakfast', 'Smoked Chicken Salad']), rule('Reward Platter', 1000000, ['Reward Platter'])],
      money,
    );
    expect(values).toEqual(['Amaka', 'The Living Room', '₦100,000', 'Nigerian Breakfast or Smoked Chicken Salad', '₦1,000,000', 'Reward Platter']);
  });

  it('refuses to fill the two-reward welcome template for any other number of rewards', () => {
    const one = [rule('Meal', 100000, ['Jollof'])];
    const three = [rule('A', 1, ['x']), rule('B', 2, ['y']), rule('C', 3, ['z'])];
    expect(welcomeValues('A', 'Org', one, money)).toBeNull();
    expect(welcomeValues('A', 'Org', three, money)).toBeNull();
    expect(welcomeValues('A', 'Org', [rule('A', 1, []), rule('B', 2, ['y'])], money)).toBeNull();
  });

  it('describes what was earned', () => {
    expect(rewardText([{ count: 1, name: 'Meal Reward', items: ['Nigerian Breakfast', 'Smoked Chicken Salad'] }])).toBe('a free Nigerian Breakfast or Smoked Chicken Salad');
    expect(rewardText([{ count: 2, name: 'Meal Reward', items: ['Jollof'] }])).toBe('2 free Jollof');
    expect(
      rewardText([
        { count: 1, name: 'Meal Reward', items: ['Egg Sandwich'] },
        { count: 1, name: 'Reward Platter', items: ['Reward Platter'] },
      ]),
    ).toBe('a free Egg Sandwich and a free Reward Platter');
    expect(rewardText([{ count: 1, name: 'Mystery', items: [] }])).toBe('a free Mystery');
  });

  it('fills the reward-earned template slots in order', () => {
    expect(rewardEarnedValues('Amaka', 'The Living Room', { rewardText: 'a free Jollof', expiryText: '12 February 2027' })).toEqual([
      'Amaka',
      'The Living Room',
      'a free Jollof',
      '12 February 2027',
    ]);
  });

  it('formats the expiry date in the organization\'s timezone, long form', () => {
    expect(expiryText(new Date('2027-02-12T10:00:00Z'), 'Africa/Lagos')).toBe('12 February 2027');
    // 23:30 UTC is already the next day in Lagos (UTC+1)
    expect(expiryText(new Date('2027-02-11T23:30:00Z'), 'Africa/Lagos')).toBe('12 February 2027');
    expect(expiryText(new Date('2027-02-12T10:00:00Z'), 'Not/AZone')).toBe('2027-02-12');
  });

  it('formats money in the organization\'s currency, and survives an unknown code', () => {
    expect(moneyFormatter('NGN')(100000)).toBe('₦100,000');
    expect(moneyFormatter(null)(1000000)).toBe('₦1,000,000');
    expect(moneyFormatter('ZZZZ')(2500)).toBe('ZZZZ 2,500');
  });
});
