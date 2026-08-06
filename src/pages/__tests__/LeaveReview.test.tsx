import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useParams: () => ({ jobId: 'job-1' }), useNavigate: () => vi.fn() };
});

// The identity must be STABLE across renders: LeaveReview's effect depends on
// `user`, so returning a fresh object each render re-fires it forever.
vi.mock('../../contexts/AuthContext', () => {
  const auth = { user: { id: 'client-1' } };
  return { useAuth: () => auth };
});

vi.mock('../../components/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../lib/stripePayments', () => ({
  releaseEscrow: vi.fn(),
  humanizePaymentError: (m: string | null) => m ?? 'fallback',
}));

/** Every insert the component makes, so we can assert the review was written. */
const inserts: { table: string; payload: unknown }[] = [];

vi.mock('../../lib/supabase', () => {
  const chainFor = (table: string) => {
    const ops: string[] = [];
    const chain: Record<string, unknown> = {};

    const response = () => {
      if (ops.includes('insert')) return { data: null, error: null };
      switch (table) {
        case 'jobs':
          return {
            data: {
              id: 'job-1',
              description: '[Cleaner] Mop floors',
              location_address: '6 Spring Garden St, Sydney',
              status: 'completed',
              client_id: 'client-1',
              tradie_id: 'tradie-1',
              created_at: '2026-08-05',
            },
            error: null,
          };
        case 'profiles':
          return { data: { id: 'tradie-1', full_name: 'William Magson', avatar_url: null }, error: null };
        case 'reviews':
          return { data: null, error: null }; // no existing review
        case 'payments':
          // A completed $0 destination charge — the shape that used to 400.
          return { data: { id: 'pay-1', metadata: { flow: 'destination' } }, error: null };
        default:
          return { data: null, error: null };
      }
    };

    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'order', 'limit', 'maybeSingle', 'single']) {
      chain[m] = vi.fn(() => { ops.push(m); return chain; });
    }
    chain.insert = vi.fn((payload: unknown) => {
      ops.push('insert');
      inserts.push({ table, payload });
      return chain;
    });
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(response()).then(resolve);
    return chain;
  };

  return { supabase: { from: vi.fn((table: string) => chainFor(table)) } };
});

import LeaveReview from '../LeaveReview';
import { releaseEscrow } from '../../lib/stripePayments';

const renderPage = () =>
  render(
    <MemoryRouter>
      <LeaveReview />
    </MemoryRouter>,
  );

/** Pick 5 stars and submit. */
async function submitFiveStars(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByText('Rate your experience')).toBeInTheDocument());
  const stars = screen.getAllByRole('button').filter((b) => b.querySelector('svg.lucide-star'));
  await user.click(stars[4]);
  await user.click(screen.getByRole('button', { name: /submit review/i }));
}

describe('LeaveReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserts.length = 0;
  });

  it('saves the review even when releasing the payment fails', async () => {
    // The regression this guards: releaseEscrow used to run BEFORE the insert,
    // so a $0 job (no Stripe payment intent → 400) threw and silently discarded
    // feedback the client had already written.
    vi.mocked(releaseEscrow).mockRejectedValue(
      new Error('Payment does not have a Stripe payment intent'),
    );
    const user = userEvent.setup();
    renderPage();

    await submitFiveStars(user);

    await waitFor(() => {
      expect(inserts.filter((i) => i.table === 'reviews')).toHaveLength(1);
    });
    expect(inserts.find((i) => i.table === 'reviews')?.payload).toMatchObject({
      job_id: 'job-1',
      tradie_id: 'tradie-1',
      client_id: 'client-1',
      rating: 5,
    });
  });

  it('still confirms submission, and names what failed instead of the payment', async () => {
    vi.mocked(releaseEscrow).mockRejectedValue(
      new Error('Payment does not have a Stripe payment intent'),
    );
    const user = userEvent.setup();
    renderPage();

    await submitFiveStars(user);

    await waitFor(() => expect(screen.getByText(/Review submitted/)).toBeInTheDocument());
    expect(screen.getByText(/Payment wasn't released/)).toBeInTheDocument();
    // Not "& payment released" — we must not claim money moved when it didn't.
    expect(screen.queryByText(/Review submitted & payment released/)).not.toBeInTheDocument();
  });

  it('reports both when the release succeeds', async () => {
    vi.mocked(releaseEscrow).mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderPage();

    await submitFiveStars(user);

    await waitFor(() =>
      expect(screen.getByText(/Review submitted & payment released/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Payment wasn't released/)).not.toBeInTheDocument();
    expect(releaseEscrow).toHaveBeenCalledWith('pay-1');
  });
});
