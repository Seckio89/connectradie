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
      backgroundColor: '#1D9E75', // ConnecTradie green
      showSpinner: true,
      spinnerColor: '#FFFFFF',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1D9E75', // ConnecTradie green
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
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
    overScrollMode: 'never',
    backgroundColor: '#1D9E75', // ConnecTradie green
  },
};

export default config;
