import { buildLeaderboard, StaffTotals } from './leaderboard.builder';
import { DEFAULT_LEADERBOARD_SETTINGS, LeaderboardSettings } from './leaderboard.settings';

const staff: StaffTotals[] = [
  { userId: 'a', name: 'Ada', revenue: 500000, orders: 25 }, // avg 20,000
  { userId: 'b', name: 'Bayo', revenue: 300000, orders: 6 }, // avg 50,000
  { userId: 'c', name: 'Chi', revenue: 400000, orders: 2 }, // avg 200,000 but too few orders
  { userId: 'd', name: 'Dara', revenue: 0, orders: 0 },
];
const settings = (over: Partial<LeaderboardSettings> = {}): LeaderboardSettings => ({ ...DEFAULT_LEADERBOARD_SETTINGS, ...over });

describe('buildLeaderboard', () => {
  it('ranks by revenue, and leaves out anyone with no orders', () => {
    const { entries } = buildLeaderboard(staff, 'REVENUE', settings(), 'a', false);
    expect(entries.map((e) => [e.rank, e.name])).toEqual([[1, 'Ada'], [2, 'Chi'], [3, 'Bayo']]);
  });

  it('ranks by average check, only counting staff with the minimum number of orders', () => {
    const { entries, qualifying } = buildLeaderboard(staff, 'AVG_CHECK', settings({ minOrders: 5 }), 'a', false);
    expect(entries.map((e) => e.name)).toEqual(['Bayo', 'Ada']); // Chi's 2 orders don't qualify
    expect(qualifying).toBe(2);
  });

  it('shows real figures only for the viewer unless they may see everyone', () => {
    const asAda = buildLeaderboard(staff, 'REVENUE', settings(), 'a', false).entries;
    expect(asAda.find((e) => e.name === 'Ada')).toMatchObject({ isYou: true, revenue: 500000, orders: 25, avgCheck: 20000 });
    expect(asAda.find((e) => e.name === 'Bayo')).toMatchObject({ isYou: false, revenue: null, avgCheck: null, orders: null });

    const asManager = buildLeaderboard(staff, 'REVENUE', settings(), 'manager', true).entries;
    expect(asManager.every((e) => e.revenue !== null)).toBe(true);

    const openBoard = buildLeaderboard(staff, 'REVENUE', settings({ showAmountsToAll: true }), 'a', false).entries;
    expect(openBoard.every((e) => e.revenue !== null)).toBe(true);
  });

  it('sizes bars relative to the leader', () => {
    const { entries } = buildLeaderboard(staff, 'REVENUE', settings(), 'a', false);
    expect(entries.map((e) => e.barPercent)).toEqual([100, 80, 60]);
  });

  it("limits the list to topN but still returns the viewer's own row when they are outside it", () => {
    const { entries, you } = buildLeaderboard(staff, 'REVENUE', settings({ topN: 1 }), 'b', false);
    expect(entries).toHaveLength(1);
    expect(you).toMatchObject({ rank: 3, name: 'Bayo', revenue: 300000 });
  });

  it('returns no row for a viewer who is not on the board (e.g. a manager)', () => {
    expect(buildLeaderboard(staff, 'REVENUE', settings(), 'manager', true).you).toBeNull();
  });

  it('breaks ties on revenue, then name, so the order is stable', () => {
    const tied: StaffTotals[] = [
      { userId: 'x', name: 'Zed', revenue: 100, orders: 1 },
      { userId: 'y', name: 'Amy', revenue: 100, orders: 1 },
    ];
    expect(buildLeaderboard(tied, 'REVENUE', settings(), 'x', false).entries.map((e) => e.name)).toEqual(['Amy', 'Zed']);
  });
});
