import type { LeaderboardMetric, LeaderboardSettings } from './leaderboard.settings';

// Pure ranking logic for the staff leaderboard, kept apart from the Prisma queries so every rule
// can be unit tested.

export interface StaffTotals {
  userId: string;
  name: string;
  revenue: number;
  orders: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  isYou: boolean;
  // 0-100, relative to the leader — the one thing everyone can see about everyone.
  barPercent: number;
  // Real figures: null for other people's rows unless the viewer may see them.
  revenue: number | null;
  avgCheck: number | null;
  orders: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildLeaderboard(
  staff: StaffTotals[],
  metric: LeaderboardMetric,
  settings: LeaderboardSettings,
  viewerId: string,
  canSeeAllAmounts: boolean,
): { entries: LeaderboardEntry[]; you: LeaderboardEntry | null; qualifying: number } {
  const scored = staff
    .filter((s) => s.orders > 0)
    // Average check needs a minimum number of orders; revenue ranks anyone who sold something.
    .filter((s) => metric !== 'AVG_CHECK' || s.orders >= settings.minOrders)
    .map((s) => ({ ...s, avgCheck: s.revenue / s.orders }))
    .map((s) => ({ ...s, score: metric === 'REVENUE' ? s.revenue : s.avgCheck }))
    // Ties break on revenue, then name, so the order is stable between refreshes.
    .sort((a, b) => b.score - a.score || b.revenue - a.revenue || a.name.localeCompare(b.name));

  const top = scored[0]?.score ?? 0;
  const show = (s: (typeof scored)[number], index: number): LeaderboardEntry => {
    const isYou = s.userId === viewerId;
    const visible = isYou || canSeeAllAmounts || settings.showAmountsToAll;
    return {
      rank: index + 1,
      userId: s.userId,
      name: s.name,
      isYou,
      barPercent: top > 0 ? Math.round((s.score / top) * 100) : 0,
      revenue: visible ? round2(s.revenue) : null,
      avgCheck: visible ? round2(s.avgCheck) : null,
      orders: visible ? s.orders : null,
    };
  };

  const all = scored.map(show);
  const entries = all.slice(0, settings.topN);
  const you = all.find((e) => e.isYou) ?? null;
  return { entries, you, qualifying: all.length };
}
