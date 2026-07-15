// ─────────────────────────────────────────────────────────────────────────────
// helpContent — role- and route-keyed contextual help copy.
//
// Feeds the first-time PageHelpCard (intro) and the "?" HelpDrawer (tips + FAQ).
// Content is deliberately short and role-specific: a client never sees invoicing
// help, a tradie never sees "how to post a job". Keep intros to 1–2 sentences.
// ─────────────────────────────────────────────────────────────────────────────

export type HelpRole = 'tradie' | 'client';

export interface HelpFaq {
  q: string;
  a: string;
}

export interface HelpContent {
  /** Heading for both the first-time card and the help drawer. */
  title: string;
  /** 1–2 sentence intro shown on the first-time card. */
  intro: string;
  /** 3–4 short, action-oriented tips shown in the drawer. */
  tips: string[];
  /** A few page-relevant FAQs. */
  faqs: HelpFaq[];
}

// Keyed by canonical base route, then role.
const HELP_CONTENT: Record<string, Partial<Record<HelpRole, HelpContent>>> = {
  '/dashboard': {
    tradie: {
      title: 'Welcome to your hub',
      intro: 'This is your business at a glance — jobs, messages and earnings all in one place. Tap any section to dive in.',
      tips: [
        'Your "Getting Started" checklist tracks what to set up next.',
        'Free Plan Usage shows how many leads you have left this month.',
        'Earnings totals include both Stripe and externally-paid invoices.',
        'Use the sidebar to jump between jobs, schedule and payouts.',
      ],
      faqs: [
        { q: 'How do I get more leads?', a: 'Set your availability and service area so clients nearby can find and book you. Pro members get unlimited leads.' },
        { q: 'Where do I see my money?', a: 'Open Payouts for a full breakdown of escrow, transfers and externally-received payments.' },
      ],
    },
    client: {
      title: 'Welcome back',
      intro: 'This is your home base — post jobs, track quotes and manage payments from here.',
      tips: [
        'Tap "Find a Tradie" to post a new job.',
        '"Needs your attention" highlights anything waiting on you.',
        'Release payment once you\'re happy the work is done.',
        'Message tradies directly about any job.',
      ],
      faqs: [
        { q: 'Is my payment safe?', a: 'Yes — your payment is held securely in escrow and only released to the tradie when you approve the completed work.' },
        { q: 'How do I compare quotes?', a: 'Open a job to see every quote side by side, with each tradie\'s price, rating and profile.' },
      ],
    },
  },
  '/work': {
    tradie: {
      title: 'Your Work Hub',
      intro: 'Manage your ongoing clients here — create quotes, track recurring services and generate invoices.',
      tips: [
        'Add clients to your address book, even ones who aren\'t on the app.',
        'Set a client to "bank transfer" or "card pay link" to match how they pay.',
        'Turn a quote into a recurring service for regulars.',
        'Post a vacancy to find staff when you need a hand.',
      ],
      faqs: [
        { q: 'Can I invoice a client who isn\'t on the app?', a: 'Yes. Add them as a client, then send an invoice — a card pay link, or a bank-transfer invoice you mark paid yourself.' },
        { q: 'What\'s a recurring service?', a: 'A regular visit (e.g. weekly clean) that you can invoice each time without setting it up again.' },
      ],
    },
  },
  '/clients': {
    tradie: {
      title: 'Your clients',
      intro: 'Your private client book. Quote them, assign workers and send invoices — they don\'t need an account.',
      tips: [
        'Choose how each client pays when you add them.',
        'Send a quote and they get a link to view and accept it.',
        'Invoices for each client show under their profile.',
        'Mark bank-transfer invoices paid once the money lands.',
      ],
      faqs: [
        { q: 'Do my clients need to sign up?', a: 'No. You can quote and invoice off-app clients by email — they just tap a link.' },
      ],
    },
  },
  '/schedule': {
    tradie: {
      title: 'Your schedule',
      intro: 'Your calendar shows every upcoming job and visit. Tap any day to see details or add availability.',
      tips: [
        'Add availability so clients can book you.',
        'Switch to the Team tab to see where your workers are.',
        'Recurring services appear automatically on their due dates.',
      ],
      faqs: [
        { q: 'How do clients book me?', a: 'Once you add availability slots, clients in your area can request those times.' },
      ],
    },
    client: {
      title: 'Your schedule',
      intro: 'See all your upcoming jobs and bookings in one calendar. Tap any day for details.',
      tips: [
        'Booked jobs show with the tradie and time.',
        'Tap a job to message the tradie or view details.',
      ],
      faqs: [],
    },
  },
  '/messages': {
    tradie: {
      title: 'Messages',
      intro: 'Chat directly with your clients here — all your job-related conversations in one place.',
      tips: [
        'Reply quickly to win more work — clients notice.',
        'Each conversation is tied to a job for context.',
        'Photos and updates you send appear here too.',
      ],
      faqs: [
        { q: 'Can I message before quoting?', a: 'Yes — clients can enquire first, and your replies appear here.' },
      ],
    },
    client: {
      title: 'Messages',
      intro: 'Chat directly with your tradies here. Every job-related message in one place.',
      tips: [
        'Message any tradie who quoted on your job.',
        'Keep questions in the app so there\'s a record.',
      ],
      faqs: [],
    },
  },
  '/payouts': {
    tradie: {
      title: 'Your payouts',
      intro: 'Track everything you\'ve earned — money in escrow, transfers to your bank, and payments received outside the app.',
      tips: [
        'Total Earned combines Stripe and externally-received payments.',
        'Use the All / Stripe / External filter to focus.',
        'Set your bank details in Settings for bank-transfer invoices.',
        'Escrow releases to your bank once the client approves.',
      ],
      faqs: [
        { q: 'When do I get paid?', a: 'Card payments release from escrow when the client approves the work, then reach your bank in 2–3 days.' },
        { q: 'How do external payments show up?', a: 'When you mark a bank-transfer invoice paid, it appears in "Externally received" and counts toward your total.' },
      ],
    },
  },
  '/leads': {
    client: {
      title: 'Your jobs',
      intro: 'Every job you\'ve posted and the quotes coming in. Tap a job to review quotes and pick a tradie.',
      tips: [
        'Compare quotes side by side before choosing.',
        'Accept & pay to lock in a tradie — funds are held safely.',
        'Track ongoing services under the Ongoing tab.',
      ],
      faqs: [
        { q: 'What happens after I accept a quote?', a: 'Your payment is held in escrow, the tradie does the work, and you release the funds once it\'s done.' },
      ],
    },
  },
  '/payments': {
    tradie: {
      title: 'Invoices & payments',
      intro: 'A full history of your invoices and payments, Stripe and external alike.',
      tips: [
        'Download any invoice as a PDF for your records.',
        'External (bank-transfer) invoices show once you mark them paid.',
      ],
      faqs: [],
    },
    client: {
      title: 'Your payments',
      intro: 'Every payment and invoice for your jobs, in one place.',
      tips: [
        'Download invoices for your records.',
        'Paid, pending and refunded amounts are summarised at the top.',
      ],
      faqs: [],
    },
  },
};

/** Reduce a full pathname to its canonical base (e.g. /clients/123 → /clients). */
function basePath(pathname: string): string {
  const clean = pathname.replace(/\/+$/, '') || '/dashboard';
  const segments = clean.split('/').filter(Boolean);
  return segments.length ? `/${segments[0]}` : '/dashboard';
}

/** Stable key for first-time dismissal, unique per page + role. */
export function helpKey(pathname: string, role: HelpRole | null): string {
  return `ct_help_seen_${basePath(pathname)}_${role ?? 'na'}`;
}

/** Resolve help content for the current page + role, or null if none. */
export function getHelpContent(pathname: string, role: HelpRole | null): HelpContent | null {
  if (!role) return null;
  const page = HELP_CONTENT[basePath(pathname)];
  return page?.[role] ?? null;
}
