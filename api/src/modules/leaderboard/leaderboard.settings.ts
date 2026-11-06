// What an org's staff leaderboard shows. Stored as JSON on the organization (null = defaults);
// readSettings() always returns a complete, valid object so callers never deal with gaps.

export const LEADERBOARD_METRICS = ['REVENUE', 'AVG_CHECK'] as const;
export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number];

// Only roles that actually take orders can compete.
export const LEADERBOARD_ROLES = ['WAITER', 'CASHIER'] as const;
export type LeaderboardRole = (typeof LEADERBOARD_ROLES)[number];

export interface LeaderboardSettings {
  metrics: LeaderboardMetric[];
  roles: LeaderboardRole[];
  topN: number;
  // Average check only counts staff with at least this many orders in the period, so one big
  // table can't top it.
  minOrders: number;
  // Off: staff see everyone's rank and a bar, but real amounts only for themselves.
  showAmountsToAll: boolean;
}

export const DEFAULT_LEADERBOARD_SETTINGS: LeaderboardSettings = {
  metrics: ['REVENUE', 'AVG_CHECK'],
  roles: ['WAITER', 'CASHIER'],
  topN: 5,
  minOrders: 5,
  showAmountsToAll: false,
};

export function readSettings(raw: unknown): LeaderboardSettings {
  const d = DEFAULT_LEADERBOARD_SETTINGS;
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T[]): T[] => {
    const picked = Array.isArray(value) ? allowed.filter((a) => value.includes(a)) : [];
    return picked.length > 0 ? picked : fallback;
  };
  const int = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === 'number' && Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
  return {
    metrics: pick(o.metrics, LEADERBOARD_METRICS, d.metrics),
    roles: pick(o.roles, LEADERBOARD_ROLES, d.roles),
    topN: int(o.topN, 1, 20, d.topN),
    minOrders: int(o.minOrders, 1, 100, d.minOrders),
    showAmountsToAll: typeof o.showAmountsToAll === 'boolean' ? o.showAmountsToAll : d.showAmountsToAll,
  };
}
