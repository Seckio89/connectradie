import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.connectradie.app',
  appName: 'ConnecTradie',
  webDir: 'dist',
  server: {
    // Use the live URL in production — the app loads your deployed site
    // rather than bundled assets, so updates are instant (no app store review).
    // Comment this out and run `npm run build` to use bundled offline mode instead.
    url: 'https://connectradie.com/login',
    cleartext: true,
    androidScheme: 'https',
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
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // Native Google Sign-In — Google blocks OAuth in embedded WebViews
    // (Error 403: disallowed_useragent). serverClientId MUST be the Web OAuth
    // client ID from Google Cloud Console and match GOOGLE_WEB_CLIENT_ID in
    // src/lib/nativeGoogleAuth.ts.
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '491568884460-unfmph1ckhu227ut9kh5b6cbgui028se.apps.googleusercontent.com',
      forceCodeForRefreshToken: false,
    },
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
    scheme: 'ConnecTradie',
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
    overScrollMode: 'never',
    backgroundColor: '#1D9E75', // ConnecTradie green
    // Force WebView to not cache
    appendUserAgent: 'ConnecTradie-App',
  },
};

export default config;
