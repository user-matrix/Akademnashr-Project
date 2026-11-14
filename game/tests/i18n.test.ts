import { afterAll, describe, expect, it } from 'vitest';
import { isRtl, LANG_NAMES, LANGS, setLang, STR_KEYS, t } from '../src/services/i18n';

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

describe('i18n', () => {
  afterAll(() => setLang('en'));

  it('every language is complete and keeps placeholders', () => {
    setLang('en');
    const reference = Object.fromEntries(STR_KEYS.map((k) => [k, placeholders(t(k))]));
    for (const lang of LANGS) {
      setLang(lang);
      for (const key of STR_KEYS) {
        const s = t(key);
        expect(s.trim(), `${lang}.${key}`).not.toBe('');
        expect(placeholders(s), `${lang}.${key}`).toBe(reference[key]);
      }
    }
  });

  it('substitutes variables and names every language', () => {
    setLang('ko');
    expect(t('day', { n: 3 })).toBe('3일차');
    setLang('es');
    expect(t('combo', { n: 4 })).toBe('Combo ×4');
    for (const l of LANGS) expect(LANG_NAMES[l]).toBeTruthy();
    setLang('ar');
    expect(t('day', { n: 3 })).toBe('اليوم 3');
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('en')).toBe(false);
    expect(new Set(LANGS).size).toBe(8);
  });
});
