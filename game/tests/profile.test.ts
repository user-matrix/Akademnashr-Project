import { describe, expect, it } from 'vitest';
import { completeDaily, dateKey, defaultProfile, liveDailyStreak, previousDateKey, sanitizeProfile } from '../src/services/profile';

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
});
