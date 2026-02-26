import { useState, useEffect } from 'react';
import { CheckCircle2, User, MapPin, Search, Camera, FileText, Calendar, CreditCard, ChevronRight, X, Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { createConnectOnboardingSession } from '../lib/stripe';

interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  complete: boolean;
  action: () => void;
}

export default function OnboardingChecklist() {
  const [hasJobs, setHasJobs] = useState(false);
  const [hasAvailability, setHasAvailability] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const { user, profile, tradieDetails, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const connectStatus = searchParams.get('connect');
    if (connectStatus === 'success' || connectStatus === 'refresh') {
      refreshProfile();
      setSearchParams((prev) => {
        prev.delete('connect');
        return prev;
      }, { replace: true });
    }
  }, [searchParams]);

  const handleConnectStripe = async () => {
    setConnectLoading(true);
    setConnectError(null);
    try {
      await createConnectOnboardingSession();
    } catch (err: any) {
      console.error('Stripe Connect error:', err);
      setConnectError(err.message || 'Failed to connect');
      setConnectLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchStatus();
    }
  }, [user, profile, tradieDetails]);

  const fetchStatus = async () => {
    if (!user) return;

    if (profile?.role === 'client') {
      const { count } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', user.id);
      setHasJobs((count ?? 0) > 0);
    }

    if (profile?.role === 'tradie') {
      const { count } = await supabase
        .from('availability_slots')
        .select('id', { count: 'exact', head: true })
        .eq('tradie_id', user.id)
        .eq('status', 'available');
      setHasAvailability((count ?? 0) > 0);
    }

    setLoading(false);
  };

  if (loading || !profile) return null;

  const clientSteps: ChecklistStep[] = [
    {
      id: 'profile',
      label: 'Complete your profile',
      description: 'Add your name and phone number',
      icon: User,
      complete: !!(profile.full_name && profile.phone),
      action: () => navigate('/settings'),
    },
    {
      id: 'address',
      label: 'Add your address',
      description: 'Set a default address for faster bookings',
      icon: MapPin,
      complete: !!(profile.address),
      action: () => navigate('/settings'),
    },
    {
      id: 'first-action',
      label: 'Find a tradie or post a job',
      description: 'Search for professionals in your area',
      icon: Search,
      complete: hasJobs,
      action: () => navigate('/search'),
    },
  ];

  const tradieSteps: ChecklistStep[] = [
    {
      id: 'photo',
      label: 'Upload a profile photo',
      description: 'Help clients recognise you',
      icon: Camera,
      complete: !!(profile.avatar_url),
      action: () => navigate('/settings'),
    },
    {
      id: 'abn-license',
      label: 'Add ABN & License number',
      description: 'Build trust with your credentials',
      icon: FileText,
      complete: !!(profile.abn_number && profile.license_number),
      action: () => navigate('/settings'),
    },
    {
      id: 'availability',
      label: 'Set your weekly availability',
      description: 'Let clients know when you are free',
      icon: Calendar,
      complete: hasAvailability,
      action: () => navigate('/dashboard'),
    },
    {
      id: 'payment',
      label: 'Connect payment method',
      description: connectError
        ? connectError
        : profile.stripe_connect_onboarding_complete
          ? 'Stripe connected'
          : 'Get paid faster with Stripe',
      icon: CreditCard,
      complete: !!profile.stripe_connect_onboarding_complete,
      action: handleConnectStripe,
    },
  ];

  const steps = profile.role === 'tradie' ? tradieSteps : clientSteps;
  const completedCount = steps.filter((s) => s.complete).length;
  const percentage = Math.round((completedCount / steps.length) * 100);

  if (percentage === 100 || dismissed) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="p-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900 text-sm">Get Started</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-primary-600">{percentage}% Setup</span>
            <button
              onClick={() => setDismissed(true)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <div className="px-3 pb-3 space-y-1">
        {steps.map((step) => {
          const Icon = step.icon;
          const isPaymentStep = step.id === 'payment';
          const isPaymentLoading = isPaymentStep && connectLoading;

          return (
            <button
              key={step.id}
              onClick={step.complete || isPaymentLoading ? undefined : step.action}
              disabled={step.complete || isPaymentLoading}
              className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200 group ${
                step.complete
                  ? 'bg-green-50/60 cursor-default'
                  : isPaymentLoading
                    ? 'bg-gray-50 cursor-wait'
                    : 'hover:bg-gray-50 active:scale-[0.98] cursor-pointer'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  step.complete
                    ? 'bg-green-100'
                    : 'bg-gray-100 group-hover:bg-primary-50'
                }`}
              >
                {step.complete ? (
                  <CheckCircle2 className="w-4.5 h-4.5 text-green-600" />
                ) : isPaymentLoading ? (
                  <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
                ) : (
                  <Icon className="w-4 h-4 text-gray-500 group-hover:text-primary-600 transition-colors" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium leading-tight ${
                    step.complete ? 'text-green-700 line-through decoration-green-400' : 'text-gray-900'
                  }`}
                >
                  {step.label}
                </p>
                <p className={`text-xs mt-0.5 ${isPaymentStep && connectError ? 'text-red-500' : 'text-gray-500'}`}>
                  {isPaymentLoading ? 'Redirecting to Stripe...' : step.description}
                </p>
              </div>
              {!step.complete && !isPaymentLoading && (
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 flex-shrink-0 transition-colors" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
