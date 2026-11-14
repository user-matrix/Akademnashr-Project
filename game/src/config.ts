// Central tuning file. All balance numbers live here so they can be tuned
// (or later driven by Remote Config) without touching game logic.

export const APP_NAME = 'Block Nova';
export const APP_VERSION = '0.2.0';

export const BOARD_SIZE = 8;

/** Number of distinct block colours (1..COLOR_COUNT). Fewer colours = "Perfect Colour" lines happen more often. */
export const COLOR_COUNT = 6;

export const SCORING = {
  perCell: 1,
  /** Points for clearing L lines at once = lineBase * L * (L + 1) / 2  → 10, 30, 60, 100, 150 ... */
  lineBase: 10,
  /** Bonus for a cleared line whose 8 cells are all the same colour. */
  monoLineBonus: 50,
  /** Points per extra cell destroyed by a bomb explosion. */
  bombCellPoints: 3,
  /** Bonus for emptying the whole board. */
  allClearBonus: 300,
  /** Combo multiplier = min(comboMax, 1 + comboStep * (streak - 1)). */
  comboStep: 0.5,
  comboMax: 5,
  /** A streak survives this many placements without a clear. */
  streakWindow: 3,
  /** Streak length that starts Fever mode. */
  feverStreak: 4,
  feverMultiplier: 2,
} as const;

export const SPECIALS = {
  bombChance: 0.05,
  gemChance: 0.09,
  /** Extra spawn chance while in Fever. */
  feverBonus: 0.06,
} as const;

export const ECONOMY = {
  coinsPerGem: 3,
  /** Coins awarded at game end = floor(score / scorePerCoin). */
  scorePerCoin: 200,
  boosterCost: { rotate: 60, hammer: 100, reroll: 80 },
  /** Boosters a brand-new player starts with. */
  starterBoosters: { rotate: 2, hammer: 1, reroll: 1 },
} as const;

export const DIFFICULTY = {
  /** Score at which difficulty reaches 1.0 in classic mode. */
  maxAtScore: 7000,
  /** Probability that a dealt set is guaranteed placeable, from easy → hard. */
  solvableChance: [1, 0.55] as const,
  /** Probability that one dealt piece can immediately complete a line. */
  helpChance: [0.5, 0.2] as const,
  /** Tier weights [small, medium, large] at difficulty 0 and 1. */
  tierWeightsEasy: [0.42, 0.4, 0.18] as const,
  tierWeightsHard: [0.22, 0.4, 0.38] as const,
} as const;

export const DAILY = {
  minTarget: 1200,
  maxTarget: 2600,
  step: 100,
} as const;

/**
 * Ad configuration.
 * The IDs below are Google's official TEST ad units — safe for development.
 * Replace them with your real AdMob unit IDs only for the release build.
 * Never click your own live ads: AdMob will suspend the account.
 */
export const ADS = {
  /** Keep true until the release build. Real ads in development = account ban risk. */
  testMode: true,
  android: {
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
  },
  ios: {
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
  },
  policy: {
    /** No interstitials until the player has finished this many games (protects first-session retention). */
    firstInterstitialAfterGames: 2,
    /** Minimum time between two interstitials. */
    minIntervalMs: 120_000,
    /** Skip the interstitial if the player watched a rewarded ad this recently. */
    rewardedGraceMs: 60_000,
  },
} as const;
