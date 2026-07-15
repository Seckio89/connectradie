// ─────────────────────────────────────────────────────────────────────────────
// OnboardingStageTwo — Stage 2. The nav is back, but the dashboard shows only the
// two things the user should do next — nothing else (no stats, no empty lists).
//   Tradie:  "Add your first client"  +  "Set your availability"
//   Client:  "Post your first job"    +  "Browse tradies"
// Adding a first client advances a tradie to stage 3; the other actions advance
// via auto-detect on return. A "Skip" link jumps to the full dashboard (stage 4).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, CalendarPlus, ClipboardList, Search, ArrowRight, Loader2, type LucideIcon } from 'lucide-react';
import DashboardLayout from '../DashboardLayout';
import ClientContactModal from '../ClientContactModal';
import { useAuth } from '../../contexts/AuthContext';

interface ActionCard {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}

export default function OnboardingStageTwo() {
  const { user, profile, updateProfile } = useAuth();
  const navigate = useNavigate();
  const isTradie = profile?.role === 'tradie';
  const [showAddClient, setShowAddClient] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const handleSkip = async () => {
    setSkipping(true);
    const { error } = await updateProfile({ onboarding_stage: 4 });
    if (error) setSkipping(false);
  };

  const onClientAdded = async () => {
    setShowAddClient(false);
    await updateProfile({ onboarding_stage: 3 }); // → full dashboard + getting-started card
  };

  const cards: ActionCard[] = isTradie
    ? [
        {
          icon: UserPlus,
          title: 'Add your first client',
          description: 'Save a client so you can quote them and send invoices.',
          onClick: () => setShowAddClient(true),
        },
        {
          icon: CalendarPlus,
          title: 'Set your availability',
          description: 'Open up time slots so clients can find and book you.',
          onClick: () => navigate('/schedule'),
        },
      ]
    : [
        {
          icon: ClipboardList,
          title: 'Post your first job',
          description: 'Tell us what you need and get quotes from local tradies.',
          onClick: () => navigate('/post-lead'),
        },
        {
          icon: Search,
          title: 'Browse tradies',
          description: 'Explore verified tradies in your area.',
          onClick: () => navigate('/search'),
        },
      ];

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">You&rsquo;re all set up</h1>
          <p className="text-sm text-gray-600 mt-1">Here&rsquo;s what to do next — pick one to get going.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map((card) => (
            <button
              key={card.title}
              onClick={card.onClick}
              className="group text-left bg-white rounded-2xl border border-gray-200 shadow-sm p-6 hover:border-warm-300 hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-warm-50 flex items-center justify-center mb-4 group-hover:bg-warm-100 transition-colors">
                <card.icon className="w-6 h-6 text-warm-600" />
              </div>
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-1.5">
                {card.title}
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-warm-500 group-hover:translate-x-0.5 transition-all" />
              </h2>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">{card.description}</p>
            </button>
          ))}
        </div>

        <div className="text-center mt-6">
          <button
            onClick={handleSkip}
            disabled={skipping}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium inline-flex items-center gap-1 disabled:opacity-60"
          >
            {skipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Skip setup, go to dashboard <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showAddClient && user && (
        <ClientContactModal
          isOpen={showAddClient}
          onClose={() => setShowAddClient(false)}
          onSaved={onClientAdded}
          ownerId={user.id}
          editContact={null}
        />
      )}
    </DashboardLayout>
  );
}
