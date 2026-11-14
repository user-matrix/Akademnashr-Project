import type { StrKey } from '../services/i18n';

export type SkinStyle = 'gloss' | 'candy' | 'neon' | 'royal';

export interface Skin {
  id: string;
  name: StrKey;
  /** Coin price; 0 = owned by everyone. */
  price: number;
  style: SkinStyle;
  /** Index = colour id (0 unused). Gameplay never depends on these values. */
  colors: readonly string[];
}

export const SKINS: readonly Skin[] = [
  {
    id: 'classic',
    name: 'skinClassic',
    price: 0,
    style: 'gloss',
    colors: ['#000000', '#ff5a6e', '#ff9a3c', '#ffd23f', '#36d982', '#3cc7ff', '#9b6bff'],
  },
  {
    id: 'candy',
    name: 'skinCandy',
    price: 500,
    style: 'candy',
    colors: ['#000000', '#ff8fab', '#ffb38a', '#ffe58a', '#9be7a8', '#8fd3ff', '#c3a6ff'],
  },
  {
    id: 'neon',
    name: 'skinNeon',
    price: 1000,
    style: 'neon',
    colors: ['#000000', '#ff2e63', '#ff9f1c', '#f9f871', '#08f7a0', '#00e5ff', '#b967ff'],
  },
  {
    id: 'royal',
    name: 'skinRoyal',
    price: 2000,
    style: 'royal',
    colors: ['#000000', '#d1495b', '#edae49', '#f4d35e', '#3a9d76', '#2e86ab', '#7b4fa0'],
  },
];

export const DEFAULT_SKIN = SKINS[0];

export function skinById(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? DEFAULT_SKIN;
}
