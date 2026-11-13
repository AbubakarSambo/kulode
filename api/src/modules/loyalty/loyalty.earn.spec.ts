import { rewardsEarnedTotal, toKobo, toNextReward } from './loyalty.earn';

const naira = (n: number) => n * 100;
const MEAL = naira(100_000);
const MILESTONE = naira(1_000_000);

// How many NEW rewards a payment earns: the difference between the totals before and after.
const earnedBy = (before: number, add: number, threshold: number, repeating = true) =>
  rewardsEarnedTotal(naira(before + add), threshold, repeating) - rewardsEarnedTotal(naira(before), threshold, repeating);

describe('reward maths (acceptance cases from the brief)', () => {
  it('L1: a new member paying ₦90,000 earns nothing and is ₦10,000 from the first reward', () => {
    expect(earnedBy(0, 90_000, MEAL)).toBe(0);
    expect(toNextReward(naira(90_000), MEAL, true)).toBe(naira(10_000));
  });

  it('L2: ₦90,000 then ₦120,000 → lifetime ₦210,000, 2 meal rewards, ₦90,000 to the next', () => {
    expect(earnedBy(90_000, 120_000, MEAL)).toBe(2);
    expect(toNextReward(naira(210_000), MEAL, true)).toBe(naira(90_000));
  });

  it('L3: ₦990,000 then ₦30,000 → 1 meal reward and 1 milestone platter', () => {
    expect(earnedBy(990_000, 30_000, MEAL)).toBe(1);
    expect(earnedBy(990_000, 30_000, MILESTONE)).toBe(1);
  });

  it('stacking: at ₦1,000,000 a member has earned 10 meal rewards and 1 platter in total', () => {
    expect(rewardsEarnedTotal(naira(1_000_000), MEAL, true)).toBe(10);
    expect(rewardsEarnedTotal(naira(1_000_000), MILESTONE, true)).toBe(1);
  });

  it('one big order can earn several rewards, and the platter repeats at ₦2M, ₦3M', () => {
    expect(earnedBy(0, 350_000, MEAL)).toBe(3);
    expect(rewardsEarnedTotal(naira(3_400_000), MILESTONE, true)).toBe(3);
  });

  it('a one-off reward is earned once and never again', () => {
    expect(rewardsEarnedTotal(naira(5_000_000), MILESTONE, false)).toBe(1);
    expect(earnedBy(1_000_000, 1_000_000, MILESTONE, false)).toBe(0);
    expect(toNextReward(naira(1_000_000), MILESTONE, false)).toBeNull();
  });

  it('kobo amounts never drift (₦0.10 steps do not lose a kobo)', () => {
    let spend = 0;
    for (let i = 0; i < 1_000_000; i += 100_000) spend += toKobo(99_999.99) + toKobo(0.01);
    expect(spend).toBe(naira(1_000_000));
    expect(rewardsEarnedTotal(spend, MILESTONE, true)).toBe(1);
  });

  it('zero or negative spend and a zero threshold earn nothing', () => {
    expect(rewardsEarnedTotal(0, MEAL, true)).toBe(0);
    expect(rewardsEarnedTotal(naira(50), 0, true)).toBe(0);
  });
});
