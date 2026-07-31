// Deliberately awkward fixtures for the dashboard sweep.
//
// The point of this file is that BLAND DATA FINDS NOTHING. Every defect in the
// original screenshots was data-dependent — the seasonal grid ballooned because
// it had 12 months of counts, the price table looked squashed because it had
// rows, the tabs clipped because five labels had to fit. So: long names, big
// numbers, full 12-month history, enough rows to scroll.

export const UID = '11111111-1111-4111-8111-111111111111';
const CLIENT_A = '22222222-2222-4222-8222-222222222222';
const CLIENT_B = '33333333-3333-4333-8333-333333333333';

// Fixed clock so runs are comparable. Months walk backwards from here.
const NOW = new Date('2026-07-28T09:00:00Z');
const monthsAgo = (n) => {
  const d = new Date(NOW);
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
};
const daysAgo = (n) => new Date(NOW.getTime() - n * 864e5).toISOString();

const LONG_NAME = 'Konstantinos Papadopoulos-Winterbourne';
const LONG_BIZ = 'Winterbourne & Sons Plumbing, Gasfitting and Drainage Pty Ltd';
const LONG_ADDR = '188 Woodville Road, Granville, New South Wales 2142, Australia';
const LONG_TITLE = 'Replace corroded hot water system and re-pipe the laundry wall cavity';

export const tradieProfile = {
  id: UID, role: 'tradie', full_name: LONG_NAME, email: 'sweep@local',
  business_name: LONG_BIZ, onboarding_completed: true, is_premium: true,
  avatar_url: null, bio: 'Licensed plumber and gasfitter servicing Western Sydney.',
  suburb: 'Granville', postcode: '2142', location_address: LONG_ADDR,
  declared_trades: ['Plumbing', 'Gasfitting', 'Drainage'],
  license_verified: true, abn_verified: true, is_identity_verified: true,
  stripe_connect_account_id: 'acct_sweep', stripe_connect_onboarding_complete: true,
  subscription_tier: 'pro', employer_status: 'active', created_at: monthsAgo(14),
};

const clientA = { id: CLIENT_A, role: 'client', full_name: 'Anastasia Vasilikó-Fitzgerald', email: 'a@x.test', avatar_url: null, suburb: 'Parramatta', postcode: '2150', created_at: monthsAgo(9) };
const clientB = { id: CLIENT_B, role: 'client', full_name: 'Bao', email: 'b@x.test', avatar_url: null, suburb: 'Auburn', postcode: '2144', created_at: monthsAgo(4) };

const STATUSES = ['completed', 'completed', 'in_progress', 'pending', 'completed', 'cancelled',
                  'completed', 'completed', 'funded', 'completed', 'declined', 'completed'];

// One job per month for the last 12 → the seasonal heat map fills completely.
export const jobs = STATUSES.map((status, i) => ({
  id: `job-${String(i).padStart(4, '0')}-0000-4000-8000-00000000000${i % 10}`,
  client_id: i % 3 === 0 ? CLIENT_B : CLIENT_A,
  tradie_id: UID,
  title: i % 3 === 0 ? 'Tap washer' : `${LONG_TITLE} (site ${i + 1})`,
  description: 'Full strip-out and replacement, including make-good to adjacent surfaces.',
  status,
  budget_amount: [45000, 1250000, 87500, 320000, 9950, 1875000, 240000, 62000, 415000, 98000, 3150000, 73000][i],
  location_address: i % 2 === 0 ? LONG_ADDR : 'Unit 4/12 Short St, Auburn NSW 2144',
  created_at: monthsAgo(11 - i),
  updated_at: monthsAgo(11 - i),
  profiles: i % 3 === 0 ? { full_name: clientB.full_name } : { full_name: clientA.full_name },
}));

// Spread across all four price bands so "Win Rate by Quote Price" has real rows.
const QUOTE_BANDS = [
  [12000, 38000], [22000, 47000], [65000, 180000], [90000, 195000],
  [210000, 480000], [260000, 495000], [520000, 900000], [1400000, 2600000],
];
export const quotes = QUOTE_BANDS.map(([min, max], i) => ({
  id: `quote-${i}`,
  job_id: jobs[i % jobs.length].id,
  tradie_id: UID,
  price_min: min,
  price_max: max,
  firm_price: i % 2 === 0 ? Math.round((min + max) / 2) : null,
  status: ['accepted', 'accepted', 'declined', 'accepted', 'pending', 'accepted', 'declined', 'pending'][i],
  created_at: daysAgo(60 - i * 5),
  // Joined for the response-time calculation (job posted -> quote sent).
  jobs: { created_at: daysAgo(62 - i * 5) },
}));

export const payments = [1875000, 3150000, 415000, 98000, 1250000].map((amount, i) => ({
  id: `pay-${i + 1}`,
  amount,
  original_amount: amount,
  currency: 'aud',
  status: i === 3 ? 'pending' : 'completed',
  payment_type: i === 2 ? 'recurring_invoice' : 'job_funding',
  profile_id: UID,
  job_id: jobs[i].id,
  labour_cents: Math.round(amount * 0.6),
  materials_cents: Math.round(amount * 0.4),
  commission_cents: Math.round(amount * 0.05),
  invoice_number: `INV-2026-${String(1000 + i)}`,
  created_at: monthsAgo(i + 1),
  completed_at: i === 3 ? null : monthsAgo(i + 1),
  metadata: null,
  // Payouts/useTradieEarnings walks the embedded job; without it the page threw
  // "Cannot read properties of undefined (reading 'client_id')".
  jobs: { id: jobs[i].id, client_id: jobs[i].client_id, title: jobs[i].title, status: jobs[i].status, tradie_id: UID },
}));

export const reviews = [
  { id: 'rev-1', tradie_id: UID, client_id: CLIENT_A, rating: 5, comment: 'Outstanding work, arrived early and left the site spotless.', created_at: daysAgo(12) },
  { id: 'rev-2', tradie_id: UID, client_id: CLIENT_B, rating: 4, comment: 'Good job.', created_at: daysAgo(40) },
  { id: 'rev-3', tradie_id: UID, client_id: CLIENT_A, rating: 5, comment: 'Would absolutely hire again for any plumbing or gasfitting work.', created_at: daysAgo(95) },
];

export const notifications = Array.from({ length: 9 }, (_, i) => ({
  id: `note-${i}`, user_id: UID,
  title: i % 2 ? 'Payment released to your bank account' : 'New quote request from a homeowner in Granville',
  message: 'Tap to review the details and respond before the client picks someone else.',
  type: 'job', channel: 'in_app', read: i > 3, link: '/work', job_id: jobs[i % jobs.length].id,
  created_at: daysAgo(i),
}));

export const messages = Array.from({ length: 8 }, (_, i) => ({
  id: `msg-${i}`, conversation_id: 'conv-1', sender_id: i % 2 ? UID : CLIENT_A,
  content: i % 3 === 0
    ? 'Morning — just confirming the isolation valve replacement is still booked for Thursday between 8 and 10am?'
    : 'Yes, all good.',
  created_at: daysAgo(8 - i), read_at: i < 5 ? daysAgo(7 - i) : null,
}));

export const conversations = [{
  id: 'conv-1', job_id: jobs[0].id, created_at: daysAgo(9), updated_at: daysAgo(1),
  last_message: messages[messages.length - 1].content,
}];

export const recurringJobs = [
  { id: 'rj-1', tradie_id: UID, client_id: CLIENT_A, title: 'Quarterly backflow prevention device testing and certification', frequency: 'quarterly', status: 'active', rate: 48000, next_session_at: daysAgo(-7), created_at: monthsAgo(8) },
  { id: 'rj-2', tradie_id: UID, client_id: CLIENT_B, title: 'Monthly grease trap service', frequency: 'monthly', status: 'active', rate: 22000, next_session_at: daysAgo(-2), created_at: monthsAgo(3) },
];

export const recurringInvoices = [
  { id: 'ri-1', tradie_id: UID, recurring_job_id: 'rj-1', total: 480.0, status: 'paid', payment_method: 'external', paid_at: monthsAgo(1), created_at: monthsAgo(1), due_date: daysAgo(20) },
  { id: 'ri-2', tradie_id: UID, recurring_job_id: 'rj-2', total: 220.0, status: 'pending', payment_method: 'becs', paid_at: null, created_at: daysAgo(5), due_date: daysAgo(-9) },
];

// profile_id, not tradie_id/user_id — the app filters on profile_id.
export const tradieDetails = [{
  id: 'td-1', profile_id: UID, trade_category: 'Plumbing', trade_type: 'Plumbing',
  business_name: LONG_BIZ, bio: 'Licensed plumber and gasfitter servicing Western Sydney.',
  subscription_tier: 'pro', hourly_rate: 12500, service_radius_km: 40,
  contractor_type: 'sole_trader', is_licensed: true, is_insured: true, is_verified: true,
  insurance_provider: 'Allianz', qualifications: ['Cert III Plumbing', 'Gas Fitting Licence', 'Backflow Prevention Accreditation'], white_card: true,
  emergency_available: true, default_call_out_fee_cents: 9900,
  payout_speed_preference: 'standard', created_at: monthsAgo(14),
}];

// Column names taken from src/types/supabase.ts, not guessed. An earlier version
// of this fixture used `name`/`tradie_id`; the real columns are `full_name` and
// `owner_id`, so Clients.tsx read `c.full_name` as undefined and crashed on
// `.charAt(0)`. That looked exactly like an app bug and was not one.
export const clientContacts = [
  { id: 'cc-1', owner_id: UID, full_name: clientA.full_name, email: 'a@x.test', phone: '0400 000 000', address: LONG_ADDR, suburb: 'Parramatta', postcode: '2150', state: 'NSW', linked_profile_id: CLIENT_A, notes: null, payment_method: 'card', created_at: monthsAgo(6), updated_at: monthsAgo(1), latitude: null, longitude: null },
  { id: 'cc-2', owner_id: UID, full_name: 'Bao', email: 'b@x.test', phone: '0400 111 111', address: 'Unit 4/12 Short St', suburb: 'Auburn', postcode: '2144', state: 'NSW', linked_profile_id: null, notes: null, payment_method: 'becs', created_at: monthsAgo(2), updated_at: monthsAgo(1), latitude: null, longitude: null },
];

/** table name -> rows. Anything not listed falls back to []. */
export const TABLES = {
  profiles: [tradieProfile, clientA, clientB],
  jobs,
  quotes,
  payments,
  reviews,
  notifications,
  messages,
  conversations,
  conversation_participants: [
    { conversation_id: 'conv-1', user_id: UID }, { conversation_id: 'conv-1', user_id: CLIENT_A },
  ],
  recurring_jobs: recurringJobs,
  recurring_invoices: recurringInvoices,
  tradie_details: tradieDetails,
  client_contacts: clientContacts,
  portfolio_images: [{ id: 'pi-1', tradie_id: UID, image_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', caption: 'Bathroom re-pipe' }],
  profile_views: [{ id: 'pv-1', tradie_id: UID, viewer_id: CLIENT_A, viewed_at: daysAgo(1) }],
  calendar_integrations: [{ id: 'ci-1', tradie_id: UID, sync_enabled: true, calendar_id: 'primary' }],
  app_settings: [{ key: 'lead_price_cents', value: '1500' }],
  connections: [], lead_impressions: [], client_sites: [],
  recurring_sessions: [], typing_indicators: [], account_removals: [],
};
