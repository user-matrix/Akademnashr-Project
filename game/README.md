# Block Nova

8×8 taxtali, rang-barang blokli boshqotirma o'yini. Block-puzzle janrida, lekin o'zining mexanikalari bor: **FEVER rejimi, bomba bloklar, olmoslar, "bir xil rang" bonusi, bonuslar (burish / bolg'a / almashtirish) va kunlik sinov**.

- O'yin dizayni: [docs/GDD.md](docs/GDD.md)
- Do'konlarga chiqarish qo'llanmasi: [docs/RELEASE.md](docs/RELEASE.md)
- Maxfiylik siyosati shabloni: [docs/privacy-policy.md](docs/privacy-policy.md)

## Texnologiyalar

| Qatlam | Tanlov | Nega |
|---|---|---|
| Til | TypeScript (strict) | Xatolarni kompilyatsiya paytida ushlaydi |
| Grafika | HTML5 Canvas 2D + sprite kesh | Tez, kichik hajm, tashqi engine yo'q |
| Build | Vite | Bir zumda build, ~27 KB gzip JS |
| Mobil | Capacitor 8 | Bitta kod → Android + iOS (+ Web) |
| Reklama | `@capacitor-community/admob` | AdMob + UMP (GDPR) + iOS ATT |
| Test | Vitest | O'yin mantig'i to'liq test bilan qoplangan |

## Buyruqlar

```bash
npm install          # bog'liqliklarni o'rnatish
npm run dev          # brauzerda ishlab chiqish (http://localhost:5173)
npm test             # unit testlar
npm run build        # typecheck + production build (dist/)
npm run balance      # 200 ta bot o'yini → ochko/davomiylik statistikasi (balans uchun)

npm run cap:sync     # build + native loyihalarga ko'chirish + AdMob sozlamalari
npx cap open android # Android Studio'da ochish
npx cap open ios     # Xcode'da ochish (faqat macOS)
```

Brauzerda reklama o'rniga **"TEST AD"** soxta oynasi chiqadi, shuning uchun barcha reklama oqimlarini (ikkinchi imkoniyat, ×2 tanga, bepul bonus) qurilmasiz tekshirish mumkin.

## Loyiha tuzilishi

```
src/
  config.ts            ← BARCHA balans raqamlari, reklama ID'lari, iqtisod (tuning shu yerda)
  core/                ← Sof o'yin mantig'i (DOM'siz, to'liq testlangan)
    game.ts            holat, joylash, tozalash, bomba zanjiri, ochko, saqlash/tiklash
    generator.ts       adolatli blok generatori (yechiladigan to'plam kafolati, "yordam qo'li")
    masks.ts           bitboard amallari (tez joylash tekshiruvi, look-ahead qidiruv)
    shapes.ts          figuralar va ularning barcha burilishlari
    rng.ts             seed'li tasodifiy son generatori (kunlik sinov hamma uchun bir xil)
  render/              ← Canvas chizish: sprite kesh, effektlar, zarrachalar
  input.ts             ← Sensor/sichqoncha: sudrash, burish, bolg'a
  services/            ← Reklama, saqlash, tovush, vibratsiya, 8 til (en/es/ru/uz/ar/zh/ja/ko), analitika
  ui/app.ts            ← Ekranlar va o'yin oqimi
tests/                 ← Vitest testlari
android/, ios/         ← Capacitor native loyihalari (git'da saqlanadi)
assets/                ← Ikonka va splash manbalari (1024px / 2732px)
scripts/native-config.mjs ← AdMob App ID, portret rejimi va boshqalarni native fayllarga yozadi
native.config.json     ← AdMob APP ID'lari (native)
```

## Tillar

O'yin 8 tilda ishlaydi: ingliz, ispan, rus, o'zbek, arab, xitoy (soddalashtirilgan), yapon, koreys. Til birinchi ishga tushishda telefon tilidan avtomatik tanlanadi va Sozlamalar'da o'zgartiriladi.

Yangi matn qo'shish: `src/services/i18n.ts` dagi `en` lug'atiga kalit qo'shing. TypeScript qolgan 7 tilda ham shu kalit bo'lishini talab qiladi, `tests/i18n.test.ts` esa `{n}` kabi o'rin belgilarini tekshiradi. Yangi til qo'shilsa, `scripts/native-config.mjs → IOS_LOCALIZATIONS` ro'yxatini ham yangilang.

**Arab tili (RTL):** arab tili tanlanganda `<html dir="rtl">` qo'yiladi va interfeys ko'zgudek aylanadi. O'yin taxtasi aylanmaydi. CSS'da `left`/`right` o'rniga mantiqiy xossalardan foydalaning (`inset-inline-start`, `text-align: start`). Raqamlar RTL ichida ham chapdan o'ngga o'qiladi: minglik ajratkich U+202F, `×2` kabi ko'paytiruvchilar esa arab matnida U+2066…U+2069 izolyatorlari ichida turadi.

## Muhim qoidalar

1. **`ADS.testMode` (src/config.ts) faqat release build'da `false` bo'ladi.** Ishlab chiqishda haqiqiy reklama ko'rsatish yoki o'z reklamangizni bosish AdMob akkauntining bloklanishiga olib keladi.
2. **`appId` (capacitor.config.ts) do'konga chiqqandan keyin o'zgarmaydi.** Birinchi nashrdan oldin yakuniy qiymatni tanlang (batafsil: RELEASE.md).
3. Ikonka/splash'ni yangilash: `assets/` dagi PNG'larni almashtiring va quyidagini ishga tushiring:
   ```bash
   npx @capacitor/assets@3 generate --android --ios --iconBackgroundColor '#0d1030' --splashBackgroundColor '#0d1030'
   ```
