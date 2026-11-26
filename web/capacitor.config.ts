import type { CapacitorConfig } from '@capacitor/cli';

// GODAgent Android wrapper. The standalone (serverless) web build is bundled
// into the APK and served from Capacitor's local origin, so the app runs fully
// offline with no server.
const config: CapacitorConfig = {
  appId: 'com.godagent.app',
  appName: 'GODAgent',
  webDir: 'dist-standalone',
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
