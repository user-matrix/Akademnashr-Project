/**
 * Analytics seam. Every meaningful event already flows through `track`, so plugging in
 * Firebase Analytics / GameAnalytics later is a one-file change.
 */
type Params = Record<string, string | number | boolean>;

export function track(event: string, params: Params = {}): void {
  if (import.meta.env.DEV) console.debug('[track]', event, params);
}
