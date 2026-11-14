import { Capacitor } from '@capacitor/core';

/**
 * Key/value persistence.
 * Native: Capacitor Preferences (SharedPreferences / UserDefaults). WebView localStorage is NOT used on
 * native because iOS may purge it under storage pressure — players would lose progress.
 * Web: localStorage (wrapped: it throws in some private modes).
 */
interface Backend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const PREFIX = 'bn.';

const webBackend: Backend = {
  async get(key) {
    try {
      return localStorage.getItem(PREFIX + key);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, value);
    } catch {
      /* quota / private mode: ignore */
    }
  },
  async remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  },
};

let backend: Backend = webBackend;
/** Per-key write chains keep writes ordered (last write always wins). */
const chains = new Map<string, Promise<void>>();

export async function initStorage(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    backend = {
      get: async (key) => (await Preferences.get({ key: PREFIX + key })).value,
      set: (key, value) => Preferences.set({ key: PREFIX + key, value }),
      remove: (key) => Preferences.remove({ key: PREFIX + key }),
    };
  } catch (e) {
    console.warn('[storage] Preferences unavailable, falling back to localStorage', e);
  }
}

export async function loadJSON<T>(key: string): Promise<T | null> {
  await chains.get(key);
  const raw = await backend.get(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function enqueue(key: string, op: () => Promise<void>): void {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(op).catch((e) => console.warn('[storage] write failed', key, e));
  chains.set(key, next);
}

export function saveJSON(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  enqueue(key, () => backend.set(key, raw));
}

export function removeKey(key: string): void {
  enqueue(key, () => backend.remove(key));
}

/** Resolves when every pending write has reached the backend (call before the app is backgrounded). */
export async function flushStorage(): Promise<void> {
  await Promise.all([...chains.values()]);
}
