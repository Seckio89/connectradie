import { useEffect } from 'react';

// Per-page SEO tags, written straight into <head>.
//
// This used to render react-helmet-async's <Helmet>, which never committed a
// single tag in this app — provider correctly mounted, no errors, zero
// [data-rh] elements in dev AND production builds (verified 2026-08-01, audit
// finding #19). Every page silently served index.html's homepage description,
// OG tags and — worst — a canonical of "/", telling search engines every page
// was the homepage. The library is gone; a direct effect is observable and
// cannot half-work.
//
// Deliberately NOT managed here: document.title. RouteTracker in App.tsx is
// the single source of truth for titles and covers every route, not just the
// pages that render <SEO>. `title` is still taken as a prop because the
// og:title/twitter:title tags want the page-specific name.

const SITE_URL = 'https://connectradie.com';
const SITE_NAME = 'ConnecTradie';
const DEFAULT_IMAGE = '/hero-group.png';

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  ogType?: string;
  ogImage?: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

type TagKey = { attr: 'name' | 'property'; value: string };

// index.html ships homepage defaults for most of these. Capture whatever is in
// the document the first time we touch a tag, so unmounting (navigating to a
// page without <SEO>) restores the shipped default instead of leaking the last
// page's description onto the dashboard.
const originals = new Map<string, string | null>();

function upsert(sel: string, create: () => HTMLElement, apply: (el: HTMLElement) => void, original: (el: HTMLElement) => string | null) {
  let el = document.head.querySelector<HTMLElement>(sel);
  if (!originals.has(sel)) originals.set(sel, el ? original(el) : null);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  apply(el);
}

function restore(sel: string, apply: (el: HTMLElement, orig: string) => void) {
  const el = document.head.querySelector<HTMLElement>(sel);
  if (!el) return;
  const orig = originals.get(sel);
  if (orig == null) el.remove();
  else apply(el, orig);
}

function setMeta(key: TagKey, content: string) {
  const sel = `meta[${key.attr}="${key.value}"]`;
  upsert(
    sel,
    () => {
      const m = document.createElement('meta');
      m.setAttribute(key.attr, key.value);
      return m;
    },
    (el) => el.setAttribute('content', content),
    (el) => el.getAttribute('content'),
  );
}

function restoreMeta(key: TagKey) {
  restore(`meta[${key.attr}="${key.value}"]`, (el, orig) => el.setAttribute('content', orig));
}

export default function SEO({
  title,
  description,
  canonical,
  ogType = 'website',
  ogImage,
  noindex = false,
  jsonLd,
}: SEOProps) {
  const fullTitle = `${title} | ${SITE_NAME}`;
  const canonicalUrl = canonical ? `${SITE_URL}${canonical}` : undefined;
  const imageUrl = ogImage
    ? ogImage.startsWith('http') ? ogImage : `${SITE_URL}${ogImage}`
    : `${SITE_URL}${DEFAULT_IMAGE}`;
  const jsonLdText = jsonLd ? JSON.stringify(jsonLd) : undefined;

  useEffect(() => {
    setMeta({ attr: 'name', value: 'description' }, description);
    setMeta({ attr: 'property', value: 'og:type' }, ogType);
    setMeta({ attr: 'property', value: 'og:title' }, fullTitle);
    setMeta({ attr: 'property', value: 'og:description' }, description);
    setMeta({ attr: 'property', value: 'og:image' }, imageUrl);
    setMeta({ attr: 'name', value: 'twitter:title' }, fullTitle);
    setMeta({ attr: 'name', value: 'twitter:description' }, description);
    setMeta({ attr: 'name', value: 'twitter:image' }, imageUrl);
    if (noindex) setMeta({ attr: 'name', value: 'robots' }, 'noindex,nofollow');

    // og:url and canonical only when the page declares one — a wrong canonical
    // is worse than none, which is exactly the bug this file replaces.
    if (canonicalUrl) {
      setMeta({ attr: 'property', value: 'og:url' }, canonicalUrl);
      upsert(
        'link[rel="canonical"]',
        () => {
          const l = document.createElement('link');
          l.setAttribute('rel', 'canonical');
          return l;
        },
        (el) => el.setAttribute('href', canonicalUrl),
        (el) => el.getAttribute('href'),
      );
    }

    let script: HTMLScriptElement | undefined;
    if (jsonLdText) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo', '1');
      script.textContent = jsonLdText;
      document.head.appendChild(script);
    }

    return () => {
      restoreMeta({ attr: 'name', value: 'description' });
      restoreMeta({ attr: 'property', value: 'og:type' });
      restoreMeta({ attr: 'property', value: 'og:title' });
      restoreMeta({ attr: 'property', value: 'og:description' });
      restoreMeta({ attr: 'property', value: 'og:image' });
      restoreMeta({ attr: 'name', value: 'twitter:title' });
      restoreMeta({ attr: 'name', value: 'twitter:description' });
      restoreMeta({ attr: 'name', value: 'twitter:image' });
      if (noindex) restoreMeta({ attr: 'name', value: 'robots' });
      if (canonicalUrl) {
        restoreMeta({ attr: 'property', value: 'og:url' });
        restore('link[rel="canonical"]', (el, orig) => el.setAttribute('href', orig));
      }
      script?.remove();
    };
  }, [fullTitle, description, canonicalUrl, ogType, imageUrl, noindex, jsonLdText]);

  return null;
}
