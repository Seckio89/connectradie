import { useState, useEffect } from 'react';
import { CheckCircle2, User, MapPin, Search, Camera, FileText, Calendar, CreditCard, ChevronRight, X, Loader2, Shield, PartyPopper, UserPlus, Briefcase } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { createConnectOnboardingSession, getConnectAccountDetails } from '../lib/stripe';
import { isTradeExempt } from '../lib/licensingRequirements';

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
  const [hasClients, setHasClients] = useState(false);
  const [hasTradieJobs, setHasTradieJobs] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('onboarding_checklist_dismissed') === 'true';
  });
  const [allComplete, setAllComplete] = useState(() => {
    return localStorage.getItem('onboarding_checklist_complete') === 'true';
  });
  const [showDismissWarning, setShowDismissWarning] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [stripeConnected, setStripeConnected] = useState(false);
  const { user, profile, tradieDetails, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const connectStatus = searchParams.get('connect');
    if (connectStatus === 'success' || connectStatus === 'refresh') {
      // Sync Stripe account status to DB then refresh the local profile
      getConnectAccountDetails().catch(() => {}).finally(() => refreshProfile());
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
    } catch (err: unknown) {
      console.error('Stripe Connect error:', err);
      setConnectError(err instanceof Error ? err.message : 'Failed to connect');
      setConnectLoading(false);
    }
  };

  // If the user has a Stripe account but DB hasn't been synced, check Stripe directly
  useEffect(() => {
    if (
      profile?.role === 'tradie' &&
      profile.stripe_connect_account_id &&
      !profile.stripe_connect_onboarding_complete
    ) {
      getConnectAccountDetails()
        .then((details) => {
          if (details.account?.detailsSubmitted) {
            setStripeConnected(true);
            refreshProfile();
          }
        })
        .catch(() => {});
    } else if (profile?.stripe_connect_onboarding_complete) {
      setStripeConnected(true);
    }
  }, [profile?.stripe_connect_account_id, profile?.stripe_connect_onboarding_complete]);

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
      const [availRes, clientRes, jobRes] = await Promise.all([
        supabase.from('availability_slots').select('id', { count: 'exact', head: true }).eq('tradie_id', user.id).eq('status', 'available'),
        supabase.from('client_contacts').select('id', { count: 'exact', head: true }).eq('owner_id', user.id),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('tradie_id', user.id),
      ]);
      setHasAvailability((availRes.count ?? 0) > 0);
      setHasClients((clientRes.count ?? 0) > 0);
      setHasTradieJobs((jobRes.count ?? 0) > 0);
    }

    setLoading(false);
  };

  const handleDismiss = () => {
    setFadingOut(true);
    setTimeout(() => {
      setDismissed(true);
      localStorage.setItem('onboarding_checklist_dismissed', 'true');
    }, 500);
  };

  // Auto-dismiss the "all set" banner after 3 seconds with fade-out
  useEffect(() => {
    if (!allComplete || dismissed) return;
    const timer = setTimeout(() => handleDismiss(), 2500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allComplete, dismissed]);

  // If already dismissed, bail early (before loading check to avoid flicker)
  if (dismissed) return null;

  // If already completed (from localStorage), show "all set" immediately without waiting for fetch
  if (allComplete && profile) {
    return (
      <div className={`bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-200 overflow-hidden p-5 text-center transition-opacity duration-500 ${fadingOut ? 'opacity-0' : 'opacity-100'}`}>
        <div className="flex items-center justify-between mb-3">
          <div />
          <button
            onClick={handleDismiss}
            className="p-2.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/60 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <PartyPopper className="w-6 h-6 text-green-600" />
        </div>
        <h3 className="font-bold text-gray-900 text-sm">You&apos;re all set!</h3>
        <p className="text-xs text-gray-600 mt-1 mb-3">
          {profile.role === 'tradie'
            ? 'Your profile is live and clients can find you in search.'
            : "You're ready to find and hire great tradies."}
        </p>
        <button
          onClick={() => navigate(profile.role === 'tradie' ? '/work' : '/post-lead')}
          className="text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors py-2 px-3"
        >
          {profile.role === 'tradie' ? 'Browse available leads \u2192' : 'Post your first job \u2192'}
        </button>
      </div>
    );
  }

  if (loading || !profile) return null;

  const clientSteps: ChecklistStep[] = [
    {
      id: 'profile',
      label: 'Add your name and phone',
      description: 'So tradies know who they\'re quoting for',
      icon: User,
      complete: !!(profile.full_name && profile.phone),
      action: () => navigate('/settings'),
    },
    {
      id: 'address',
      label: 'Add your address',
      description: 'So we show tradies who actually work in your area',
      icon: MapPin,
      complete: !!(profile.address),
      action: () => navigate('/settings'),
    },
    {
      id: 'first-action',
      label: 'Post your first job',
      description: 'Takes 60 seconds — verified tradies will quote you directly',
      icon: Search,
      complete: hasJobs,
      action: () => navigate('/post-lead'),
    },
  ];

  const primaryTrade = profile.declared_trades?.[0] || '';
  const tradeExempt = isTradeExempt(primaryTrade);

  const abnLicenseComplete = !!profile.abn_number;

  const isVerifiedOrPending =
    profile.verification_status === 'verified' || profile.verification_status === 'pending';

  const tradieSteps: ChecklistStep[] = [
    {
      id: 'photo',
      label: 'Add a profile photo',
      description: profile.avatar_url ? 'Photo uploaded' : 'Tradies with photos get 3x more enquiries',
      icon: Camera,
      complete: !!(profile.avatar_url),
      action: () => navigate('/settings'),
    },
    {
      id: 'abn-license',
      label: tradeExempt ? 'Add your ABN' : 'Add your ABN & license',
      description: abnLicenseComplete ? 'Credentials added' : 'Required to appear in client search results',
      icon: FileText,
      complete: abnLicenseComplete,
      action: () => navigate('/settings', { state: { tab: 'professional' } }),
    },
    {
      id: 'verification',
      label: 'Get the verified badge',
      description: profile.verification_status === 'verified'
        ? 'Verification approved'
        : profile.verification_status === 'pending'
          ? 'Verification under review'
          : 'Clients trust verified tradies — earn the badge to rank higher',
      icon: Shield,
      complete: isVerifiedOrPending,
      action: () => navigate('/settings', { state: { tab: 'verification' } }),
    },
    {
      id: 'availability',
      label: 'Set when you\'re available',
      description: hasAvailability ? 'Availability set' : 'Clients can only book you when they see open time slots',
      icon: Calendar,
      complete: hasAvailability,
      action: () => {
        navigate('/dashboard');
        setTimeout(() => {
          const calEl = document.querySelector('[data-tour="calendar"]');
          if (calEl) calEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      },
    },
    {
      id: 'first-client',
      label: 'Add your first client',
      description: hasClients ? 'Client added' : 'Save a client so you can quote them and track their jobs',
      icon: UserPlus,
      complete: hasClients,
      action: () => navigate('/clients'),
    },
    {
      id: 'first-job',
      label: 'Create your first job',
      description: hasTradieJobs ? 'Job created' : 'Quote a client or take on a job to get going',
      icon: Briefcase,
      complete: hasTradieJobs,
      action: () => navigate('/clients'),
    },
    {
      id: 'payment',
      label: 'Set up payments',
      description: connectError
        ? connectError
        : stripeConnected
          ? 'Stripe connected'
          : 'Get paid straight to your bank — set this up before accepting jobs',
      icon: CreditCard,
      complete: stripeConnected,
      action: handleConnectStripe,
    },
  ];

  const steps = profile.role === 'tradie' ? tradieSteps : clientSteps;
  const completedCount = steps.filter((s) => s.complete).length;
  const percentage = Math.round((completedCount / steps.length) * 100);

  // Persist completion so it survives page navigations without flicker
  if (percentage === 100 && !allComplete) {
    localStorage.setItem('onboarding_checklist_complete', 'true');
    setAllComplete(true);
  }

  if (allComplete || percentage === 100) {
    return (
      <div className={`bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-200 overflow-hidden p-5 text-center transition-opacity duration-500 ${fadingOut ? 'opacity-0' : 'opacity-100'}`}>
        <div className="flex items-center justify-between mb-3">
          <div />
          <button
            onClick={handleDismiss}
            className="p-2.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/60 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <PartyPopper className="w-6 h-6 text-green-600" />
        </div>
        <h3 className="font-bold text-gray-900 text-sm">You&apos;re all set!</h3>
        <p className="text-xs text-gray-600 mt-1 mb-3">
          {profile.role === 'tradie'
            ? 'Your profile is live and clients can find you in search.'
            : "You're ready to find and hire great tradies."}
        </p>
        <button
          onClick={() => navigate(profile.role === 'tradie' ? '/work' : '/post-lead')}
          className="text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors py-2 px-3"
        >
          {profile.role === 'tradie' ? 'Browse available leads \u2192' : 'Post your first job \u2192'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="p-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900 text-sm">Get Started</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-primary-600">{percentage}% Setup</span>
            <button
              onClick={() => percentage < 100 ? setShowDismissWarning(true) : handleDismiss()}
              className="p-2.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Dismiss checklist"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {showDismissWarning && (
          <div className="mb-3 mx-3 sm:mx-5 p-3 bg-warm-50 border border-warm-200 rounded-lg">
            <p className="text-xs text-warm-800 mb-2">
              {profile.role === 'tradie'
                ? 'Completing setup helps clients find and trust you. Incomplete profiles rank lower in search.'
                : 'Finishing setup helps tradies respond to you faster with accurate quotes.'}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowDismissWarning(false)} className="text-xs font-medium text-warm-700 hover:text-warm-900 py-1.5 px-1">Keep going</button>
              <span className="text-gray-300">|</span>
              <button onClick={handleDismiss} className="text-xs text-gray-500 hover:text-gray-700 py-1.5 px-1">Hide anyway</button>
            </div>
          </div>
        )}
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <div className="px-5 pb-1">
        <p className="text-xs text-gray-500">
          {profile.role === 'tradie'
            ? 'Each step gets you closer to receiving leads and booking jobs'
            : 'Quick setup so tradies can find you and send accurate quotes'}
        </p>
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
                  ? 'bg-emerald-50/60 cursor-default'
                  : isPaymentLoading
                    ? 'bg-gray-50 cursor-wait'
                    : 'hover:bg-gray-50 active:scale-[0.98] cursor-pointer'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  step.complete
                    ? 'bg-emerald-100'
                    : 'bg-gray-100 group-hover:bg-primary-50'
                }`}
              >
                {step.complete ? (
                  <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" />
                ) : isPaymentLoading ? (
                  <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
                ) : (
                  <Icon className="w-4 h-4 text-gray-500 group-hover:text-primary-600 transition-colors" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium leading-tight ${
                    step.complete ? 'text-emerald-700 line-through decoration-emerald-400' : 'text-gray-900'
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