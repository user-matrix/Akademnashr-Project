# Block Nova — O'yin dizayni hujjati (GDD)

> Ishchi nom: **Block Nova**. Yakuniy nomni do'konlarda va savdo belgilari bazasida tekshirib tanlang (RELEASE.md, 0-qadam).

## 1. Konsepsiya

Janr: **block puzzle** (casual, bir qo'lda, oflayn). Auditoriya: 18–55 yosh, ayniqsa qisqa tanaffuslarda o'ynaydiganlar.
Asosiy va'da: *"Oddiy o'ynaladi, lekin har yurishda kichik portlash va mukofot bor."*

Janrning yetakchilari (Block Blast va boshqalar) juda sodda: bloklarni qo'y, qatorni tozala. Biz shu oddiylikni saqlab, **qaror qabul qilishni chuqurlashtiradigan va "wow" lahzalarni ko'paytiradigan** qatlamlar qo'shdik:

| Yangilik | Nima beradi |
|---|---|
| **FEVER rejimi** | 4 ta ketma-ket tozalashda taxta yonadi, barcha ochkolar ×2. O'yinchi seriyani saqlash uchun rejalashtiradi. |
| **Bir xil rang bonusi** | 8 katagi bir rangdagi qator/ustun = +50. Ranglar endi faqat bezak emas, strategiya. |
| **Bomba bloklar** | Bomba turgan qator tozalansa, 3×3 maydon portlaydi, boshqa bombalarni ham zanjir bilan portlatadi. |
| **Olmoslar** | Tozalanganda tanga beradi. Bu bonuslarni sotib olish iqtisodini yuritadi. |
| **Bonuslar** | Burish (janrda odatda yo'q!), Bolg'a (3×3 buzish), Almashtirish (yangi to'plam). |
| **Kunlik sinov** | Hamma uchun bir xil bloklar ketma-ketligi va maqsad ochkosi. Ketma-ket kunlar (streak) qaytib kelishga undaydi. |
| **Ikkinchi imkoniyat** | Joy qolmaganda eng tirband 4×4 maydon tozalanadi va yechiladigan bloklar beriladi (reklama evaziga). |

## 2. Asosiy sikl (core loop)

```
3 ta blok olinadi → taxtaga sudrab qo'yiladi → to'lgan qator/ustunlar tozalanadi
      ↑                                                     ↓
yangi 3 ta blok  ←  hammasi qo'yilgach      ochko, kombo, FEVER, tanga
      ↓
joy qolmasa → ikkinchi imkoniyat (reklama) / bonus / o'yin tugadi → tangalar → bonuslar
```

## 3. Qoidalar

- Taxta 8×8. Har safar 3 ta blok beriladi; uchalasi ham qo'yilgach yangisi keladi.
- Bloklarni burib bo'lmaydi (faqat **Burish** bonusi bilan).
- To'lgan qator va ustunlar **bir vaqtda** tozalanadi (kesishgan katak ikki marta hisoblanmaydi).
- Hech bir blok sig'masa, o'yin tugaydi (agar ikkinchi imkoniyat yoki bonus ishlatilmasa).

## 4. Ochko tizimi (`src/config.ts → SCORING`)

| Hodisa | Ochko |
|---|---|
| Qo'yilgan har bir katak | +1 |
| L ta qator bir yurishda | 10 · L·(L+1)/2 → 10, 30, 60, 100, 150… |
| Bir xil rangli qator | +50 (har biri) |
| Bomba buzgan qo'shimcha katak | +3 |
| Taxta butunlay tozalandi | +300 |
| **Kombo ko'paytiruvchi** | 1 + 0,5·(seriya−1), maksimum ×5 |
| **FEVER** (seriya ≥ 4) | yana ×2 |

Seriya (streak) tozalashsiz **3 ta yurish**ga chidaydi, keyin nolga tushadi.

## 5. Adolatli generator (`src/core/generator.ts`)

Janrdagi eng katta shikoyat: *"o'yin ataylab sig'maydigan blok beradi"*. Bizning generator:

1. **Yechiladigan to'plam kafolati.** O'yin boshida har bir 3 talik to'plam qandaydir tartibda albatta joylashadi (look-ahead qidiruv, tozalashlarni ham hisobga oladi). Qiyinlik oshgani sari bu kafolat 100% dan 55% gacha kamayadi, shunda o'yin cheksiz davom etmaydi.
2. **"Yordam qo'li".** Ko'pincha (50% → 20%) to'plamda darhol qator yopadigan blok bo'ladi.
3. **Rahm-shafqat.** Taxta 50% dan ko'p to'lsa, kichik bloklar ehtimoli oshadi.
4. **Qiyinlik egri chizig'i.** 0 → 7000 ochko oralig'ida katta bloklar ulushi 18% dan 38% gacha o'sadi.
5. **Determinizm.** Bir xil seed = bir xil bloklar. Kunlik sinov shunga asoslangan.

Simulyatsiya (`npm run balance`, oddiy bot): median ~1 200 ochko, ~53 yurish (3–4 daqiqa). Tirik o'yinchi sezilarli ko'proq ochko oladi.

## 6. Iqtisod (`ECONOMY`)

- Tanga manbalari: olmos (+3), o'yin oxirida ochko/200, reklama orqali ×2.
- Sarflash: Burish 60, Almashtirish 80, Bolg'a 100 tanga yoki **reklama ko'rib bepul**.
- Yangi o'yinchiga sovg'a: 2 burish, 1 bolg'a, 1 almashtirish (bonuslarni sinab ko'rishi uchun).

## 7. Monetizatsiya strategiyasi

Asosiy daromad: **rewarded video** (eng yuqori eCPM, o'yinchi o'zi tanlaydi, retention'ga zarar bermaydi).

| Joy | Format | Qoida |
|---|---|---|
| Joy qolmadi → Ikkinchi imkoniyat | Rewarded | Har o'yinda 1 marta |
| O'yin tugadi → ×2 tanga | Rewarded | Har o'yinda 1 marta |
| Bonus tugadi → Bepul olish | Rewarded | Cheksiz |
| Kunlik sovg'a → ×2 olish | Rewarded | Kuniga 1 marta |
| O'yin tugagach "Yana o'ynash"/"Bosh menyu" | Interstitial | Faqat 2-o'yindan keyin, kamida 120 soniya oraliq, rewarded ko'rilgan bo'lsa 60 soniya ichida ko'rsatilmaydi |

**Banner yo'q.** Banner eCPM'i past, o'yin maydonini kichraytiradi va tasodifiy bosishlar AdMob siyosatini buzish xavfini tug'diradi. Barcha chastota cheklovlari `src/config.ts → ADS.policy` da.

Keyingi bosqichlar: "Reklamasiz" xaridi (IAP), mediation (AppLovin MAX yoki LevelPlay) orqali eCPM'ni 20–40% oshirish.

## 8. Retention (qaytib kelish)

Hozir mavjud:
- kunlik sinov va streak, rekord, saqlangan o'yinni davom ettirish (ilova yopilsa ham), bonus inventari;
- **kunlik sovg'a**: 7 kunlik kalendar (50 → 300 tanga va bonuslar). Bir kun o'tkazib yuborilsa, 1-kundan boshlanadi. Har bir sovg'ani reklama ko'rib ×2 qilish mumkin. Oyna kuniga bir marta o'zi chiqadi, lekin birinchi o'yindan oldin chiqmaydi;
- **blok uslublari**: Klassik (bepul), Konfet (500), Neon (1000), Qirollik (2000 tanga). Bu tangalarga uzoq muddatli maqsad beradi va "×2 tanga" reklamasiga motivatsiya qiladi.

Keyingi bosqich: sarguzasht rejimi (darajalar va maqsadlar), reyting (Game Center / Play Games), push-eslatmalar.

## 9. KPI maqsadlari (soft launch)

| Ko'rsatkich | Maqsad |
|---|---|
| D1 retention | ≥ 40% |
| D7 retention | ≥ 15% |
| O'rtacha sessiya | 8–12 daqiqa |
| Rewarded / DAU | ≥ 2,5 |
| Interstitial / DAU | 2–4 |
| Crash-free sessiyalar | ≥ 99,5% |

## 10. Yo'l xaritasi

1. **MVP (tayyor):** klassik rejim, kunlik sinov, FEVER, bomba, olmos, 3 bonus, AdMob (UMP + ATT), 8 til (en, es, ru, uz, ar, zh, ja, ko; arab tili uchun RTL), ikonka va splash, testlar.
2. **Soft launch (1–2 hafta):** Firebase Analytics + Crashlytics, Remote Config (balansni qayta build'siz sozlash), haqiqiy qurilmalarda test, Play Console closed testing.
3. **v1.1:** kunlik sovg'a ✅, blok uslublari ✅, "Reklamasiz" xaridi, mediation.
4. **v1.2:** sarguzasht rejimi (100+ daraja), reytinglar, Telegram Mini App versiyasi (veb build tayyor).
