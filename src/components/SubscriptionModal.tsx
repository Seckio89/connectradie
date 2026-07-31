import { useState, useEffect } from 'react';
import { friendlyError } from '../lib/utils';
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
  Sparkles,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { TIER_PRICING, getCurrentTier, type SubscriptionTier } from '../lib/subscription';
import { createCheckoutSession, cancelSubscription } from '../lib/stripe';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalState = 'pricing' | 'processing' | 'success' | 'cancelling' | 'cancelled' | 'error';
type BillingCycle = 'monthly' | 'annual';

const FREE_FEATURES = [
  { text: 'Unlimited job accepts', icon: Briefcase },
  { text: 'Unlimited lead unlocks', icon: Unlock },
  { text: 'Messaging with clients', icon: MessageSquare },
  { text: 'Basic profile listing', icon: Users },
  { text: 'Reviews & ratings', icon: Star },
  { text: 'Verification badges', icon: Shield },
  { text: 'Invoicing & tax invoices', icon: FileText },
  { text: 'No per-lead fees or lock-in', icon: Check },
];

const PRO_FEATURES = [
  { text: 'Everything in Free, plus:', icon: Check, highlight: false },
  { text: 'Unlimited AI quote estimates', icon: Sparkles, highlight: true },
  { text: 'Business name shown to clients', icon: BadgeCheck, highlight: true },
  { text: 'Priority in search results', icon: TrendingUp, highlight: true },
  { text: 'Verified Pro badge', icon: BadgeCheck, highlight: true },
  { text: 'Recurring services & auto-invoicing', icon: CalendarRange, highlight: false },
  { text: 'Project & milestone tracking', icon: Layers, highlight: false },
  { text: 'Google Calendar sync', icon: Calendar, highlight: false },
  { text: 'Bulk availability management', icon: CalendarRange, highlight: false },
  { text: 'Team management', icon: Users, highlight: false },
  { text: 'Advanced analytics', icon: TrendingUp, highlight: false },
];

// Pro+ features kept for future use — not shown in modal yet

export default function SubscriptionModal({ isOpen, onClose }: SubscriptionModalProps) {
  const { user, profile, tradieDetails, refreshProfile } = useAuth();
  const [modalState, setModalState] = useState<ModalState>('pricing');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [stripeSubscription, setStripeSubscription] = useState<Record<string, unknown> | null>(null);
  const [hasSubscribedBefore, setHasSubscribedBefore] = useState(false);
  const [trainingModeEnabled, setTrainingModeEnabled] = useState(false);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  const currentTier = getCurrentTier(tradieDetails?.subscription_tier, profile?.is_premium);

  // A first-time subscriber gets a 14-day free trial; the checkout function is
  // the source of truth on eligibility, this just keeps the CTA honest.
  const trialEligible = currentTier === 'free' && !hasSubscribedBefore;
  const isTrialing = (stripeSubscription?.status as string | undefined) === 'trialing';
  const trialConvertsOn = stripeSubscription?.current_period_end
    ? new Date(stripeSubscription.current_period_end as string).toLocaleDateString('en-AU', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : null;

  useEffect(() => {
    if (isOpen && user) {
      loadSubscriptionData();
      loadTrainingMode();
    }
  }, [isOpen, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const subscriptionStatus = params.get('subscription');

    if (subscriptionStatus !== 'success') return;

    setModalState('success');
    window.history.replaceState({}, '', window.location.pathname);

    // Webhook delivery is async — poll until is_premium flips true (up to 20s)
    let attempts = 0;
    let timerId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('is_premium')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (profileRow?.is_premium) {
        await refreshProfile();
        return;
      }

      attempts++;
      if (attempts < 10) {
        timerId = setTimeout(poll, 2000);
      } else {
        await refreshProfile();
      }
    };

    poll();

    return () => clearTimeout(timerId);
  }, []);

  const loadSubscriptionData = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('stripe_subscriptions')
      .select('*')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Has this tradie ever held a real subscription? If so, no repeat free trial.
    const subId = typeof data?.stripe_subscription_id === 'string' ? data.stripe_subscription_id : '';
    setHasSubscribedBefore(!!subId && !subId.startsWith('none_') && data?.status !== 'not_started');

    // Keep the record for the cancel / trial UI only while it's live (active or trialing).
    const live = data && ['active', 'trialing'].includes(data.status as string);
    setStripeSubscription(live ? data : null);
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
      setErrorMessage(friendlyError(error, 'Unable to start checkout. Please try again.'));
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
      setErrorMessage(friendlyError(error, 'Unable to activate your plan. Please try again.'));
      setModalState('error');
    }
  };

  const handleCancel = async () => {
    if (!user) return;

    try {
      setModalState('cancelling');
      setErrorMessage('');

      if (stripeSubscription) {
        await cancelSubscription(stripeSubscription.stripe_subscription_id as string);
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
      setErrorMessage(friendlyError(error, 'Unable to cancel your subscription. Please try again or contact support.'));
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
  const annualSavingsPro = Math.round((TIER_PRICING.pro.monthly - TIER_PRICING.pro.annualMonthly) * 12);

  const tierLabel = (tier: SubscriptionTier) => {
    // pro_plus is retired — any legacy account on it shows as "Pro".
    if (tier === 'pro' || tier === 'pro_plus') return 'Pro';
    return 'Free';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 " onClick={handleClose} />

      <div className="relative bg-ct-surface rounded-ct-lg shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-ct-mute hover:text-ct-mute-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {modalState === 'cancelling' && (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-ct-surface-2 rounded-full flex items-center justify-center mb-6 animate-pulse">
              <Loader2 className="w-10 h-10 text-ct-mute animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-ct-paper mb-2">Cancelling Subscription...</h2>
            <p className="text-ct-mute-2">Please wait while we process your cancellation.</p>
          </div>
        )}

        {modalState === 'cancelled' && (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-ct-surface-2 rounded-full flex items-center justify-center mb-6">
              <Check className="w-10 h-10 text-ct-mute-2" />
            </div>
            <h2 className="text-2xl font-bold text-ct-paper mb-2">Subscription Cancelled</h2>
            <p className="text-ct-mute-2 mb-4 max-w-sm">
              Your membership has been cancelled. You'll revert to the free plan at the end of your billing period.
            </p>
            <p className="text-sm text-ct-mute mb-8 max-w-sm">
              You'll still have access to unlimited job accepts on the free plan.
              Upgrade again anytime.
            </p>
            <button
              onClick={handleClose}
              className="px-8 py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {modalState === 'error' && (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-ct-rose/[0.13] rounded-full flex items-center justify-center mb-6">
              <AlertCircle className="w-10 h-10 text-ct-rose" />
            </div>
            <h2 className="text-2xl font-bold text-ct-paper mb-2">Something Went Wrong</h2>
            <p className="text-ct-mute-2 mb-8 max-w-sm">
              {errorMessage || 'An error occurred. Please try again.'}
            </p>
            <button
              onClick={() => setModalState('pricing')}
              className="px-8 py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {modalState === 'processing' && (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-ct-amber/[0.13] rounded-full flex items-center justify-center mb-6 animate-pulse">
              <Loader2 className="w-10 h-10 text-ct-amber animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-ct-paper mb-2">Activating Pro...</h2>
            <p className="text-ct-mute-2">Please wait while we activate your membership.</p>
          </div>
        )}

        {modalState === 'success' && (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="relative mb-6">
              <div className="w-20 h-20 bg-ct-teal/[0.14] rounded-full flex items-center justify-center">
                <Check className="w-10 h-10 text-ct-teal" />
              </div>
              <div className="absolute -top-2 -right-2 w-10 h-10 bg-ct-teal rounded-full flex items-center justify-center shadow-lg">
                <Crown className="w-5 h-5 text-ct-ink" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-ct-paper mb-2">Welcome to Pro!</h2>
            <p className="text-ct-mute-2 mb-8 max-w-sm">
              All Pro features are now unlocked. Your verified badge is live and clients will see you first in search results.
            </p>
            <button
              onClick={handleClose}
              className="px-8 py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 transition-colors"
            >
              Get Started
            </button>
          </div>
        )}

        {modalState === 'pricing' && (
          <>
            {trainingModeEnabled && (
              <div className="mx-8 mt-8 mb-0 flex items-center gap-3 px-4 py-3 bg-ct-surface-2 border border-ct-line rounded-ct-md">
                <FlaskConical className="w-5 h-5 text-ct-mute-2 flex-shrink-0" />
                <p className="text-sm text-ct-mute-2 font-medium">
                  Test Mode is active — subscriptions can be activated without payment.
                </p>
              </div>
            )}

            <div className="px-8 pt-8 pb-4 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-ct-amber/[0.13] text-ct-amber rounded-full text-sm font-medium mb-4">
                <Crown className="w-4 h-4" />
                {currentTier !== 'free'
                  ? `Your ${tierLabel(currentTier)} Plan`
                  : 'Choose Your Plan'}
              </div>
              <h2 className="text-2xl font-bold text-ct-paper mb-2">
                {currentTier !== 'free'
                  ? `You're on the ${tierLabel(currentTier)} Plan`
                  : 'Grow Your Business'}
              </h2>
              <p className="text-ct-mute max-w-lg mx-auto text-sm">
                {currentTier !== 'free'
                  ? 'You have access to premium features. Manage your subscription below.'
                  : 'Choose a plan that fits where your business is at. Upgrade or cancel anytime.'}
              </p>

              <div className="mt-5 inline-flex items-center bg-ct-surface-2 rounded-ct-md p-1 gap-1">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-5 py-2 rounded-ct-sm text-sm font-medium transition-all ${
                    billingCycle === 'monthly'
                      ? 'bg-ct-surface text-ct-paper shadow-sm'
                      : 'text-ct-mute hover:text-ct-mute-2'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle('annual')}
                  className={`px-5 py-2 rounded-ct-sm text-sm font-medium transition-all flex items-center gap-2 ${
                    billingCycle === 'annual'
                      ? 'bg-ct-surface text-ct-paper shadow-sm'
                      : 'text-ct-mute hover:text-ct-mute-2'
                  }`}
                >
                  Annual
                  <span className="px-1.5 py-0.5 bg-ct-teal/[0.14] text-ct-teal text-xs font-semibold rounded-ct-xs">
                    Save 28%
                  </span>
                </button>
              </div>
            </div>

            <div className="p-8 pt-4 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto w-full">
              {/* Free */}
              <div className={`border-2 rounded-ct-lg p-6 relative flex flex-col ${
                currentTier === 'free' ? 'border-ct-line bg-ct-surface-2/30' : 'border-ct-line'
              }`}>
                {currentTier === 'free' && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-ct-teal text-ct-ink text-xs font-bold rounded-full whitespace-nowrap">
                    Current Plan
                  </div>
                )}
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-ct-surface-2 rounded-ct-sm flex items-center justify-center">
                      <Users className="w-4 h-4 text-ct-mute-2" />
                    </div>
                    <h3 className="text-base font-semibold text-ct-paper">Free</h3>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-ct-paper">$0</span>
                    <span className="text-ct-mute text-sm">/mo</span>
                  </div>
                  <p className="text-xs text-ct-mute mt-1.5">Get listed — no per-lead fees</p>
                </div>

                {/* Fee summary */}
                <div className="mb-4 p-3 bg-ct-surface-2 rounded-ct-sm border border-ct-line-soft">
                  <div className="flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-ct-mute" />
                    <span className="text-xs font-medium text-ct-mute-2">Low platform fees on completed jobs</span>
                  </div>
                  <p className="text-[11px] text-ct-mute mt-1">Fees decrease as your job values grow. Upgrade to Pro to save more.</p>
                </div>

                <div className="space-y-2.5 flex-1">
                  {FREE_FEATURES.map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <div key={feature.text} className="flex items-center gap-2.5">
                        <div className="w-4 h-4 rounded-full bg-ct-teal/[0.14] flex items-center justify-center flex-shrink-0">
                          <Check className="w-2.5 h-2.5 text-ct-teal" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Icon className="w-3 h-3 text-ct-mute flex-shrink-0" />
                          <span className="text-xs text-ct-mute-2">{feature.text}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  disabled
                  className="w-full mt-6 py-2.5 border-2 border-ct-line text-ct-mute text-sm font-semibold rounded-ct-md cursor-not-allowed"
                >
                  {currentTier === 'free' ? 'Current Plan' : 'Free Plan'}
                </button>
              </div>

              {/* Pro */}
              <div className={`border-2 rounded-ct-lg p-6 relative flex flex-col ${
                currentTier === 'pro'
                  ? 'border-ct-teal bg-ct-amber/[0.13]/30'
                  : 'border-ct-teal/30 bg-gradient-to-b from-ct-teal/40 to-white shadow-sm'
              }`}>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-ct-teal to-ct-teal text-ct-ink text-xs font-bold rounded-full uppercase tracking-wide">
                  {currentTier === 'pro' ? 'Current Plan' : 'Most Popular'}
                </div>

                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-ct-amber/[0.13] rounded-ct-sm flex items-center justify-center">
                      <Crown className="w-4 h-4 text-ct-amber" />
                    </div>
                    <h3 className="text-base font-semibold text-ct-paper">Pro</h3>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-ct-paper">
                      ${billingCycle === 'annual' ? TIER_PRICING.pro.annualMonthly : TIER_PRICING.pro.monthly}
                    </span>
                    <span className="text-ct-mute text-sm">/mo</span>
                  </div>
                  {billingCycle === 'annual' && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-xs text-ct-mute line-through">${TIER_PRICING.pro.monthly}/mo</span>
                      <span className="text-xs text-ct-teal font-medium">Save ${annualSavingsPro}/yr</span>
                    </div>
                  )}
                  {billingCycle === 'monthly' && (
                    <p className="text-xs text-ct-mute mt-1.5">or ${TIER_PRICING.pro.annualMonthly}/mo billed annually</p>
                  )}
                </div>

                {/* Fee summary */}
                <div className="mb-4 p-3 bg-ct-amber/[0.13] rounded-ct-sm border border-ct-teal/30">
                  <div className="flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-ct-amber" />
                    <span className="text-xs font-medium text-ct-amber">Lowest platform fees — keep more of every job</span>
                  </div>
                  <p className="text-[11px] text-ct-mute mt-1">Up to 50% lower fees than free. The bigger the job, the more you save.</p>
                </div>

                <div className="space-y-2.5 flex-1">
                  {PRO_FEATURES.map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <div key={feature.text} className="flex items-center gap-2.5">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                          feature.highlight ? 'bg-ct-amber/[0.13]' : 'bg-ct-teal/[0.14]'
                        }`}>
                          <Icon className={`w-2.5 h-2.5 ${feature.highlight ? 'text-ct-amber' : 'text-ct-teal'}`} />
                        </div>
                        <span className={`text-xs ${feature.highlight ? 'text-ct-paper font-medium' : 'text-ct-mute-2'}`}>
                          {feature.text}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {currentTier === 'pro' ? (
                  <div className="mt-6 space-y-2.5">
                    {isTrialing ? (
                      <>
                        <div className="py-2.5 bg-ct-surface-2 text-ct-mute-2 text-sm font-semibold rounded-ct-md flex items-center justify-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          Free trial active
                        </div>
                        {trialConvertsOn && (
                          <p className="text-[11px] text-ct-mute text-center leading-relaxed">
                            Your card is charged on <span className="font-semibold text-ct-mute-2">{trialConvertsOn}</span> to
                            continue Pro. Cancel any time before then and you won&rsquo;t be charged.
                          </p>
                        )}
                        <button
                          onClick={handleCancel}
                          className="w-full py-2 text-xs text-ct-mute hover:text-ct-rose font-medium rounded-ct-md hover:bg-ct-rose/[0.13] border border-transparent hover:border-ct-rose/[0.34] transition-colors"
                        >
                          Cancel trial — no charge
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="py-2.5 bg-ct-teal/[0.14] text-ct-teal text-sm font-semibold rounded-ct-md flex items-center justify-center gap-2">
                          <Check className="w-4 h-4" />
                          Active Plan
                        </div>
                        <button
                          onClick={handleCancel}
                          className="w-full py-2 text-xs text-ct-mute hover:text-ct-rose font-medium rounded-ct-md hover:bg-ct-rose/[0.13] border border-transparent hover:border-ct-rose/[0.34] transition-colors"
                        >
                          Cancel Subscription
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mt-6 space-y-2">
                    {showTestModeButton ? (
                      <button
                        onClick={handleTestModeSubscribe}
                        className="w-full py-2.5 bg-gradient-to-r from-ct-surface-2 to-ct-surface-2 text-ct-ink text-sm font-semibold rounded-ct-md hover:from-ct-surface-2 hover:to-ct-surface-2 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                      >
                        <FlaskConical className="w-4 h-4" />
                        Activate Pro (Test)
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handleUpgrade}
                          className="w-full py-2.5 bg-gradient-to-r from-ct-teal to-ct-teal text-ct-ink text-sm font-semibold rounded-ct-md hover:from-ct-teal hover:to-ct-teal transition-all shadow-md hover:shadow-lg"
                        >
                          {trialEligible ? 'Start 14-day free trial' : 'Get Pro'}
                          {!trialEligible && billingCycle === 'annual' && (
                            <span className="ml-1 text-xs opacity-80">— billed ${TIER_PRICING.pro.annual}/yr</span>
                          )}
                        </button>
                        {trialEligible ? (
                          <p className="text-[11px] text-ct-mute text-center leading-relaxed">
                            Free for 14 days, then{' '}
                            <span className="font-semibold text-ct-mute-2">
                              {billingCycle === 'annual'
                                ? `$${TIER_PRICING.pro.annual}/yr`
                                : `$${TIER_PRICING.pro.monthly}/mo`}
                            </span>
                            . We&rsquo;ll email you before it ends — cancel any time during the trial and you won&rsquo;t be charged.
                          </p>
                        ) : (
                          <p className="text-[11px] text-ct-mute text-center">
                            {billingCycle === 'annual'
                              ? `Billed $${TIER_PRICING.pro.annual}/yr. Cancel anytime.`
                              : `Billed $${TIER_PRICING.pro.monthly}/mo. Cancel anytime.`}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {currentTier === 'free' && (
              <div className="mx-8 mb-4 bg-ct-surface-2 border border-ct-line rounded-ct-md p-4">
                <p className="text-xs font-semibold text-ct-mute-2 mb-2 text-center">How we compare</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-ct-surface rounded-ct-sm p-2 border border-ct-line-soft">
                    <p className="text-ct-mute mb-0.5">hipages</p>
                    <p className="font-bold text-ct-mute-2 line-through">$200-500/mo</p>
                  </div>
                  <div className="bg-ct-surface rounded-ct-sm p-2 border border-ct-line-soft">
                    <p className="text-ct-mute mb-0.5">ServiceSeeking</p>
                    <p className="font-bold text-ct-mute-2 line-through">$83-250/qtr</p>
                  </div>
                  <div className="bg-ct-amber/[0.13] rounded-ct-sm p-2 border border-ct-amber/[0.34]">
                    <p className="text-ct-amber mb-0.5 font-medium">ConnecTradie</p>
                    <p className="font-bold text-ct-amber">${TIER_PRICING.pro.monthly}/mo</p>
                  </div>
                </div>
                <p className="text-xs text-ct-mute text-center mt-2">No per-lead fees. No lock-in contracts. Cancel anytime.</p>
              </div>
            )}

            <div className="px-8 pb-6 text-center">
              <p className="text-xs text-ct-mute">
                Prices in AUD. Cancel anytime. Annual billing saves you 28%.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
