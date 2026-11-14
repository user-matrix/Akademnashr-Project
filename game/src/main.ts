import { Capacitor } from '@capacitor/core';
import './style.css';
import { initHaptics } from './services/haptics';
import { initStorage } from './services/storage';
import { App } from './ui/app';

async function boot(): Promise<void> {
  await initStorage();
  void initHaptics();
  const app = new App();
  await app.init();

  if (Capacitor.isNativePlatform()) {
    const [{ App: CapApp }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
      import('@capacitor/app'),
      import('@capacitor/splash-screen'),
      import('@capacitor/status-bar'),
    ]);
    void CapApp.addListener('backButton', () => {
      if (!app.onBack()) void CapApp.exitApp();
    });
    void CapApp.addListener('appStateChange', ({ isActive }) => (isActive ? app.onResume() : app.onPause()));
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    if (Capacitor.getPlatform() === 'android') StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    SplashScreen.hide().catch(() => {});
  } else {
    document.addEventListener('visibilitychange', () => (document.hidden ? app.onPause() : app.onResume()));
    if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
  }
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML(
    'beforeend',
    '<div style="position:fixed;inset:0;display:grid;place-items:center;color:#fff;font:600 16px system-ui">Something went wrong. Please restart the app.</div>',
  );
});
