declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

const GA_EVENTS = {
  SIGN_UP: 'sign_up',
  LOGIN: 'login',
  PURCHASE: 'purchase',
  SEARCH: 'search',
  BEGIN_CHECKOUT: 'begin_checkout',
} as const;

type GAEventName = (typeof GA_EVENTS)[keyof typeof GA_EVENTS] | (string & {});

let initialized = false;

export function initAnalytics(): void {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (!measurementId || initialized) return;

  // Initialize dataLayer and gtag function
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false });

  // Dynamically load the gtag.js script
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  initialized = true;
}

export function trackPageView(path: string, title?: string): void {
  if (!initialized) return;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title ?? document.title,
  });
}

export function trackEvent(name: GAEventName, params?: Record<string, unknown>): void {
  if (!initialized) return;
  window.gtag('event', name, params);
}

export { GA_EVENTS };
