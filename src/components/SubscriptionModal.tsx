import { useState, useEffect } from 'react';
import {
  X,
  Check,
  Crown,
  Loader2,
  BadgeCheck,
  TrendingUp,
  Percent,
  Calendar,
  FileText,
  Layers,
  CalendarRange,
  Unlock,
  Briefcase,
  Users,
  MessageSquare,
  Shield,
  Star,
  AlertCircle,
  FlaskConical,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { FREE_LIMITS, TIER_PRICING, getCurrentTier, type SubscriptionTier } from '../lib/subscription';
import { createCheckoutSession, cancelSubscription } from '../lib/stripe';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalState = 'pricing' | 'processing' | 'success' | 'cancelling' | 'cancelled' | 'error';
type BillingCycle = 'monthly' | 'annual';

const FREE_FEATURES = [
  { text: 'Basic profile listing', icon: Users },
  { text: 'Receive direct booking requests', icon: Briefcase },
  { text: `Up to ${FREE_LIMITS.JOB_ACCEPTS_PER_MONTH} active jobs at a time`, icon: Briefcase },
  { text: `${FREE_LIMITS.LEAD_UNLOCKS_PER_MONTH} lead unlocks/month`, icon: Unlock },
  { text: 'Unlimited messaging', icon: MessageSquare },
  { text: 'Verification & credentials', icon: Shield },
  { text: 'Reviews & ratings', icon: Star },
];

const PRO_FEATURES = [
  { text: 'Everything in Free', icon: Check, highlight: false },
  { text: 'Appear in search results', icon: TrendingUp, highlight: true },
  { text: 'Up to 15 lead notifications/month', icon: Unlock, highlight: false },
  { text: 'Full job management tools', icon: Briefcase, highlight: false },
  { text: 'Invoicing & milestone tracking', icon: FileText, highlight: false },
  { text: 'Google Calendar sync', icon: Calendar, highlight: false },
  { text: 'Bulk availability management', icon: CalendarRange, highlight: false },
  { text: 'Project & milestone tracking', icon: Layers, highlight: false },
  { text: 'Verified Pro badge', icon: BadgeCheck, highlight: true },
  { text: '100% payout - zero platform fees', icon: Percent, highlight: true },
  { text: 'Priority over free users', icon: Star, highlight: true },
];

export default function SubscriptionModal({ isOpen, onClose }: SubscriptionModalProps) {
  const { user, profile, tradieDetails, refreshProfile } = useAuth();
  const [modalState, setModalState] = useState<ModalState>('pricing');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [stripeSubscription, setStripeSubscription] = useState<any>(null);
  const [trainingModeEnabled, setTrainingModeEnabled] = useState(false);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  const currentTier = getCurrentTier(tradieDetails?.subscription_tier, profile?.is_premium);

  useEffect(() => {
    if (isOpen && user) {
      loadSubscriptionData();
      loadTrainingMode();
    }
  }, [isOpen, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const subscriptionStatus = params.get('subscription');

    if (subscriptionStatus === 'success') {
      setModalState('success');
      window.history.replaceState({}, '', window.location.pathname);
      refreshProfile();
    }
  }, []);

  const loadSubscriptionData = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('stripe_subscriptions')
      .select('*')
      .eq('profile_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    setStripeSubscription(data);
  };

  const loadTrainingMode = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'training_mode_enabled')
      .maybeSingle();

    setTrainingModeEnabled(data?.value === true);
  };

  const handleUpgrade = async () => {
    if (!user) return;

    try {
      setModalState('processing');
      setErrorMessage('');
      await createCheckoutSession(billingCycle);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start checkout');
      setModalState('error');
    }
  };

  const handleTestModeSubscribe = async () => {
    if (!user || !trainingModeEnabled) return;

    try {
      setModalState('processing');
      setErrorMessage('');

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ is_premium: true })
        .eq('id', user.id);

      if (profileError) throw profileError;

      if (profile?.role === 'tradie') {
        const { error: tradieError } = await supabase
          .from('tradie_details')
          .update({ subscription_tier: 'pro' })
          .eq('profile_id', user.id);

        if (tradieError) throw tradieError;
      }

      await refreshProfile();
      setModalState('success');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to activate plan');
      setModalState('error');
    }
  };

  const handleCancel = async () => {
    if (!user) return;

    try {
      setModalState('cancelling');
      setErrorMessage('');

      if (stripeSubscription) {
        await cancelSubscription(stripeSubscription.stripe_subscription_id);
      } else {
        const { error: tradieError } = await supabase
          .from('tradie_details')
          .update({ subscription_tier: 'free' })
          .eq('profile_id', user.id);

        if (tradieError) throw tradieError;

        const { error: profileError } = await supabase
          .from('profiles')
          .update({ is_premium: false })
          .eq('id', user.id);

        if (profileError) throw profileError;
      }

      await refreshProfile();
      await loadSubscriptionData();
      setModalState('cancelled');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to cancel subscription');
      setModalState('error');
    }
  };

  const handleClose = () => {
    setModalState('pricing');
    setErrorMessage('');
    onClose();
  };

  if (!isOpen) return null;

  const showTestModeButton = trainingModeEnabled;
  const annualSavingsPro = (TIER_PRICING.pro.monthly - TIER_PRICING.pro.annualMonthly) * 12;

  const tierLabel = (tier: SubscriptionTier) => {
    if (tier === 'pro') return 'Pro';
    return 'Free';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {modalState === 'cancelling' && (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6 animate-pulse">
              <Loader2 className="w-10 h-10 text-gray-500 animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Cancelling Subscription...</h2>
            <p className="text-gray-600">Please wait while we process your cancellation.</p>
          </div>
        )}

        {modalState === 'cancelled' && (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
              <Check className="w-10 h-10 text-gray-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Subscription Cancelled</h2>
            <p className="text-gray-600 mb-4 max-w-sm">
              Your membership has been cancelled. You'll revert to the free plan at the end of your billing period.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 max-w-sm">
              <p className="text-sm text-amber-800">
                Free plan: {FREE_LIMITS.JOB_ACCEPTS_PER_MONTH} job accepts and {FREE_LIMITS.LEAD_UNLOCKS_PER_MONTH} lead unlocks per month.
                Upgrade again anytime.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {modalState === 'error' && (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Something Went Wrong</h2>
            <p className="text-gray-600 mb-8 max-w-sm">
              {errorMessage || 'An error occurred. Please try again.'}
            </p>
            <button
              onClick={() => setModalState('pricing')}
              className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {modalState === 'processing' && (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mb-6 animate-pulse">
              <Loader2 className="w-10 h-10 text-amber-600 animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Activating Pro...</h2>
            <p className="text-gray-600">Please wait while we activate your membership.</p>
          </div>
        )}

        {modalState === 'success' && (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="relative mb-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="w-10 h-10 text-green-600" />
              </div>
              <div className="absolute -top-2 -right-2 w-10 h-10 bg-amber-400 rounded-full flex items-center justify-center shadow-lg">
                <Crown className="w-5 h-5 text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Pro!</h2>
            <p className="text-gray-600 mb-8 max-w-sm">
              All Pro features are now unlocked. Your verified badge is live and clients will see you first in search results.
            </p>
            <button
              onClick={handleClose}
              className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Get Started
            </button>
          </div>
        )}

        {modalState === 'pricing' && (
          <>
            {trainingModeEnabled && (
              <div className="mx-8 mt-8 mb-0 flex items-center gap-3 px-4 py-3 bg-teal-50 border border-teal-200 rounded-xl">
                <FlaskConical className="w-5 h-5 text-teal-600 flex-shrink-0" />
                <p className="text-sm text-teal-800 font-medium">
                  Test Mode is active — subscriptions can be activated without payment.
                </p>
              </div>
            )}

            <div className="px-8 pt-8 pb-4 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-50 text-amber-700 rounded-full text-sm font-medium mb-4">
                <Crown className="w-4 h-4" />
                {currentTier !== 'free' ? `Your ${tierLabel(currentTier)} Plan` : 'Choose Your Plan'}
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {currentTier !== 'free' ? `You're on the ${tierLabel(currentTier)} Plan` : 'Grow Your Business'}
              </h2>
              <p className="text-gray-500 max-w-lg mx-auto text-sm">
                {currentTier !== 'free'
                  ? 'You have access to premium features. Manage your subscription below.'
                  : 'Choose a plan that fits where your business is at. Upgrade or cancel anytime.'}
              </p>

              <div className="mt-5 inline-flex items-center bg-gray-100 rounded-xl p-1 gap-1">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                    billingCycle === 'monthly'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle('annual')}
                  className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                    billingCycle === 'annual'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Annual
                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-md">
                    Save 20%
                  </span>
                </button>
              </div>
            </div>

            <div className="p-8 pt-4 grid md:grid-cols-2 gap-6 max-w-2xl mx-auto w-full">
              {/* Free */}
              <div className={`border-2 rounded-2xl p-6 relative flex flex-col ${
                currentTier === 'free' ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'
              }`}>
                {currentTier === 'free' && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">
                    Current Plan
                  </div>
                )}
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Users className="w-4 h-4 text-gray-600" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Free</h3>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-gray-900">$0</span>
                    <span className="text-gray-500 text-sm">/mo</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">Get started on the platform</p>
                </div>

                <div className="space-y-2.5 flex-1">
                  {FREE_FEATURES.map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <div key={feature.text} className="flex items-center gap-2.5">
                        <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <Check className="w-2.5 h-2.5 text-green-600" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Icon className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <span className="text-xs text-gray-700">{feature.text}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  disabled
                  className="w-full mt-6 py-2.5 border-2 border-gray-200 text-gray-400 text-sm font-semibold rounded-xl cursor-not-allowed"
                >
                  {currentTier === 'free' ? 'Current Plan' : 'Free Plan'}
                </button>
              </div>

              {/* Pro */}
              <div className={`border-2 rounded-2xl p-6 relative flex flex-col ${
                currentTier === 'pro'
                  ? 'border-amber-400 bg-amber-50/30'
                  : 'border-amber-300 bg-gradient-to-b from-amber-50/40 to-white shadow-lg shadow-amber-100/60'
              }`}>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-bold rounded-full uppercase tracking-wide">
                  {currentTier === 'pro' ? 'Current Plan' : 'Most Popular'}
                </div>

                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                      <Crown className="w-4 h-4 text-amber-600" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Pro</h3>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-gray-900">
                      ${billingCycle === 'annual' ? TIER_PRICING.pro.annualMonthly : TIER_PRICING.pro.monthly}
                    </span>
                    <span className="text-gray-500 text-sm">/mo</span>
                  </div>
                  {billingCycle === 'annual' && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-xs text-gray-400 line-through">${TIER_PRICING.pro.monthly}/mo</span>
                      <span className="text-xs text-green-600 font-medium">Save ${annualSavingsPro}/yr</span>
                    </div>
                  )}
                  {billingCycle === 'monthly' && (
                    <p className="text-xs text-gray-500 mt-1.5">or ${TIER_PRICING.pro.annualMonthly}/mo billed annually</p>
                  )}
                </div>

                <div className="space-y-2.5 flex-1">
                  {PRO_FEATURES.map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <div key={feature.text} className="flex items-center gap-2.5">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                          feature.highlight ? 'bg-amber-100' : 'bg-green-100'
                        }`}>
                          <Icon className={`w-2.5 h-2.5 ${feature.highlight ? 'text-amber-600' : 'text-green-600'}`} />
                        </div>
                        <span className={`text-xs ${feature.highlight ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
                          {feature.text}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {currentTier === 'pro' ? (
                  <div className="mt-6 space-y-2.5">
                    <div className="py-2.5 bg-green-100 text-green-700 text-sm font-semibold rounded-xl flex items-center justify-center gap-2">
                      <Check className="w-4 h-4" />
                      Active Plan
                    </div>
                    <button
                      onClick={handleCancel}
                      className="w-full py-2 text-xs text-gray-500 hover:text-red-600 font-medium rounded-xl hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                    >
                      Cancel Subscription
                    </button>
                  </div>
                ) : (
                  <div className="mt-6 space-y-2">
                    {showTestModeButton ? (
                      <button
                        onClick={handleTestModeSubscribe}
                        className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white text-sm font-semibold rounded-xl hover:from-teal-600 hover:to-teal-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                      >
                        <FlaskConical className="w-4 h-4" />
                        Activate Pro (Test)
                      </button>
                    ) : (
                      <button
                        onClick={handleUpgrade}
                        className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-semibold rounded-xl hover:from-amber-600 hover:to-amber-700 transition-all shadow-md hover:shadow-lg"
                      >
                        Get Pro
                        {billingCycle === 'annual' && <span className="ml-1 text-xs opacity-80">— billed ${TIER_PRICING.pro.annual}/yr</span>}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="px-8 pb-6 text-center">
              <p className="text-xs text-gray-400">
                Prices in AUD. Cancel anytime. Annual billing saves you 20%.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
