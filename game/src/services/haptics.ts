import { Capacitor } from '@capacitor/core';

type HapticsModule = typeof import('@capacitor/haptics');

let mod: HapticsModule | null = null;
let enabled = true;

export async function initHaptics(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    mod = await import('@capacitor/haptics');
  } catch {
    mod = null;
  }
}

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

function vibrate(ms: number): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}

export function haptic(kind: 'light' | 'medium' | 'heavy' | 'success'): void {
  if (!enabled) return;
  if (mod) {
    const { Haptics, ImpactStyle, NotificationType } = mod;
    const p =
      kind === 'success'
        ? Haptics.notification({ type: NotificationType.Success })
        : Haptics.impact({ style: kind === 'light' ? ImpactStyle.Light : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy });
    p.catch(() => {});
    return;
  }
  vibrate(kind === 'light' ? 8 : kind === 'medium' ? 18 : 30);
}
