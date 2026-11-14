import type { CapacitorConfig } from '@capacitor/cli';

// IMPORTANT: appId is permanent once the app is published on Google Play / App Store.
// Change it to your own reverse-domain id BEFORE running `npx cap add android|ios`.
const config: CapacitorConfig = {
  appId: 'com.blocknova.puzzle',
  appName: 'Block Nova',
  webDir: 'dist',
  backgroundColor: '#0d1030',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#0d1030',
      showSpinner: false,
    },
  },
};

export default config;
