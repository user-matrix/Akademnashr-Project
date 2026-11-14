// Applies the native settings AdMob + the game need. Safe to run any number of times.
//   Android: AdMob APPLICATION_ID meta-data, portrait lock.
//   iOS:     GADApplicationIdentifier, ATT prompt text, SKAdNetwork ids, portrait lock, export-compliance flag.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(root, 'native.config.json'), 'utf8'));

// Google's own SKAdNetwork id is mandatory; add mediation partners' ids here if you add mediation later.
const SKAD_IDS = ['cstr6suwn9.skadnetwork'];

function patchAndroid() {
  const file = join(root, 'android/app/src/main/AndroidManifest.xml');
  if (!existsSync(file)) return console.log('android: not added yet (npx cap add android) — skipped');
  let xml = readFileSync(file, 'utf8');
  const meta = `<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${cfg.admobAppIdAndroid}" />`;
  const metaRe = /<meta-data\s+android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"[^>]*\/>/;
  const existing = xml.match(metaRe);
  if (existing) {
    // Only rewrite when the value differs, so re-runs don't churn formatting in git.
    if (!existing[0].includes(`"${cfg.admobAppIdAndroid}"`)) xml = xml.replace(metaRe, meta);
  } else xml = xml.replace(/(<application[^>]*>)/, `$1\n\n        ${meta}`);
  if (!/android:screenOrientation=/.test(xml)) {
    xml = xml.replace(/android:name="\.MainActivity"/, 'android:name=".MainActivity"\n            android:screenOrientation="portrait"');
  }
  writeFileSync(file, xml);
  console.log('android: AndroidManifest.xml updated');
}

function setPlistKey(xml, key, valueXml) {
  const re = new RegExp(`<key>${key}</key>\\s*(?:<string>[^<]*</string>|<true\\s*/>|<false\\s*/>|<array>[\\s\\S]*?</array>)`);
  const entry = `<key>${key}</key>\n\t${valueXml}`;
  if (re.test(xml)) return xml.replace(re, entry);
  const idx = xml.lastIndexOf('</dict>');
  return `${xml.slice(0, idx)}\t${entry}\n${xml.slice(idx)}`;
}

function patchIos() {
  const file = join(root, 'ios/App/App/Info.plist');
  if (!existsSync(file)) return console.log('ios: not added yet (npx cap add ios) — skipped');
  let xml = readFileSync(file, 'utf8');
  xml = setPlistKey(xml, 'GADApplicationIdentifier', `<string>${cfg.admobAppIdIos}</string>`);
  xml = setPlistKey(xml, 'NSUserTrackingUsageDescription', `<string>${cfg.trackingDescription}</string>`);
  const items = SKAD_IDS.map((id) => `\t\t<dict>\n\t\t\t<key>SKAdNetworkIdentifier</key>\n\t\t\t<string>${id}</string>\n\t\t</dict>`).join('\n');
  xml = setPlistKey(xml, 'SKAdNetworkItems', `<array>\n${items}\n\t</array>`);
  xml = setPlistKey(xml, 'ITSAppUsesNonExemptEncryption', '<false/>');
  xml = setPlistKey(xml, 'UIRequiresFullScreen', '<true/>');
  xml = setPlistKey(xml, 'UISupportedInterfaceOrientations', '<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>');
  xml = setPlistKey(
    xml,
    'UISupportedInterfaceOrientations~ipad',
    '<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t\t<string>UIInterfaceOrientationPortraitUpsideDown</string>\n\t</array>',
  );
  writeFileSync(file, xml);
  console.log('ios: Info.plist updated');
}

patchAndroid();
patchIos();
