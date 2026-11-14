import { describe, expect, it } from 'vitest';
import {
  claimDailyReward,
  completeDaily,
  DAILY_REWARDS,
  dateKey,
  defaultProfile,
  liveDailyStreak,
  previousDateKey,
  rewardState,
  sanitizeProfile,
} from '../src/services/profile';

describe('profile', () => {
  it('sanitises garbage into a valid profile', () => {
    expect(sanitizeProfile(null)).toEqual(defaultProfile());
    expect(sanitizeProfile('x')).toEqual(defaultProfile());
    const p = sanitizeProfile({ coins: -5, bestClassic: 1.5, boosters: { hammer: 3 }, settings: { lang: 'fr', sound: false } });
    expect(p.coins).toBe(0);
    expect(p.bestClassic).toBe(0);
    expect(p.boosters.hammer).toBe(3);
    expect(p.boosters.rotate).toBe(defaultProfile().boosters.rotate);
    expect(p.settings.lang).toBeNull();
    expect(p.settings.sound).toBe(false);
  });

  it('computes date keys across month and year boundaries', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(previousDateKey('2026-03-01')).toBe('2026-02-28');
    expect(previousDateKey('2026-01-01')).toBe('2025-12-31');
  });

  it('tracks daily streaks', () => {
    const p = defaultProfile();
    expect(completeDaily(p, '2026-11-10')).toBe(1);
    expect(completeDaily(p, '2026-11-10')).toBe(1); // same day twice
    expect(completeDaily(p, '2026-11-11')).toBe(2);
    expect(liveDailyStreak(p, '2026-11-12')).toBe(2); // still alive today
    expect(liveDailyStreak(p, '2026-11-13')).toBe(0); // missed a day
    expect(completeDaily(p, '2026-11-13')).toBe(1);
  });

  it('runs the 7-day reward calendar', () => {
    const p = defaultProfile();
    const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'];
    expect(rewardState(p, days[0])).toEqual({ canClaim: true, today: 0, claimed: 0 });
    let coins = 0;
    days.forEach((d, i) => {
      const got = claimDailyReward(p, d)!;
      expect(got).toEqual(DAILY_REWARDS[i]);
      coins += DAILY_REWARDS[i].coins ?? 0;
      expect(claimDailyReward(p, d)).toBeNull(); // only once per day
    });
    expect(p.coins).toBe(coins);
    expect(rewardState(p, days[6])).toEqual({ canClaim: false, today: -1, claimed: 7 });
    // After the full cycle the next day starts again at day 1.
    expect(rewardState(p, '2026-11-08').today).toBe(0);
  });

  it('resets the reward streak after a missed day and doubles on demand', () => {
    const p = defaultProfile();
    claimDailyReward(p, '2026-11-01');
    claimDailyReward(p, '2026-11-02');
    expect(rewardState(p, '2026-11-03').today).toBe(2);
    expect(rewardState(p, '2026-11-04').today).toBe(0); // missed the 3rd
    const before = p.boosters.hammer;
    claimDailyReward(p, '2026-11-03'); // day 3: 100 coins
    expect(claimDailyReward(p, '2026-11-04', 2)).toEqual({ hammer: 2 });
    expect(p.boosters.hammer).toBe(before + 2);
  });

  it('sanitises skins', () => {
    expect(sanitizeProfile({ skins: { owned: ['neon', 'bogus', 'neon'], active: 'bogus' } }).skins).toEqual({
      owned: ['classic', 'neon'],
      active: 'classic',
    });
    expect(sanitizeProfile({ skins: { owned: ['candy'], active: 'candy' } }).skins.active).toBe('candy');
    expect(sanitizeProfile({ reward: { day: 99, lastClaim: 5 } }).reward).toEqual({ day: 6, lastClaim: null });
  });
});
