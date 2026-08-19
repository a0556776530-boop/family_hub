import type { CapacitorConfig } from '@capacitor/cli';

// appId is a placeholder — confirm the real reverse-domain identifier before any
// Play Store / App Store submission, since it is effectively impossible to change later.
const config: CapacitorConfig = {
  appId: 'app.familyhub.mobile',
  appName: 'Family Hub',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // When building the APK in CI, load the live site instead of bundled assets
    // so the APK never goes stale — set CAPACITOR_LIVE_URL in GitHub Actions.
    ...(process.env.CAPACITOR_LIVE_URL ? { url: process.env.CAPACITOR_LIVE_URL } : {}),
  },
  android: {
    // Without this, Android silently stops delivering location updates to the
    // WebView ~5 minutes after the app is backgrounded.
    // See https://github.com/capacitor-community/background-geolocation/issues/89
    useLegacyBridge: true,
  },
};

export default config;
