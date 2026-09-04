import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LicenceReviewQueue, { type QueueRow } from '../verification/LicenceReviewQueue';

// The queue takes its loaders as props, so nothing here touches supabase.
vi.mock('../../lib/supabase', () => ({ supabase: {} }));

function row(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    id: 'v1',
    user_id: 'u1',
    trade_category: 'plumber',
    state_code: 'NSW',
    register_id: 'r1',
    storage_path: 'u1/photo.jpg',
    licence_number: '123456C',
    licence_holder_name: 'John Smith',
    licence_class: 'Plumber, Drainer',
    expiry_date: '2027-03-14',
    ocr_confidence: 0.9,
    ocr_provider: 'huggingface:test',
    precheck_expiry_ok: true,
    precheck_name_match: true,
    precheck_class_match: false,
    status: 'awaiting_review',
    reviewed_by: null,
    reviewed_at: null,
    rejection_reason: null,
    photo_deleted_at: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T01:00:00Z',
    licence_registers: { register_name: 'NSW Fair Trading licence check', lookup_url_template: 'https://reg.example/?n={{licence_number}}', notes: null },
    tradie_name: 'John Smith',
    tradie_email: 'john@example.com',
    ...overrides,
  };
}

const signPhoto = vi.fn().mockResolvedValue('https://signed.example/photo.jpg');

describe('LicenceReviewQueue', () => {
  it('renders the queue oldest first with fields, pre-checks and the register link', async () => {
    const loadQueue = vi.fn().mockResolvedValue([
      row({ id: 'older', created_at: '2026-08-30T00:00:00Z', tradie_name: 'Older Tradie' }),
      row({ id: 'newer', created_at: '2026-09-02T00:00:00Z', tradie_name: 'Newer Tradie', licence_number: '999999C' }),
    ]);
    render(<LicenceReviewQueue loadQueue={loadQueue} decide={vi.fn()} signPhoto={signPhoto} />);

    const cards = await screen.findAllByTestId('licence-review-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Older Tradie');
    expect(cards[1]).toHaveTextContent('Newer Tradie');

    expect(screen.getAllByText('123456C').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not expired').length).toBe(2);
    expect(screen.getAllByText('Class covers trade').length).toBe(2);

    const links = screen.getAllByRole('link', { name: /open state register/i });
    expect(links[0]).toHaveAttribute('href', 'https://reg.example/?n=123456C');
    expect(links[1]).toHaveAttribute('href', 'https://reg.example/?n=999999C');

    await waitFor(() => expect(signPhoto).toHaveBeenCalledWith('u1/photo.jpg'));
  });

  it('disables both decision buttons while a decision is in flight, then removes the card', async () => {
    let resolveDecision: (v: unknown) => void = () => {};
    const decide = vi.fn().mockImplementation(() => new Promise((res) => { resolveDecision = res; }));
    const loadQueue = vi.fn().mockResolvedValue([row()]);
    render(<LicenceReviewQueue loadQueue={loadQueue} decide={decide} signPhoto={signPhoto} />);

    const verified = await screen.findByRole('button', { name: /^verified$/i });
    const rejected = screen.getByRole('button', { name: /^rejected$/i });
    await userEvent.click(verified);

    expect(decide).toHaveBeenCalledWith({ verification_id: 'v1', decision: 'verified', rejection_reason: undefined });
    expect(verified).toBeDisabled();
    expect(rejected).toBeDisabled();

    resolveDecision({ ok: true });
    await waitFor(() => expect(screen.queryByTestId('licence-review-card')).not.toBeInTheDocument());
    expect(screen.getByText(/no licences waiting for review/i)).toBeInTheDocument();
  });

  it('requires a reason to reject and sends it', async () => {
    const decide = vi.fn().mockResolvedValue({ ok: true });
    render(<LicenceReviewQueue loadQueue={vi.fn().mockResolvedValue([row()])} decide={decide} signPhoto={signPhoto} />);

    await userEvent.click(await screen.findByRole('button', { name: /^rejected$/i }));
    const select = screen.getByLabelText(/reason the tradie will see/i);
    await userEvent.selectOptions(select, 'Licence has expired');
    await userEvent.click(screen.getByRole('button', { name: /confirm rejected/i }));

    expect(decide).toHaveBeenCalledWith({ verification_id: 'v1', decision: 'rejected', rejection_reason: 'Licence has expired' });
  });

  it('V on the keyboard verifies the top card, R opens rejection', async () => {
    const decide = vi.fn().mockResolvedValue({ ok: true });
    render(<LicenceReviewQueue loadQueue={vi.fn().mockResolvedValue([row({ id: 'top' }), row({ id: 'second' })])} decide={decide} signPhoto={signPhoto} />);
    await screen.findAllByTestId('licence-review-card');

    fireEvent.keyDown(window, { key: 'r' });
    expect(await screen.findByLabelText(/reason the tradie will see/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'v' });
    await waitFor(() => expect(decide).toHaveBeenCalledWith(expect.objectContaining({ verification_id: 'top', decision: 'verified' })));
  });

  it('shows an error on the card when the decision fails, and keeps the card', async () => {
    const decide = vi.fn().mockRejectedValue(new Error('Someone else decided this licence a moment ago. Reload.'));
    render(<LicenceReviewQueue loadQueue={vi.fn().mockResolvedValue([row()])} decide={decide} signPhoto={signPhoto} />);
    await userEvent.click(await screen.findByRole('button', { name: /^verified$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/someone else decided/i);
    expect(screen.getByTestId('licence-review-card')).toBeInTheDocument();
  });
});
