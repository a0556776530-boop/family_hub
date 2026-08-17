import type { CapacitorConfig } from '@capacitor/cli';

// appId is a placeholder — confirm the real reverse-domain identifier before any
// Play Store / App Store submission, since it is effectively impossible to change later.
const config: CapacitorConfig = {
  appId: 'app.familyhub.mobile',
  appName: 'Family Hub',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    // Without this, Android silently stops delivering location updates to the
    // WebView ~5 minutes after the app is backgrounded.
    // See https://github.com/capacitor-community/background-geolocation/issues/89
    useLegacyBridge: true,
  },
};

export default config;
