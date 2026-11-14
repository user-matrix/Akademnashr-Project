# Play Store va App Store'ga chiqarish qo'llanmasi

Qadamlarni tartib bilan bajaring. ⚠️ belgisi qaytarib bo'lmaydigan yoki akkauntni xavf ostiga qo'yadigan joylarni bildiradi.

---

## 0. Boshlashdan oldin hal qilinadigan narsalar

- [ ] **Yakuniy nom.** Google Play va App Store'da qidirib ko'ring, savdo belgilarini tekshiring (WIPO Global Brand Database). Mashhur o'yin nomiga o'xshash nom rad etilishga yoki shikoyatga sabab bo'ladi.
- [ ] ⚠️ **Application ID / Bundle ID.** `capacitor.config.ts → appId` (hozir vaqtincha `com.blocknova.puzzle`). Do'konga chiqqandan keyin **umuman o'zgartirib bo'lmaydi**. O'zingizga tegishli domen asosida tanlang, masalan `uz.sizningkompaniya.blocknova`.
  O'zgartirish tartibi (hali nashr qilinmagan bo'lsa): `appId` ni yangilang → `rm -rf android ios` → `npx cap add android && npx cap add ios` → `npm run native:config` → ikonkalarni qayta yarating (README).
- [ ] **Maxfiylik siyosati URL'i.** Ikkala do'kon ham talab qiladi. Shablon: [privacy-policy.md](privacy-policy.md). Uni istalgan ochiq sahifaga joylang (GitHub Pages, Netlify, o'z saytingiz).
- [ ] **Developer veb-sayt.** AdMob `app-ads.txt` uchun kerak (6-qadam). Oddiy bitta sahifa yetarli.

## 1. Akkauntlar

| Akkaunt | Narx | Izoh |
|---|---|---|
| Google Play Console | $25 bir marta | Shaxsiy yoki tashkilot. Tashkilot akkaunti uchun D-U-N-S raqami kerak, lekin 12 testerlik qoidadan ozod |
| Apple Developer Program | $99 / yil | iOS build uchun **Mac + Xcode** kerak (yoki bulutli CI: Codemagic, GitHub Actions macOS) |
| Google AdMob | bepul | To'lov ma'lumotlari va soliq shakli kerak bo'ladi |

## 2. AdMob sozlash

1. AdMob → **Apps → Add app**: Android va iOS uchun **alohida** ilova qo'shing (do'konga chiqmaguncha "not listed" deb).
2. Har bir ilovada 2 tadan **Ad unit** yarating: **Interstitial** va **Rewarded**.
3. ID'larni joylashtiring:
   - Ad unit ID'lar (`ca-app-pub-XXX/YYY`) → `src/config.ts → ADS.android / ADS.ios`
   - App ID'lar (`ca-app-pub-XXX~ZZZ`) → `native.config.json`, keyin `npm run native:config`
4. **Privacy & messaging** bo'limi:
   - **GDPR (European regulations)** xabarini yarating va nashr qiling. Kod uni avtomatik ko'rsatadi (UMP).
   - iOS uchun **IDFA explainer** xabarini yoqing.
5. ⚠️ Haqiqiy ID'lar bilan test qilganda o'z telefoningizni **test device** sifatida qo'shing (AdMob → Settings → Test devices). **Hech qachon o'z reklamangizni bosmang**, aks holda akkaunt bloklanadi.

## 3. Release build'ga tayyorgarlik (har bir versiya uchun)

- [ ] `src/config.ts → ADS.testMode = false`
- [ ] Haqiqiy ad unit ID'lar `src/config.ts` da, haqiqiy App ID'lar `native.config.json` da
- [ ] `src/config.ts → APP_VERSION` va `package.json → version` yangilangan
- [ ] `npm test` va `npm run build` xatosiz o'tadi
- [ ] `npm run cap:sync`
- [ ] Haqiqiy qurilmada tekshirildi: o'yin, ikkinchi imkoniyat, ×2 tanga, bepul bonus, interstitial, ilovani yopib ochganda o'yin davom etishi, Android "orqaga" tugmasi

## 4. Android (Google Play)

### 4.1. Build
1. Android Studio o'rnating. `npx cap open android`
2. Versiya: `android/app/build.gradle` → `versionCode` (har yuklashda +1) va `versionName` (masalan `1.0.0`).
3. ⚠️ **Upload keystore:** *Build → Generate Signed App Bundle → Create new*. `.jks` fayl va parollarni **kamida 2 joyda zaxiralang**. Yo'qolsa, yangilanish chiqarish qiyinlashadi. Keystore'ni **git'ga qo'shmang**.
4. **Android App Bundle (.aab)** yarating (APK emas).

### 4.2. Play Console
1. **Create app** → nom, til, "Game", "Free".
2. **Play App Signing** ni yoqing (standart).
3. **App content** bo'limi:
   - Privacy policy URL
   - **Ads:** "Yes, my app contains ads"
   - **Content rating:** IARC so'rovnomasi (zo'ravonlik yo'q, natija odatda "Everyone / 3+")
   - **Target audience:** **13+** tanlang. "Bolalar" tanlansa, Families siyosati qo'shimcha cheklovlar qo'yadi va bolalar uchun sertifikatlangan reklama talab qilinadi.
   - **Data safety:** AdMob SDK quyidagilarni yig'adi va reklama maqsadida uzatadi: *Device or other IDs* (reklama ID), *Approximate location* (IP orqali), *App interactions*, *Diagnostics*. O'yinning o'zi shaxsiy ma'lumot yig'maydi (hamma narsa qurilmada). Shakl to'ldirishdan oldin Google'ning "AdMob data disclosure" sahifasini tekshiring.
4. **Store listing:** sarlavha (≤30 belgi), qisqa tavsif (≤80), to'liq tavsif (≤4000), ikonka 512×512, feature graphic 1024×500, kamida 4 ta telefon skrinshoti. Tavsifni en/ru/uz tillarida qo'shing.
5. ⚠️ **Yangi shaxsiy akkauntlar uchun:** production'ga chiqishdan oldin **closed testing** bo'lishi shart: **kamida 12 tester, uzluksiz 14 kun**. Testerlarni oldindan tayyorlang (do'stlar, oila, Telegram guruh). Testerlar ilovani haqiqatan ishlatishi kerak.
6. 14 kundan keyin: **Apply for production** → Production release.

## 5. iOS (App Store)

1. Mac'da: `npm install && npm run cap:sync && npx cap open ios`
2. Xcode → *Signing & Capabilities*: Team va Bundle Identifier (`appId` bilan bir xil).
3. **iPad:** ilova hozir iPad'ni ham qo'llab-quvvatlaydi, shuning uchun App Store iPad skrinshotlarini ham talab qiladi. Faqat iPhone kerak bo'lsa: *General → Supported Destinations* dan iPad'ni olib tashlang.
4. Versiya: *General → Version* (1.0.0) va *Build* (har yuklashda +1).
5. *Product → Archive → Distribute App → App Store Connect* → **TestFlight**'da sinab ko'ring.
6. App Store Connect:
   - **App Privacy:** AdMob uchun "Identifiers / Device ID", "Usage Data / Advertising Data", "Diagnostics" → *Used for Third-Party Advertising*, *Linked to user: No*, *Tracking: Yes* (ATT so'rovi borligi uchun)
   - Yosh reytingi so'rovnomasi, skrinshotlar (6,9" va 6,5" iPhone; iPad yoqilgan bo'lsa 13" iPad), Privacy policy URL
   - **Submit for Review** (odatda 1–3 kun)

`Info.plist` dagi `GADApplicationIdentifier`, `NSUserTrackingUsageDescription`, `SKAdNetworkItems` va eksport shifrlash bayrog'i `npm run native:config` orqali allaqachon qo'yilgan.

## 6. app-ads.txt (daromad uchun muhim)

AdMob → Apps → **app-ads.txt** satrini nusxalang va `https://sizning-saytingiz.uz/app-ads.txt` manziliga joylang. Shu saytni ikkala do'kondagi "Developer website" maydoniga yozing. Bu fayl bo'lmasa, reklama talabi va daromad sezilarli kamayadi.

## 7. Chiqarilgandan keyin

- Firebase Analytics + Crashlytics ulash (`src/services/analytics.ts` da tayyor joy bor)
- Birinchi 2 hafta: D1/D7 retention, rewarded/DAU, crash-free foizini kuzatish (GDD.md §9)
- ASO: kalit so'zlar, skrinshotlarni A/B test (Play Console → Store listing experiments)
- Balansni sozlash: `src/config.ts` (keyinchalik Firebase Remote Config orqali build'siz)
