// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SEOOptions {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: 'summary' | 'summary_large_image';
  robots?: string;
  canonical?: string;
}

export interface SitemapEntry {
  path: string;
  priority: number;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
}

export type JsonLdSchema = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function setMetaTag(name: string, content: string, attribute: 'name' | 'property' = 'name'): void {
  let el = document.querySelector(`meta[${attribute}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attribute, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

const JSON_LD_SCRIPT_CLASS = 'connec-tradie-jsonld';

// ---------------------------------------------------------------------------
// SEO meta tags
// ---------------------------------------------------------------------------

/**
 * Set SEO-related meta tags on the current page.
 */
export function setSEOMeta(options: SEOOptions): void {
  document.title = options.title;

  setMetaTag('description', options.description);
  setMetaTag('og:title', options.ogTitle ?? options.title, 'property');
  setMetaTag('og:description', options.ogDescription ?? options.description, 'property');

  if (options.ogImage) {
    setMetaTag('og:image', options.ogImage, 'property');
  }

  setMetaTag('twitter:card', options.twitterCard ?? 'summary', 'name');
  setMetaTag('twitter:title', options.ogTitle ?? options.title, 'name');
  setMetaTag('twitter:description', options.ogDescription ?? options.description, 'name');

  if (options.robots) {
    setMetaTag('robots', options.robots);
  }

  if (options.canonical) {
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', options.canonical);
  }
}

// ---------------------------------------------------------------------------
// JSON-LD injection
// ---------------------------------------------------------------------------

/**
 * Inject a JSON-LD structured data script tag into the page head.
 */
export function injectJsonLd(schema: JsonLdSchema): void {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.className = JSON_LD_SCRIPT_CLASS;
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
}

/**
 * Remove all previously injected JSON-LD script tags.
 */
export function removeJsonLd(): void {
  const scripts = document.querySelectorAll(`script.${JSON_LD_SCRIPT_CLASS}`);
  scripts.forEach((script) => script.remove());
}

// ---------------------------------------------------------------------------
// JSON-LD generators
// ---------------------------------------------------------------------------

interface TradieForSchema {
  full_name: string;
  trade_category?: string;
  postcode?: string;
  email?: string;
  average_rating?: number;
  total_reviews?: number;
  description?: string;
  profile_image_url?: string;
}

/**
 * Generate a JSON-LD LocalBusiness schema for a tradie profile.
 */
export function generateLocalBusinessSchema(tradie: TradieForSchema): JsonLdSchema {
  const schema: JsonLdSchema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: tradie.full_name,
    description: tradie.description ?? `Professional ${tradie.trade_category ?? 'trade'} services`,
    address: {
      '@type': 'PostalAddress',
      postalCode: tradie.postcode ?? '',
      addressCountry: 'AU',
    },
    email: tradie.email,
    image: tradie.profile_image_url,
  };

  if (tradie.average_rating && tradie.total_reviews) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: tradie.average_rating,
      reviewCount: tradie.total_reviews,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return schema;
}

interface ServiceForSchema {
  name: string;
  description: string;
  rate_amount?: number;
  rate_type?: string;
  provider_name: string;
  area_served?: string;
}

/**
 * Generate a JSON-LD Service schema for a tradie's offered service.
 */
export function generateServiceSchema(service: ServiceForSchema): JsonLdSchema {
  const schema: JsonLdSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description,
    provider: {
      '@type': 'LocalBusiness',
      name: service.provider_name,
    },
    areaServed: {
      '@type': 'Country',
      name: service.area_served ?? 'Australia',
    },
  };

  if (service.rate_amount) {
    schema.offers = {
      '@type': 'Offer',
      price: (service.rate_amount / 100).toFixed(2),
      priceCurrency: 'AUD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        unitText: service.rate_type ?? 'per job',
      },
    };
  }

  return schema;
}

interface JobForSchema {
  id: string;
  description: string;
  trade_category: string;
  postcode?: string;
  created_at: string;
}

/**
 * Generate a JSON-LD JobPosting schema for a listed job.
 */
export function generateJobPostingSchema(job: JobForSchema): JsonLdSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: `${job.trade_category} Job`,
    description: job.description,
    datePosted: job.created_at,
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        postalCode: job.postcode ?? '',
        addressCountry: 'AU',
      },
    },
    hiringOrganization: {
      '@type': 'Organization',
      name: 'ConnecTradie',
      sameAs: 'https://connectradie.com.au',
    },
    employmentType: 'CONTRACTOR',
    industry: job.trade_category,
  };
}

interface BreadcrumbItem {
  name: string;
  url: string;
}

/**
 * Generate a JSON-LD BreadcrumbList schema.
 */
export function generateBreadcrumbSchema(items: BreadcrumbItem[]): JsonLdSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

interface FAQItem {
  question: string;
  answer: string;
}

/**
 * Generate a JSON-LD FAQPage schema.
 */
export function generateFAQSchema(faqs: FAQItem[]): JsonLdSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const SEO_PRESETS: Record<string, SEOOptions> = {
  home: {
    title: 'ConnecTradie — Find Trusted Local Tradies in Australia',
    description:
      'Connect with verified, licensed tradies near you. Get quotes for plumbing, electrical, carpentry, and more. Australia\'s trusted tradie marketplace.',
    twitterCard: 'summary_large_image',
  },
  search: {
    title: 'Search Tradies — ConnecTradie',
    description:
      'Search and compare verified tradies by trade, location, rating, and availability. Find the right tradie for your job.',
  },
  explore: {
    title: 'Explore Services — ConnecTradie',
    description:
      'Browse trade categories, top-rated tradies, and popular services across Australia. Plumbing, electrical, roofing, and more.',
  },
  register: {
    title: 'Join ConnecTradie — Register as a Homeowner or Tradie',
    description:
      'Sign up for free. Homeowners: post jobs and get quotes. Tradies: grow your business with verified leads.',
    robots: 'index, follow',
  },
};

// ---------------------------------------------------------------------------
// Sitemap pages
// ---------------------------------------------------------------------------

export const SITEMAP_PAGES: SitemapEntry[] = [
  { path: '/', priority: 1.0, changefreq: 'daily' },
  { path: '/search', priority: 0.9, changefreq: 'daily' },
  { path: '/explore', priority: 0.8, changefreq: 'weekly' },
  { path: '/register', priority: 0.7, changefreq: 'monthly' },
  { path: '/login', priority: 0.5, changefreq: 'monthly' },
  { path: '/terms', priority: 0.3, changefreq: 'yearly' },
  { path: '/privacy', priority: 0.3, changefreq: 'yearly' },
  { path: '/contact', priority: 0.5, changefreq: 'monthly' },
];
