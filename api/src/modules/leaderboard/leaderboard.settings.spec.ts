import { DEFAULT_LEADERBOARD_SETTINGS, readSettings } from './leaderboard.settings';

describe('readSettings', () => {
  it('falls back to the defaults for null, junk and empty lists', () => {
    expect(readSettings(null)).toEqual(DEFAULT_LEADERBOARD_SETTINGS);
    expect(readSettings('nope')).toEqual(DEFAULT_LEADERBOARD_SETTINGS);
    expect(readSettings({ metrics: [], roles: ['ADMIN'], topN: 'ten' })).toEqual(DEFAULT_LEADERBOARD_SETTINGS);
  });

  it('keeps valid values and clamps numbers into range', () => {
    expect(readSettings({ metrics: ['AVG_CHECK'], roles: ['WAITER'], topN: 50, minOrders: 0, showAmountsToAll: true })).toEqual({
      metrics: ['AVG_CHECK'],
      roles: ['WAITER'],
      topN: 20,
      minOrders: 1,
      showAmountsToAll: true,
    });
  });
});
