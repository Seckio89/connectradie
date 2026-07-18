import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// ABN Validation (identityVerification)
// ---------------------------------------------------------------------------

import { validateABN } from '../lib/identityVerification';

describe('ABN Validation', () => {
  it('accepts a valid 11-digit ABN', () => {
    const result = validateABN('51824753556');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects ABN with wrong length', () => {
    const result = validateABN('1234567');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('ABN must be exactly 11 digits');
  });

  it('rejects non-numeric ABN', () => {
    const result = validateABN('5182475abcd');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('ABN must be exactly 11 digits');
  });

  it('rejects ABN that fails checksum', () => {
    const result = validateABN('12345678901');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid ABN checksum');
  });

  it('validates known valid ABN with spaces: "51 824 753 556"', () => {
    const result = validateABN('51 824 753 556');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rate Limiter (rateLimiter)
// ---------------------------------------------------------------------------

import {
  checkRateLimit,
  isSpamContent,
  isSuspiciousFakeReview,
  detectContactScraping,
  RATE_LIMITS,
} from '../lib/rateLimiter';

describe('Rate Limiter', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('checkRateLimit', () => {
    it('allows actions within the limit', () => {
      const result = checkRateLimit('user-1', 'post_job');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it('blocks actions over the limit', () => {
      const action = 'post_job';
      const max = RATE_LIMITS[action].max;

      // Exhaust all allowed attempts
      for (let i = 0; i < max; i++) {
        const r = checkRateLimit('user-block', action);
        expect(r.allowed).toBe(true);
      }

      // Next attempt should be blocked
      const blocked = checkRateLimit('user-block', action);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });
  });

  describe('isSpamContent', () => {
    it('detects more than 3 URLs as spam', () => {
      const text = 'Check http://a.com http://b.com http://c.com http://d.com';
      const result = isSpamContent(text);
      expect(result.isSpam).toBe(true);
      expect(result.reasons.some((r) => r.includes('URLs'))).toBe(true);
    });

    it('detects excessive CAPS as spam', () => {
      const text = 'THIS IS ALL CAPS AND IT SHOULD BE FLAGGED AS SPAM CONTENT';
      const result = isSpamContent(text);
      expect(result.isSpam).toBe(true);
      expect(result.reasons.some((r) => r.includes('capitalisation'))).toBe(true);
    });

    it('detects spam keywords', () => {
      const text = 'Click here to buy now and earn extra cash with this limited offer';
      const result = isSpamContent(text);
      expect(result.isSpam).toBe(true);
      expect(result.reasons.some((r) => r.includes('spam keywords'))).toBe(true);
    });
  });

  describe('isSuspiciousFakeReview', () => {
    it('detects accounts younger than 7 days', () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const result = isSuspiciousFakeReview(
        {
          created_at: now.toISOString(),
          comment: 'Great work done by the tradie!',
          job_completed_at: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
          reviewer_reviews_today: 1,
        },
        { created_at: twoDaysAgo.toISOString() },
      );
      expect(result.suspicious).toBe(true);
      expect(result.reasons.some((r) => r.includes('day(s) old'))).toBe(true);
    });

    it('detects very short review comments', () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const result = isSuspiciousFakeReview(
        {
          created_at: now.toISOString(),
          comment: 'Good',
          job_completed_at: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
          reviewer_reviews_today: 1,
        },
        { created_at: thirtyDaysAgo.toISOString() },
      );
      expect(result.suspicious).toBe(true);
      expect(result.reasons.some((r) => r.includes('short'))).toBe(true);
    });
  });

  describe('detectContactScraping', () => {
    it('returns low severity for 20-49 views', () => {
      const result = detectContactScraping('user-1', 25);
      expect(result.suspicious).toBe(true);
      expect(result.severity).toBe('low');
    });

    it('returns medium severity for 50-99 views', () => {
      const result = detectContactScraping('user-1', 75);
      expect(result.suspicious).toBe(true);
      expect(result.severity).toBe('medium');
    });

    it('returns high severity for 100+ views', () => {
      const result = detectContactScraping('user-1', 150);
      expect(result.suspicious).toBe(true);
      expect(result.severity).toBe('high');
    });

    it('returns not suspicious for < 20 views', () => {
      const result = detectContactScraping('user-1', 10);
      expect(result.suspicious).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// SEO Utils (seoUtils)
// ---------------------------------------------------------------------------

import {
  setSEOMeta,
  generateLocalBusinessSchema,
  generateJobPostingSchema,
  SEO_PRESETS,
  SITEMAP_PAGES,
} from '../lib/seoUtils';

describe('SEO Utils', () => {
  it('setSEOMeta sets document title', () => {
    setSEOMeta({
      title: 'Test Page Title',
      description: 'Test description',
    });
    expect(document.title).toBe('Test Page Title');
  });

  it('generateLocalBusinessSchema returns a valid structure', () => {
    const schema = generateLocalBusinessSchema({
      full_name: 'John the Plumber',
      trade_category: 'plumbing',
      postcode: '2000',
      email: 'john@example.com',
      average_rating: 4.8,
      total_reviews: 25,
      description: 'Expert plumbing services in Sydney',
    });

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('LocalBusiness');
    expect(schema.name).toBe('John the Plumber');
    expect(schema.description).toBe('Expert plumbing services in Sydney');
    expect(schema.email).toBe('john@example.com');
    expect(schema.aggregateRating).toBeDefined();
    const rating = schema.aggregateRating as Record<string, unknown>;
    expect(rating['@type']).toBe('AggregateRating');
    expect(rating.ratingValue).toBe(4.8);
    expect(rating.reviewCount).toBe(25);
  });

  it('generateJobPostingSchema includes required fields', () => {
    const schema = generateJobPostingSchema({
      id: 'job-123',
      description: 'Fix leaking tap in kitchen',
      trade_category: 'plumbing',
      postcode: '2000',
      created_at: '2025-01-15T10:00:00Z',
    });

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('JobPosting');
    expect(schema.title).toBe('plumbing Job');
    expect(schema.description).toBe('Fix leaking tap in kitchen');
    expect(schema.datePosted).toBe('2025-01-15T10:00:00Z');
    expect(schema.employmentType).toBe('CONTRACTOR');
    expect(schema.industry).toBe('plumbing');

    const location = schema.jobLocation as Record<string, unknown>;
    expect(location['@type']).toBe('Place');

    const org = schema.hiringOrganization as Record<string, unknown>;
    expect(org['@type']).toBe('Organization');
    expect(org.name).toBe('ConnecTradie');
  });

  it('SEO_PRESETS has all required pages', () => {
    expect(SEO_PRESETS).toHaveProperty('home');
    expect(SEO_PRESETS).toHaveProperty('search');
    expect(SEO_PRESETS).toHaveProperty('explore');
    expect(SEO_PRESETS).toHaveProperty('register');

    // Each preset should have title and description
    for (const key of Object.keys(SEO_PRESETS)) {
      expect(SEO_PRESETS[key].title).toBeTruthy();
      expect(SEO_PRESETS[key].description).toBeTruthy();
    }
  });

  it('SITEMAP_PAGES has correct count', () => {
    expect(SITEMAP_PAGES).toHaveLength(8);
    expect(SITEMAP_PAGES[0].path).toBe('/');
    expect(SITEMAP_PAGES[0].priority).toBe(1.0);

    // Verify all entries have required fields
    for (const page of SITEMAP_PAGES) {
      expect(page.path).toBeTruthy();
      expect(page.priority).toBeGreaterThanOrEqual(0);
      expect(page.priority).toBeLessThanOrEqual(1);
      expect(page.changefreq).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Geolocation (useGeolocation)
// ---------------------------------------------------------------------------

import {
  AU_CAPITAL_COORDS,
  calculateDistance,
  sortByDistance,
} from '../hooks/useGeolocation';

describe('Geolocation', () => {
  it('AU_CAPITAL_COORDS has all 8 capitals', () => {
    const expectedCities = [
      'sydney',
      'melbourne',
      'brisbane',
      'perth',
      'adelaide',
      'canberra',
      'hobart',
      'darwin',
    ];

    expect(Object.keys(AU_CAPITAL_COORDS)).toHaveLength(8);
    for (const city of expectedCities) {
      expect(AU_CAPITAL_COORDS).toHaveProperty(city);
      expect(AU_CAPITAL_COORDS[city]).toHaveLength(2);
    }
  });

  it('calculateDistance returns reasonable km for Sydney to Melbourne (~714km)', () => {
    const [sydLat, sydLng] = AU_CAPITAL_COORDS.sydney;
    const [melLat, melLng] = AU_CAPITAL_COORDS.melbourne;

    const distance = calculateDistance(sydLat, sydLng, melLat, melLng);
    // Sydney to Melbourne is approximately 714 km as the crow flies
    expect(distance).toBeGreaterThan(700);
    expect(distance).toBeLessThan(730);
  });

  it('calculateDistance returns 0 for same point', () => {
    const distance = calculateDistance(-33.8688, 151.2093, -33.8688, 151.2093);
    expect(distance).toBe(0);
  });

  it('sortByDistance sorts items nearest first', () => {
    const [sydLat, sydLng] = AU_CAPITAL_COORDS.sydney;
    const items = [
      { name: 'Perth', lat: AU_CAPITAL_COORDS.perth[0], lng: AU_CAPITAL_COORDS.perth[1] },
      { name: 'Canberra', lat: AU_CAPITAL_COORDS.canberra[0], lng: AU_CAPITAL_COORDS.canberra[1] },
      { name: 'Melbourne', lat: AU_CAPITAL_COORDS.melbourne[0], lng: AU_CAPITAL_COORDS.melbourne[1] },
    ];

    const sorted = sortByDistance(items, sydLat, sydLng);
    // Canberra (~235km) < Melbourne (~714km) < Perth (~3290km)
    expect(sorted[0].name).toBe('Canberra');
    expect(sorted[1].name).toBe('Melbourne');
    expect(sorted[2].name).toBe('Perth');
  });

  it('sortByDistance handles empty array gracefully', () => {
    const sorted = sortByDistance([], -33.8688, 151.2093);
    expect(sorted).toEqual([]);
  });

  it('sortByDistance does not mutate the original array', () => {
    const items = [
      { name: 'Perth', lat: AU_CAPITAL_COORDS.perth[0], lng: AU_CAPITAL_COORDS.perth[1] },
      { name: 'Canberra', lat: AU_CAPITAL_COORDS.canberra[0], lng: AU_CAPITAL_COORDS.canberra[1] },
    ];
    const original = [...items];
    sortByDistance(items, -33.8688, 151.2093);
    expect(items).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// Saved Searches (savedSearches)
// ---------------------------------------------------------------------------

import {
  addRecentSearch,
  getRecentSearches,
  clearRecentSearches,
} from '../lib/savedSearches';

describe('Saved Searches', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('addRecentSearch adds an entry to localStorage', () => {
    addRecentSearch('plumber sydney');
    const searches = getRecentSearches();
    expect(searches).toContain('plumber sydney');
  });

  it('addRecentSearch deduplicates entries (case-insensitive)', () => {
    addRecentSearch('Plumber Sydney');
    addRecentSearch('plumber sydney');
    const searches = getRecentSearches();
    const count = searches.filter(
      (s) => s.toLowerCase() === 'plumber sydney',
    ).length;
    expect(count).toBe(1);
  });

  it('addRecentSearch limits to 10 entries', () => {
    for (let i = 0; i < 15; i++) {
      addRecentSearch(`search-${i}`);
    }
    const searches = getRecentSearches();
    expect(searches.length).toBeLessThanOrEqual(10);
  });

  it('getRecentSearches returns an array', () => {
    const searches = getRecentSearches();
    expect(Array.isArray(searches)).toBe(true);
  });

  it('getRecentSearches returns empty array when no searches stored', () => {
    const searches = getRecentSearches();
    expect(searches).toEqual([]);
  });

  it('clearRecentSearches empties the list', () => {
    addRecentSearch('plumber');
    addRecentSearch('electrician');
    clearRecentSearches();
    const searches = getRecentSearches();
    expect(searches).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Review System (reviewSystem)
// ---------------------------------------------------------------------------

import { REVIEW_TAGS, isTopRated } from '../lib/reviewSystem';

describe('Review System', () => {
  it('REVIEW_TAGS has 10 items', () => {
    expect(REVIEW_TAGS).toHaveLength(10);
  });

  it('REVIEW_TAGS contains expected values', () => {
    expect(REVIEW_TAGS).toContain('punctual');
    expect(REVIEW_TAGS).toContain('quality_work');
    expect(REVIEW_TAGS).toContain('good_communication');
    expect(REVIEW_TAGS).toContain('would_recommend');
  });

  it('isTopRated requires >= 5 reviews', () => {
    const result = isTopRated({
      avgRating: 5.0,
      totalReviews: 4,
      distribution: { oneStar: 0, twoStar: 0, threeStar: 0, fourStar: 0, fiveStar: 4 },
      responseRate: 1.0,
    });
    expect(result).toBe(false);
  });

  it('isTopRated requires >= 4.5 average rating', () => {
    const result = isTopRated({
      avgRating: 4.4,
      totalReviews: 10,
      distribution: { oneStar: 0, twoStar: 0, threeStar: 1, fourStar: 5, fiveStar: 4 },
      responseRate: 1.0,
    });
    expect(result).toBe(false);
  });

  it('isTopRated requires >= 80% response rate', () => {
    const result = isTopRated({
      avgRating: 4.9,
      totalReviews: 10,
      distribution: { oneStar: 0, twoStar: 0, threeStar: 0, fourStar: 1, fiveStar: 9 },
      responseRate: 0.7,
    });
    expect(result).toBe(false);
  });

  it('isTopRated returns true when all criteria are met', () => {
    const result = isTopRated({
      avgRating: 4.8,
      totalReviews: 10,
      distribution: { oneStar: 0, twoStar: 0, threeStar: 0, fourStar: 2, fiveStar: 8 },
      responseRate: 0.9,
    });
    expect(result).toBe(true);
  });

  it('isTopRated returns true at exact boundary values', () => {
    const result = isTopRated({
      avgRating: 4.5,
      totalReviews: 5,
      distribution: { oneStar: 0, twoStar: 0, threeStar: 0, fourStar: 5, fiveStar: 0 },
      responseRate: 0.8,
    });
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Accessibility (accessibility)
// ---------------------------------------------------------------------------

import {
  ratingLabel,
  statusLabel,
  priceLabel,
  meetsContrastRatio,
} from '../lib/accessibility';

describe('Accessibility', () => {
  it('ratingLabel formats correctly with default max', () => {
    expect(ratingLabel(4)).toBe('4 out of 5 stars');
    expect(ratingLabel(3.5)).toBe('3.5 out of 5 stars');
  });

  it('ratingLabel formats correctly with custom max', () => {
    expect(ratingLabel(8, 10)).toBe('8 out of 10 stars');
  });

  it('statusLabel formats correctly and replaces underscores', () => {
    expect(statusLabel('in_progress')).toBe('Status: in progress');
    expect(statusLabel('completed')).toBe('Status: completed');
    expect(statusLabel('pending_review')).toBe('Status: pending review');
  });

  it('priceLabel formats correctly in AUD', () => {
    const label = priceLabel(150);
    // Intl.NumberFormat for en-AU AUD should produce something like "$150.00" or "A$150.00"
    expect(label).toContain('150.00');
  });

  it('priceLabel supports custom currency', () => {
    const label = priceLabel(99.99, 'USD');
    expect(label).toContain('99.99');
  });

  it('meetsContrastRatio passes for sufficient AA contrast', () => {
    // luminance values: 1.0 (white) vs 0.0 (black) => ratio = (1+0.05)/(0+0.05) = 21
    expect(meetsContrastRatio(1.0, 0.0, 'AA')).toBe(true);
  });

  it('meetsContrastRatio fails for insufficient AA contrast', () => {
    // Two very similar luminance values => low ratio
    expect(meetsContrastRatio(0.5, 0.4, 'AA')).toBe(false);
  });

  it('meetsContrastRatio checks AAA level correctly', () => {
    // Ratio = (1.0+0.05)/(0.0+0.05) = 21 => passes AAA (>=7)
    expect(meetsContrastRatio(1.0, 0.0, 'AAA')).toBe(true);

    // Ratio = (0.3+0.05)/(0.05+0.05) = 3.5 => fails AAA
    expect(meetsContrastRatio(0.3, 0.05, 'AAA')).toBe(false);
  });

  it('meetsContrastRatio handles swapped foreground/background', () => {
    // The function uses Math.max/Math.min so order should not matter
    expect(meetsContrastRatio(0.0, 1.0, 'AA')).toBe(true);
    expect(meetsContrastRatio(1.0, 0.0, 'AA')).toBe(true);
  });
});
