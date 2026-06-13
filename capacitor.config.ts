import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.connectradie.app',
  appName: 'ConnecTradie',
  webDir: 'dist',
  server: {
    // Use the live URL in production — the app loads your deployed site
    // rather than bundled assets, so updates are instant (no app store review).
    // Comment this out and run `npm run build` to use bundled offline mode instead.
    url: 'https://connectradie.com',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f172a', // navy-900 to match sidebar
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f172a',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
    scheme: 'ConnecTradie',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
