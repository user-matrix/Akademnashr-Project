import { ECONOMY } from '../config';
import { SKINS } from '../render/skins';
import type { Lang } from './i18n';

export type BoosterKind = 'rotate' | 'hammer' | 'reroll';
export const BOOSTERS: readonly BoosterKind[] = ['rotate', 'hammer', 'reroll'];

export interface Profile {
  v: 1;
  bestClassic: number;
  coins: number;
  boosters: Record<BoosterKind, number>;
  settings: { sound: boolean; haptics: boolean; lang: Lang | null };
  stats: { games: number; lines: number; gems: number };
  daily: { lastCompleted: string | null; streak: number; bestKey: string | null; best: number };
  noAds: boolean;
  tutorialDone: boolean;
  /** Daily reward calendar: `day` = index (0..6) of the next reward in the 7-day cycle. */
  reward: { lastClaim: string | null; day: number };
  skins: { owned: string[]; active: string };
}

export function defaultProfile(): Profile {
  return {
    v: 1,
    bestClassic: 0,
    coins: 0,
    boosters: { ...ECONOMY.starterBoosters },
    settings: { sound: true, haptics: true, lang: null },
    stats: { games: 0, lines: 0, gems: 0 },
    daily: { lastCompleted: null, streak: 0, bestKey: null, best: 0 },
    noAds: false,
    tutorialDone: false,
    reward: { lastClaim: null, day: 0 },
    skins: { owned: ['classic'], active: 'classic' },
  };
}

const nat = (x: unknown, fallback: number) => (Number.isInteger(x) && (x as number) >= 0 ? (x as number) : fallback);
const bool = (x: unknown, fallback: boolean) => (typeof x === 'boolean' ? x : fallback);
const str = (x: unknown) => (typeof x === 'string' ? x : null);

/** Merge whatever was stored with defaults, field by field, so old or damaged saves never break the app. */
export function sanitizeProfile(raw: unknown): Profile {
  const d = defaultProfile();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<Profile>;
  const lang = r.settings?.lang;
  return {
    v: 1,
    bestClassic: nat(r.bestClassic, d.bestClassic),
    coins: nat(r.coins, d.coins),
    boosters: {
      rotate: nat(r.boosters?.rotate, d.boosters.rotate),
      hammer: nat(r.boosters?.hammer, d.boosters.hammer),
      reroll: nat(r.boosters?.reroll, d.boosters.reroll),
    },
    settings: {
      sound: bool(r.settings?.sound, true),
      haptics: bool(r.settings?.haptics, true),
      lang: lang === 'en' || lang === 'ru' || lang === 'uz' ? lang : null,
    },
    stats: {
      games: nat(r.stats?.games, 0),
      lines: nat(r.stats?.lines, 0),
      gems: nat(r.stats?.gems, 0),
    },
    daily: {
      lastCompleted: str(r.daily?.lastCompleted),
      streak: nat(r.daily?.streak, 0),
      bestKey: str(r.daily?.bestKey),
      best: nat(r.daily?.best, 0),
    },
    noAds: bool(r.noAds, false),
    tutorialDone: bool(r.tutorialDone, false),
    reward: {
      lastClaim: str(r.reward?.lastClaim),
      day: Math.min(REWARD_DAYS - 1, nat(r.reward?.day, 0)),
    },
    skins: sanitizeSkins(r.skins),
  };
}

function sanitizeSkins(raw: unknown): Profile['skins'] {
  const r = raw as Partial<Profile['skins']> | undefined;
  const valid = new Set(SKINS.map((s) => s.id));
  const owned = Array.isArray(r?.owned) ? r!.owned.filter((id) => typeof id === 'string' && valid.has(id)) : [];
  if (!owned.includes('classic')) owned.unshift('classic');
  const unique = [...new Set(owned)];
  const active = typeof r?.active === 'string' && unique.includes(r.active) ? r.active : 'classic';
  return { owned: unique, active };
}

// ------------------------------------------------------------------ daily reward calendar

export const REWARD_DAYS = 7;

export interface Reward {
  coins?: number;
  rotate?: number;
  hammer?: number;
  reroll?: number;
}

/** 7-day cycle; day 7 is the big one. Missing a day restarts the cycle from day 1. */
export const DAILY_REWARDS: readonly Reward[] = [
  { coins: 50 },
  { rotate: 1 },
  { coins: 100 },
  { hammer: 1 },
  { coins: 150 },
  { reroll: 1, rotate: 1 },
  { coins: 300, hammer: 1 },
];

export interface RewardState {
  canClaim: boolean;
  /** Index of the reward that can be claimed today, or -1. */
  today: number;
  /** How many cards of the current cycle are already claimed. */
  claimed: number;
}

export function rewardState(p: Profile, today: string): RewardState {
  const { lastClaim, day } = p.reward;
  if (lastClaim === today) return { canClaim: false, today: -1, claimed: day === 0 ? REWARD_DAYS : day };
  const idx = lastClaim === previousDateKey(today) ? day : 0;
  return { canClaim: true, today: idx, claimed: idx };
}

/** Grants today's reward (optionally multiplied, e.g. ×2 for a rewarded ad). Returns what was granted, or null. */
export function claimDailyReward(p: Profile, today: string, multiplier = 1): Reward | null {
  const st = rewardState(p, today);
  if (!st.canClaim) return null;
  const base = DAILY_REWARDS[st.today];
  const granted: Reward = {};
  for (const k of ['coins', 'rotate', 'hammer', 'reroll'] as const) {
    const v = base[k];
    if (!v) continue;
    granted[k] = v * multiplier;
    if (k === 'coins') p.coins += v * multiplier;
    else p.boosters[k] += v * multiplier;
  }
  p.reward = { lastClaim: today, day: (st.today + 1) % REWARD_DAYS };
  return granted;
}

/** Local calendar date as YYYY-MM-DD (the daily challenge follows the player's own day). */
export function dateKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function previousDateKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d - 1));
}

/** Update the daily streak after the target for `key` was reached. Returns the new streak. */
export function completeDaily(p: Profile, key: string): number {
  if (p.daily.lastCompleted === key) return p.daily.streak;
  p.daily.streak = p.daily.lastCompleted === previousDateKey(key) ? p.daily.streak + 1 : 1;
  p.daily.lastCompleted = key;
  return p.daily.streak;
}

/** Current streak as shown on the home screen (0 if the chain is already broken). */
export function liveDailyStreak(p: Profile, today: string): number {
  const last = p.daily.lastCompleted;
  return last === today || last === previousDateKey(today) ? p.daily.streak : 0;
}
