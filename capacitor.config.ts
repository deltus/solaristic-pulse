import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'au.solaristic.pulse',
  appName: 'Solaristic Radar',
  webDir: 'dist',
  android: {
    // All content is bundled in the APK; no remote URLs are loaded.
    allowMixedContent: false
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_pulse',
      iconColor: '#07226F'
    }
  }
};

export default config;
