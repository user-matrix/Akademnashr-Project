import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { ADS } from '../config';
import { track } from './analytics';

export interface AdProvider {
  init(): Promise<void>;
  rewardedReady(): boolean;
  /** Resolves true only if the user earned the reward. Never rejects. */
  showRewarded(): Promise<boolean>;
  /** Resolves when the ad is closed (true) or could not be shown (false). Never rejects. */
  showInterstitial(): Promise<boolean>;
  privacyOptionsRequired(): boolean;
  showPrivacyOptions(): Promise<void>;
  setMuted(muted: boolean): void;
}

type AdMobModule = typeof import('@capacitor-community/admob');

/** Google Mobile Ads through @capacitor-community/admob, with UMP consent (GDPR) and iOS ATT. */
class AdMobProvider implements AdProvider {
  private m!: AdMobModule;
  private ids = Capacitor.getPlatform() === 'ios' ? ADS.ios : ADS.android;
  private canRequest = false;
  private privacyRequired = false;
  private ready = { interstitial: false, rewarded: false };
  private loading = { interstitial: false, rewarded: false };
  private retries = { interstitial: 0, rewarded: 0 };
  private showing = false;

  async init(): Promise<void> {
    this.m = await import('@capacitor-community/admob');
    const { AdMob, AdmobConsentStatus } = this.m;
    await AdMob.initialize({ initializeForTesting: ADS.testMode });
    try {
      let info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
        info = await AdMob.showConsentForm();
      }
      this.canRequest = info.canRequestAds;
      // The enum is not re-exported by the plugin entry point, so compare with its string value.
      this.privacyRequired = String(info.privacyOptionsRequirementStatus) === 'REQUIRED';
    } catch (e) {
      console.warn('[ads] consent flow failed', e);
      this.canRequest = true;
    }
    if (Capacitor.getPlatform() === 'ios') {
      try {
        const { status } = await AdMob.trackingAuthorizationStatus();
        if (status === 'notDetermined') await AdMob.requestTrackingAuthorization();
      } catch {
        /* ATT unavailable */
      }
    }
    if (this.canRequest) {
      void this.load('interstitial');
      void this.load('rewarded');
    }
  }

  private async load(kind: 'interstitial' | 'rewarded'): Promise<void> {
    if (!this.canRequest || this.ready[kind] || this.loading[kind]) return;
    this.loading[kind] = true;
    const { AdMob } = this.m;
    const opts = { adId: this.ids[kind], isTesting: ADS.testMode };
    try {
      if (kind === 'interstitial') await AdMob.prepareInterstitial(opts);
      else await AdMob.prepareRewardVideoAd(opts);
      this.ready[kind] = true;
      this.retries[kind] = 0;
    } catch (e) {
      this.ready[kind] = false;
      // Exponential back-off: 5s, 10s, 20s ... capped at 2 minutes.
      const delay = Math.min(120_000, 5_000 * 2 ** this.retries[kind]++);
      setTimeout(() => void this.load(kind), delay);
      track('ad_load_failed', { kind, error: String((e as Error)?.message ?? e) });
    } finally {
      this.loading[kind] = false;
    }
  }

  rewardedReady(): boolean {
    return this.ready.rewarded && !this.showing;
  }

  async showRewarded(): Promise<boolean> {
    if (!this.rewardedReady()) {
      void this.load('rewarded');
      return false;
    }
    const { AdMob, RewardAdPluginEvents } = this.m;
    this.ready.rewarded = false;
    this.showing = true;
    const handles: PluginListenerHandle[] = [];
    let rewarded = false;
    try {
      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (v: boolean) => {
          if (!settled) {
            settled = true;
            resolve(v);
          }
        };
        // NOTE: showRewardVideoAd() resolves ONLY when a reward is earned — never on a plain close —
        // so the outcome is driven by events. A short grace period after "Dismissed" catches a reward
        // callback that arrives after the close event on some devices.
        const setup = Promise.all([
          AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
            rewarded = true;
          }),
          AdMob.addListener(RewardAdPluginEvents.Dismissed, () => setTimeout(() => settle(rewarded), 300)),
          AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => settle(false)),
        ]);
        setup
          .then((hs) => {
            handles.push(...hs);
            AdMob.showRewardVideoAd()
              .then(() => {
                rewarded = true;
              })
              .catch(() => settle(false));
          })
          .catch(() => settle(false));
      });
    } finally {
      this.showing = false;
      handles.forEach((h) => void h.remove());
      void this.load('rewarded');
    }
  }

  async showInterstitial(): Promise<boolean> {
    if (!this.ready.interstitial || this.showing) {
      void this.load('interstitial');
      return false;
    }
    const { AdMob, InterstitialAdPluginEvents } = this.m;
    this.ready.interstitial = false;
    this.showing = true;
    const handles: PluginListenerHandle[] = [];
    try {
      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (v: boolean) => {
          if (!settled) {
            settled = true;
            resolve(v);
          }
        };
        Promise.all([
          AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => settle(true)),
          AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => settle(false)),
        ])
          .then((hs) => {
            handles.push(...hs);
            AdMob.showInterstitial().catch(() => settle(false));
          })
          .catch(() => settle(false));
      });
    } finally {
      this.showing = false;
      handles.forEach((h) => void h.remove());
      void this.load('interstitial');
    }
  }

  privacyOptionsRequired(): boolean {
    return this.privacyRequired;
  }

  async showPrivacyOptions(): Promise<void> {
    try {
      await this.m.AdMob.showPrivacyOptionsForm();
    } catch (e) {
      console.warn('[ads] privacy form failed', e);
    }
  }

  setMuted(muted: boolean): void {
    this.m?.AdMob.setApplicationMuted({ muted }).catch(() => {});
  }
}

/**
 * Browser stand-in used for development and the web build: shows a clearly-labelled fake ad
 * so every ad-gated flow (revive, ×2 coins, free boosters) can be tested without a device.
 */
class MockProvider implements AdProvider {
  async init(): Promise<void> {}
  rewardedReady(): boolean {
    return true;
  }
  showRewarded(): Promise<boolean> {
    return this.fake('Rewarded', 2);
  }
  showInterstitial(): Promise<boolean> {
    return this.fake('Interstitial', 1);
  }
  privacyOptionsRequired(): boolean {
    return false;
  }
  async showPrivacyOptions(): Promise<void> {}
  setMuted(): void {}

  private fake(label: string, seconds: number): Promise<boolean> {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'mock-ad';
      el.innerHTML = `<div><b>TEST AD</b><span>${label}</span><em>${seconds}</em></div>`;
      document.body.appendChild(el);
      const counter = el.querySelector('em')!;
      let left = seconds;
      const timer = setInterval(() => {
        left--;
        counter.textContent = String(left);
        if (left <= 0) {
          clearInterval(timer);
          el.remove();
          resolve(true);
        }
      }, 1000);
    });
  }
}

/** Frequency capping & business rules on top of a provider. */
export class AdManager {
  private provider: AdProvider = Capacitor.isNativePlatform() ? new AdMobProvider() : new MockProvider();
  private lastInterstitial = 0;
  private lastRewarded = 0;
  noAds = false;

  async init(): Promise<void> {
    try {
      await this.provider.init();
    } catch (e) {
      console.warn('[ads] init failed', e);
    }
  }

  rewardedReady(): boolean {
    return this.provider.rewardedReady();
  }

  async rewarded(placement: string): Promise<boolean> {
    track('rewarded_request', { placement });
    const ok = await this.provider.showRewarded();
    if (ok) {
      this.lastRewarded = Date.now();
      track('rewarded_complete', { placement });
    }
    return ok;
  }

  /** Called at natural breaks (after a game ends). Respects all caps; silently does nothing otherwise. */
  async maybeInterstitial(gamesPlayed: number): Promise<void> {
    if (this.noAds) return;
    const now = Date.now();
    const p = ADS.policy;
    if (gamesPlayed < p.firstInterstitialAfterGames) return;
    if (this.lastInterstitial && now - this.lastInterstitial < p.minIntervalMs) return;
    if (this.lastRewarded && now - this.lastRewarded < p.rewardedGraceMs) return;
    if (await this.provider.showInterstitial()) {
      this.lastInterstitial = Date.now();
      track('interstitial_shown', {});
    }
  }

  privacyOptionsRequired(): boolean {
    return this.provider.privacyOptionsRequired();
  }

  showPrivacyOptions(): Promise<void> {
    return this.provider.showPrivacyOptions();
  }

  setMuted(muted: boolean): void {
    this.provider.setMuted(muted);
  }
}
