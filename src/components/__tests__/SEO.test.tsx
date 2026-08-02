import { render } from '@testing-library/react';
import SEO from '../SEO';

// Regression insurance for audit finding #19: react-helmet-async committed
// nothing, so every page served index.html's homepage description, OG tags and
// canonical. These tests read the real <head>, which is the only place the
// answer lives — a mount that "renders fine" is exactly what the old bug did.

// The defaults index.html actually ships (kept in sync with index.html's head).
const INDEX_HTML_DEFAULTS = `
  <title>Find Licensed Tradies Near You | ConnecTradie — Payment Protected</title>
  <meta name="description" content="Book trusted, ABN-verified tradies in Australia." />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Find Licensed Tradies Near You | ConnecTradie — Payment Protected" />
  <meta property="og:description" content="Book trusted, ABN-verified tradies in Australia." />
  <meta property="og:site_name" content="ConnecTradie" />
  <meta property="og:url" content="https://connectradie.com" />
  <meta property="og:image" content="https://connectradie.com/hero-group.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Find Licensed Tradies Near You | ConnecTradie — Payment Protected" />
  <meta name="twitter:description" content="Book trusted, ABN-verified tradies in Australia." />
  <meta name="twitter:image" content="https://connectradie.com/hero-group.png" />
  <link rel="canonical" href="https://connectradie.com/" />
`;

const DEFAULT_DESCRIPTION = 'Book trusted, ABN-verified tradies in Australia.';
const DEFAULT_TITLE_TAG = 'Find Licensed Tradies Near You | ConnecTradie — Payment Protected';

function meta(attr: 'name' | 'property', value: string): string | null {
  return document.head.querySelector(`meta[${attr}="${value}"]`)?.getAttribute('content') ?? null;
}

function canonicalHref(): string | null {
  return document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
}

function jsonLdScripts(): HTMLScriptElement[] {
  return Array.from(document.head.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'));
}

let originalHead = '';

beforeAll(() => {
  originalHead = document.head.innerHTML;
});

afterAll(() => {
  document.head.innerHTML = originalHead;
});

beforeEach(() => {
  // Reset to the shipped defaults before each test. SEO.tsx captures the
  // "original" value of a tag the first time it touches it and restores that
  // on unmount, so the head must start every test in the same shape.
  document.head.innerHTML = INDEX_HTML_DEFAULTS;
  document.title = DEFAULT_TITLE_TAG;
});

describe('SEO', () => {
  it('renders nothing into the DOM tree itself', () => {
    const { container } = render(<SEO title="Post a job" description="Describe the work." />);
    expect(container).toBeEmptyDOMElement();
  });

  it('writes the page description and OG/Twitter tags into <head> on mount', () => {
    render(<SEO title="Post a job" description="Describe the work and get quotes." />);

    expect(meta('name', 'description')).toBe('Describe the work and get quotes.');
    expect(meta('property', 'og:title')).toBe('Post a job | ConnecTradie');
    expect(meta('property', 'og:description')).toBe('Describe the work and get quotes.');
    expect(meta('name', 'twitter:title')).toBe('Post a job | ConnecTradie');
    expect(meta('name', 'twitter:description')).toBe('Describe the work and get quotes.');
  });

  it('defaults og:type to website and honours an explicit type', () => {
    const { unmount } = render(<SEO title="A" description="d" />);
    expect(meta('property', 'og:type')).toBe('website');
    unmount();

    render(<SEO title="Guide" description="d" ogType="article" />);
    expect(meta('property', 'og:type')).toBe('article');
  });

  it('absolutises a relative og:image against the site URL', () => {
    render(<SEO title="Plumbers" description="d" ogImage="/trades/plumber.png" />);

    expect(meta('property', 'og:image')).toBe('https://connectradie.com/trades/plumber.png');
    expect(meta('name', 'twitter:image')).toBe('https://connectradie.com/trades/plumber.png');
  });

  it('leaves an already-absolute og:image alone', () => {
    render(<SEO title="Plumbers" description="d" ogImage="https://cdn.example.com/a.png" />);

    expect(meta('property', 'og:image')).toBe('https://cdn.example.com/a.png');
    expect(meta('name', 'twitter:image')).toBe('https://cdn.example.com/a.png');
  });

  it('falls back to the default hero image when no og:image is given', () => {
    // Remove the shipped default first, so a passing assertion can only mean
    // the component wrote the tag rather than index.html's value surviving.
    document.head.querySelector('meta[property="og:image"]')?.remove();
    document.head.querySelector('meta[name="twitter:image"]')?.remove();

    render(<SEO title="Home" description="d" />);

    expect(meta('property', 'og:image')).toBe('https://connectradie.com/hero-group.png');
    expect(meta('name', 'twitter:image')).toBe('https://connectradie.com/hero-group.png');
  });

  it('writes the canonical link and og:url when a canonical path is given', () => {
    render(<SEO title="Find a plumber" description="d" canonical="/find/plumber" />);

    expect(canonicalHref()).toBe('https://connectradie.com/find/plumber');
    expect(meta('property', 'og:url')).toBe('https://connectradie.com/find/plumber');
  });

  it('does not touch the canonical link or og:url when no canonical prop is given', () => {
    render(<SEO title="Dashboard" description="d" />);

    // BUG (reported, not fixed): the component deliberately declines to write a
    // canonical without the prop — "a wrong canonical is worse than none" — but
    // index.html ships `<link rel="canonical" href="https://connectradie.com/">`,
    // so a page rendering <SEO> without `canonical` still serves the HOMEPAGE
    // canonical. "None" is not what actually reaches the crawler. Asserted
    // against current behaviour.
    expect(canonicalHref()).toBe('https://connectradie.com/');
    expect(meta('property', 'og:url')).toBe('https://connectradie.com');
  });

  it('creates a canonical link when the document has none', () => {
    document.head.querySelector('link[rel="canonical"]')?.remove();

    render(<SEO title="Find a sparky" description="d" canonical="/find/electrician" />);

    expect(canonicalHref()).toBe('https://connectradie.com/find/electrician');
  });

  it('writes a noindex robots tag only when asked, and removes it on unmount', () => {
    expect(meta('name', 'robots')).toBeNull();

    const { unmount } = render(<SEO title="Admin" description="d" noindex />);
    expect(meta('name', 'robots')).toBe('noindex,nofollow');

    unmount();
    // index.html ships no robots tag, so there is no original to restore to —
    // the tag must be removed, not left behind noindexing the next page.
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('does not write a robots tag for an indexable page', () => {
    render(<SEO title="Home" description="d" />);
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('adds a JSON-LD script with the serialised payload and removes it on unmount', () => {
    const jsonLd = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: 'ConnecTradie' };

    const { unmount } = render(<SEO title="Home" description="d" jsonLd={jsonLd} />);

    const scripts = jsonLdScripts();
    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0].textContent ?? '{}')).toEqual(jsonLd);

    unmount();
    expect(jsonLdScripts()).toHaveLength(0);
  });

  it('supports an array of JSON-LD nodes', () => {
    const jsonLd = [{ '@type': 'FAQPage' }, { '@type': 'BreadcrumbList' }];

    render(<SEO title="Help" description="d" jsonLd={jsonLd} />);

    expect(JSON.parse(jsonLdScripts()[0].textContent ?? '[]')).toEqual(jsonLd);
  });

  it('adds no JSON-LD script when none is supplied', () => {
    render(<SEO title="Home" description="d" />);
    expect(jsonLdScripts()).toHaveLength(0);
  });

  it("restores index.html's defaults on unmount instead of leaking the last page's tags", () => {
    const { unmount } = render(
      <SEO title="Job 42" description="Fix the hot water system." canonical="/jobs/42" />,
    );
    expect(meta('name', 'description')).toBe('Fix the hot water system.');

    unmount();

    expect(meta('name', 'description')).toBe(DEFAULT_DESCRIPTION);
    expect(meta('property', 'og:title')).toBe(DEFAULT_TITLE_TAG);
    expect(meta('property', 'og:description')).toBe(DEFAULT_DESCRIPTION);
    expect(meta('name', 'twitter:title')).toBe(DEFAULT_TITLE_TAG);
    expect(meta('name', 'twitter:description')).toBe(DEFAULT_DESCRIPTION);
    expect(meta('property', 'og:image')).toBe('https://connectradie.com/hero-group.png');
    expect(canonicalHref()).toBe('https://connectradie.com/');
    expect(meta('property', 'og:url')).toBe('https://connectradie.com');
  });

  it('rewrites the tags in place when props change, without duplicating them', () => {
    const { rerender } = render(<SEO title="First" description="First description." />);
    expect(meta('name', 'description')).toBe('First description.');

    rerender(<SEO title="Second" description="Second description." />);

    expect(meta('name', 'description')).toBe('Second description.');
    expect(meta('property', 'og:title')).toBe('Second | ConnecTradie');
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1);
  });

  it('never touches document.title — RouteTracker owns that', () => {
    render(<SEO title="Post a job" description="d" canonical="/post-job" />);
    expect(document.title).toBe(DEFAULT_TITLE_TAG);
  });

  it('leaves tags it does not manage untouched', () => {
    render(<SEO title="Home" description="d" />);

    expect(meta('property', 'og:site_name')).toBe('ConnecTradie');
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
  });
});
