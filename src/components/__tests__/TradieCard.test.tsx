import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TradieCard from '../TradieCard';
import type { TradieWithDetails } from '../../types/database';

// Mock the reviews lib
vi.mock('../../lib/reviews', () => ({
  getTradieRating: vi.fn().mockResolvedValue(null),
}));

// Mock contactGating
vi.mock('../../lib/contactGating', () => ({
  redactName: vi.fn((name: string) => name),
  extractSuburb: vi.fn(() => null),
}));

import { getTradieRating } from '../../lib/reviews';

const mockTradie = {
  id: 'tradie-1',
  email: 'john@test.com',
  full_name: 'John Smith',
  role: 'tradie',
  avatar_url: null,
  phone: null,
  address: null,
  postcode: null,
  suburb: null,
  onboarding_completed: true,
  created_at: '2024-01-01',
  verification_status: 'verified',
  declared_trades: [],
  verified_trades: [],
  is_premium: false,
  call_out_fee: null,
  show_callout_fee: false,
  callout_fee_waived_on_proceed: false,
  auto_complete_sessions: false,
  license_expiry: null,
  subscription_expiry: null,
  stripe_customer_id: null,
  stripe_connect_account_id: null,
  stripe_connect_onboarding_complete: false,
  employer_id: null,
  employment_type: 'none' as const,
  employer_status: 'none' as const,
  abn_number: null,
  abn_entity_name: null,
  abn_verified: false,
  is_gst_registered: false,
  license_number: null,
  license_state: null,
  license_verified: false,
  license_holder_name: null,
  license_api_verified: false,
  license_class: null,
  is_apprentice: false,
  supervisor_license: null,
  supervisor_name: null,
  is_license_required: false,
  documents_url: null,
  rejection_reason: null,
  push_enabled: false,
  sms_alerts_enabled: false,
  push_subscription: null,
  insurance_policy: false,
  service_radius_km: 25,
  is_emergency_available: false,
  team_size: null,
  bio: null,
  cover_photo_url: null,
  license_trades: [],
  stripe_identity_session_id: null,
  is_identity_verified: false,
  tradie_details: {
    id: 'details-1',
    profile_id: 'tradie-1',
    business_name: 'Smith Plumbing',
    trade_category: 'plumber',
    hourly_rate: 80,
    contractor_type: 'Solo',
    service_radius_km: 25,
    bio: 'Experienced plumber',
    is_verified: true,
    is_insured: true,
    is_licensed: true,
    subscription_tier: 'pro' as const,
    qualifications: ['Cert III Plumbing'],
    emergency_available: false,
    abn: null,
    license_number: null,
    insurance_provider: '',
    policy_number: '',
    insurance_document_url: null,
    trade_type: 'construction' as const,
    food_safety_cert: null,
    cookery_cert: null,
    white_card: null,
    created_at: '2024-01-01',
  },
  availability_hours: 12,
} as unknown as TradieWithDetails;

function renderCard(props: Partial<React.ComponentProps<typeof TradieCard>> = {}) {
  const defaultProps = {
    tradie: mockTradie,
    onChat: vi.fn(),
    onViewCalendar: vi.fn(),
  };

  return render(
    <MemoryRouter>
      <TradieCard {...defaultProps} {...props} />
    </MemoryRouter>
  );
}

describe('TradieCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders business name and trade category', () => {
    renderCard();

    expect(screen.getByText('Smith Plumbing')).toBeInTheDocument();
    expect(screen.getByText('plumber')).toBeInTheDocument();
  });

  it('shows availability status', () => {
    renderCard();
    expect(screen.getByText('Available This Week')).toBeInTheDocument();
  });

  it('shows limited availability when hours are low', () => {
    renderCard({
      tradie: { ...mockTradie, availability_hours: 5 },
    });
    expect(screen.getByText('Limited Availability')).toBeInTheDocument();
  });

  it('shows fully booked when no hours available', () => {
    renderCard({
      tradie: { ...mockTradie, availability_hours: 0 },
    });
    expect(screen.getByText('Busy This Week')).toBeInTheDocument();
  });

  it('shows hourly rate', () => {
    renderCard();
    expect(screen.getByText('$80/hr')).toBeInTheDocument();
  });

  it('shows verification badges', () => {
    renderCard();
    expect(screen.getByText('ID Verified')).toBeInTheDocument();
    expect(screen.getByText('Insured')).toBeInTheDocument();
    expect(screen.getByText('Licensed')).toBeInTheDocument();
  });

  it('calls onChat when Chat button is clicked', async () => {
    const user = userEvent.setup();
    const onChat = vi.fn();
    renderCard({ onChat });

    await user.click(screen.getByText('Chat'));
    expect(onChat).toHaveBeenCalledWith(mockTradie);
  });

  it('calls onViewCalendar when Check Calendar button is clicked', async () => {
    const user = userEvent.setup();
    const onViewCalendar = vi.fn();
    renderCard({ onViewCalendar });

    await user.click(screen.getByTitle('Check Calendar'));
    expect(onViewCalendar).toHaveBeenCalledWith(mockTradie);
  });

  it('shows save button when onSave is provided', () => {
    renderCard({ onSave: vi.fn(), isSaved: false });
    // The save button renders an SVG heart
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(3); // calendar + chat + save
  });

  it('displays rating when reviews exist', async () => {
    vi.mocked(getTradieRating).mockResolvedValue({
      tradie_id: 'tradie-1',
      total_reviews: 10,
      average_rating: 4.5,
      five_star_count: 6,
      four_star_count: 3,
      three_star_count: 1,
      two_star_count: 0,
      one_star_count: 0,
    });

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('4.5 (10)')).toBeInTheDocument();
    });
  });

  it('does not display rating when no reviews', async () => {
    vi.mocked(getTradieRating).mockResolvedValue(null);

    renderCard();

    await waitFor(() => {
      expect(getTradieRating).toHaveBeenCalled();
    });

    expect(screen.queryByText(/\(\d+\)/)).not.toBeInTheDocument();
  });

  it('links to tradie profile', () => {
    renderCard();
    const link = screen.getByText('Smith Plumbing').closest('a');
    expect(link).toHaveAttribute('href', '/tradie/tradie-1');
  });
});
