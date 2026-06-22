import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ArrowRight, ArrowLeft, Sparkles, Home, UserCircle, CalendarDays, ClipboardList, MessageCircle, Settings, BarChart3, TrendingUp, Wallet, Briefcase, Search, DollarSign, Wrench, Package, Zap, Clock, Crown, Star, MapPin, FileText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface TourHint {
  icon: LucideIcon;
  text: string;
}

interface TourStep {
  selector: string;
  title: string;
  description: string;
  hints?: TourHint[];
  position: 'bottom' | 'right' | 'left' | 'top';
}

const clientTour: TourStep[] = [
  {
    selector: '[data-tour="sidebar-nav"]',
    title: 'Your Navigation Menu',
    description: 'Everything you need is in the sidebar. Here\'s what each section does:',
    hints: [
      { icon: Home, text: 'Dashboard — your home base with saved tradies' },
      { icon: Briefcase, text: 'Job Requests — track jobs you\'ve posted and quotes received' },
      { icon: Wrench, text: 'Saved Tradies — your favourite tradies in one place' },
      { icon: Package, text: 'Projects — organise larger multi-trade projects' },
      { icon: DollarSign, text: 'Payment History — view invoices and past payments' },
      { icon: MessageCircle, text: 'Messages — chat directly with your tradies' },
      { icon: Settings, text: 'Settings — update your profile and preferences' },
    ],
    position: 'bottom',
  },
  {
    selector: '[data-tour="get-quote"]',
    title: 'Post a Job — Start Here',
    description: 'This is the quickest way to get help. Post a job in under a minute and let tradies come to you:',
    hints: [
      { icon: FileText, text: 'Describe the work — tell tradies exactly what you need' },
      { icon: MapPin, text: 'Set your location — so nearby tradies can find you' },
      { icon: Zap, text: 'Receive quotes — tradies will respond with pricing' },
      { icon: Star, text: 'Compare & choose — pick the best tradie for the job' },
    ],
    position: 'bottom',
  },
  {
    selector: '[data-tour="notifications"]',
    title: 'Stay Updated',
    description: 'The notification bell keeps you informed in real time. You\'ll get alerts when:',
    hints: [
      { icon: FileText, text: 'A tradie sends you a quote for your job' },
      { icon: MessageCircle, text: 'You receive a new message from a tradie' },
      { icon: CalendarDays, text: 'A saved tradie opens up availability' },
      { icon: Star, text: 'A job is completed and ready for review' },
    ],
    position: 'bottom',
  },
  {
    selector: '[data-tour="find-tradie"]',
    title: 'Browse Tradies Directly',
    description: 'Prefer to choose a tradie yourself? Use this to search and contact them directly — no need to post a job first:',
    hints: [
      { icon: Search, text: 'Search by trade — electricians, plumbers, painters and more' },
      { icon: MapPin, text: 'Filter by location — find tradies near your address' },
      { icon: Star, text: 'Compare reviews and ratings before reaching out' },
    ],
    position: 'bottom',
  },
  {
    selector: '[data-tour="saved-tradies"]',
    title: 'Your Saved Tradies',
    description: 'When you find a tradie you like, save them with the heart icon. They\'ll appear right here on your dashboard so you can:',
    hints: [
      { icon: CalendarDays, text: 'Check their real-time availability and calendar' },
      { icon: MessageCircle, text: 'Start a chat to discuss your project' },
      { icon: TrendingUp, text: 'Compare ratings, pricing and reviews side by side' },
    ],
    position: 'bottom',
  },
  {
    selector: '[data-tour="recommended-tradies"]',
    title: 'Discover New Tradies',
    description: 'We recommend tradies based on your location and past searches. This section helps you:',
    hints: [
      { icon: MapPin, text: 'See highly-rated professionals near your postcode' },
      { icon: MessageCircle, text: 'Tap any tradie to start a conversation instantly' },
      { icon: Star, text: 'Find new options you might not have searched for' },
    ],
    position: 'left',
  },
  {
    selector: '[data-tour="onboarding-checklist"]',
    title: 'Getting Started Checklist',
    description: 'This checklist tracks your setup progress. Complete each step to unlock the full ConnecTradie experience:',
    hints: [
      { icon: UserCircle, text: 'Add your name and phone number' },
      { icon: Home, text: 'Enter your address so we can show nearby tradies' },
      { icon: Briefcase, text: 'Post your first job to start receiving quotes' },
    ],
    position: 'left',
  },
];

const tradieTour: TourStep[] = [
  {
    selector: '[data-tour="sidebar-nav"]',
    title: 'Your Navigation Menu',
    description: 'Run your business from the sidebar. Here\'s what each section does:',
    hints: [
      { icon: Home, text: 'Dashboard — your daily overview with jobs and calendar' },
      { icon: UserCircle, text: 'My Profile — how clients see you in search results' },
      { icon: ClipboardList, text: 'Work Hub — browse leads, manage jobs, and hire staff' },
      { icon: CalendarDays, text: 'Schedule — view your jobs and availability calendar' },
      { icon: MessageCircle, text: 'Messages — chat with clients about their projects' },
      { icon: BarChart3, text: 'Insights — My Stats and Performance in one dropdown' },
      { icon: Wallet, text: 'Payouts — manage your earnings and bank details' },
      { icon: Settings, text: 'Settings — update credentials, ABN and license info' },
    ],
    position: 'bottom',
  },
  {
    selector: '[data-tour="notifications"]',
    title: 'Never Miss a Lead',
    description: 'The notification bell is your lifeline for new business. You\'ll be alerted when:',
    hints: [
      { icon: Zap, text: 'A new job is posted in your area that matches your trade' },
      { icon: MessageCircle, text: 'A client sends you a message or enquiry' },
      { icon: Star, text: 'You receive a new review from a completed job' },
      { icon: CalendarDays, text: 'A client books one of your available time slots' },
    ],
    position: 'bottom',
  },
  {
    selector: '[data-tour="onboarding-checklist"]',
    title: 'Your Setup Checklist',
    description: 'Complete these steps to get verified and start appearing in client searches:',
    hints: [
      { icon: UserCircle, text: 'Add a profile photo — tradies with photos get 3x more enquiries' },
      { icon: ClipboardList, text: 'Add your ABN and license — required to appear in search' },
      { icon: TrendingUp, text: 'Get the verified badge — clients trust verified tradies' },
      { icon: CalendarDays, text: 'Set when you\'re available — clients book open slots' },
      { icon: Wallet, text: 'Set up payments — get paid straight to your bank' },
    ],
    position: 'bottom',
  },
  {
    selector: '[data-tour="jobs-tab"]',
    title: 'Jobs & Messages',
    description: 'This is your command centre for client work. Switch between tabs to:',
    hints: [
      { icon: Briefcase, text: 'Jobs — see all enquiries, active jobs and their status' },
      { icon: MessageCircle, text: 'Messages — respond to client questions and negotiate' },
    ],
    position: 'bottom',
  },
  {
    selector: '[data-tour="calendar"]',
    title: 'Your Availability Calendar',
    description: 'This is the most important part of your dashboard. Clients can only book you when they see open slots.',
    hints: [
      { icon: CalendarDays, text: 'Click any date to add available time slots' },
      { icon: ClipboardList, text: 'Green dots = available, red dots = booked' },
      { icon: Settings, text: 'Use Bulk Add to set recurring weekly hours quickly' },
    ],
    position: 'top',
  },
  {
    selector: '[data-tour="quick-stats"]',
    title: 'Track Your Performance',
    description: 'Your key business metrics at a glance. Monitor these numbers to grow your workload:',
    hints: [
      { icon: Clock, text: 'Available Hours — how much time you\'ve opened up this week' },
      { icon: CalendarDays, text: 'Booked Slots — how many of your slots clients have taken' },
      { icon: Briefcase, text: 'Active Jobs — current jobs you\'re working on' },
      { icon: Crown, text: 'Your Plan — see your subscription tier and upgrade options' },
    ],
    position: 'bottom',
  },
  {
    selector: '[data-tour="quote-insights"]',
    title: 'Business Insights',
    description: 'Understand how your business is performing with real data and tips:',
    hints: [
      { icon: BarChart3, text: 'Quote win rate — see how many quotes convert to jobs' },
      { icon: DollarSign, text: 'Revenue tracking — monitor your earnings over time' },
      { icon: TrendingUp, text: 'AI-powered tips — get suggestions to improve your profile' },
    ],
    position: 'top',
  },
];

interface WelcomeGuideProps {
  role: 'client' | 'tradie';
  userName?: string;
  forceShow?: boolean;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function WelcomeGuide({ role, userName, forceShow }: WelcomeGuideProps) {
  const storageKey = `connectradie_welcome_${role}`;
  const [visible, setVisible] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const seen = localStorage.getItem(storageKey);
    if (forceShow || !seen) {
      const timer = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(timer);
    }
  }, [storageKey, forceShow]);

  const allSteps = role === 'tradie' ? tradieTour : clientTour;

  // Filter to only steps whose target element exists and is visible
  const [visibleSteps, setVisibleSteps] = useState<TourStep[]>([]);

  useEffect(() => {
    if (!showTour) return;
    // Wait a tick for DOM to settle
    const timer = setTimeout(() => {
      const available = allSteps.filter((s) => {
        const el = document.querySelector(s.selector) as HTMLElement | null;
        return !!el;
      });
      setVisibleSteps(available);
    }, 100);
    return () => clearTimeout(timer);
  }, [showTour, allSteps]);

  const steps = visibleSteps.length > 0 ? visibleSteps : allSteps;

  const updateTargetRect = useCallback(() => {
    if (!showTour || steps.length === 0) return;
    const current = steps[step];
    if (!current) return;
    const el = document.querySelector(current.selector) as HTMLElement | null;
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      });
    } else {
      // Element not in DOM at all, skip to next step
      if (step < steps.length - 1) {
        setStep(step + 1);
      }
      setTargetRect(null);
    }
  }, [showTour, step, steps]);

  // Scroll to the target element only when the step changes (not on every scroll)
  useEffect(() => {
    if (!showTour || steps.length === 0) return;
    const current = steps[step];
    if (!current) return;
    const el = document.querySelector(current.selector) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [showTour, step, steps]);

  useEffect(() => {
    updateTargetRect();
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);
    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
    };
  }, [updateTargetRect]);

  // When the current tour step targets an element inside the sidebar, request it to open
  useEffect(() => {
    if (!showTour) return;
    const activeSteps = visibleSteps.length > 0 ? visibleSteps : allSteps;
    const currentStep = activeSteps[step];
    const sidebarSelectors = ['[data-tour="sidebar-nav"]', '[data-tour="get-quote"]'];
    const needsSidebar = currentStep != null && sidebarSelectors.includes(currentStep.selector);
    if (needsSidebar) {
      window.dispatchEvent(new CustomEvent('welcomeguide:sidebar', { detail: { open: true } }));
      // The sidebar DOM may not have painted yet, so force a delayed recalculation
      // of the overlay position once the sidebar is visible.
      const recalcTimer = setTimeout(() => {
        updateTargetRect();
      }, 150);
      return () => {
        clearTimeout(recalcTimer);
        window.dispatchEvent(new CustomEvent('welcomeguide:sidebar', { detail: { open: false } }));
      };
    }
    return () => {
      if (needsSidebar) {
        window.dispatchEvent(new CustomEvent('welcomeguide:sidebar', { detail: { open: false } }));
      }
    };
  }, [showTour, step, visibleSteps, allSteps, updateTargetRect]);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(storageKey, 'true');
  };

  if (!visible) return null;

  const firstName = userName?.split(' ')[0] || '';

  // ─── Ask screen ────────────────────────────────────────────
  if (!showTour) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-gray-900/40 " />

        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
          <button
            onClick={dismiss}
            className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors z-10"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="px-6 pt-8 pb-6 text-center">
            <div className="w-14 h-14 bg-warm-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-7 h-7 text-warm-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              Welcome{firstName ? `, ${firstName}` : ''}!
            </h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              {role === 'tradie'
                ? 'Your account is ready. Would you like a quick tour of your dashboard?'
                : 'Your account is ready. Would you like a quick tour of how ConnecTradie works?'}
            </p>

            <div className="mt-6 space-y-2.5">
              <button
                onClick={() => setShowTour(true)}
                className="w-full py-2.5 px-4 bg-warm-500 text-white text-sm font-semibold rounded-xl hover:bg-warm-600 transition-colors shadow-sm shadow-warm-500/20"
              >
                Show me around
              </button>
              <button
                onClick={dismiss}
                className="w-full py-2.5 px-4 bg-gray-50 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-100 border border-gray-200 transition-colors"
              >
                Skip, I'll explore on my own
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Spotlight tour ────────────────────────────────────────
  const current = steps[step];
  const isLast = step === steps.length - 1;
  const pad = 8;

  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const viewTop = targetRect.top - scrollY;
    const viewLeft = targetRect.left - scrollX;

    const tooltipW = 340;
    const tooltipH = tooltipRef.current?.offsetHeight || 350;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    let top = 0;
    let left = 0;

    switch (current.position) {
      case 'bottom': {
        top = viewTop + targetRect.height + pad + margin;
        left = viewLeft + targetRect.width / 2 - tooltipW / 2;
        // When the target is inside the sidebar, place the tooltip just to
        // the right of the sidebar so it doesn't awkwardly straddle or
        // overlap sidebar content if viewport clamping pushes it upward.
        const sidebar = document.querySelector('aside');
        if (sidebar) {
          const sidebarRect = sidebar.getBoundingClientRect();
          if (viewLeft >= sidebarRect.left && viewLeft < sidebarRect.right) {
            left = sidebarRect.right + margin;
          }
        }
        break;
      }
      case 'top':
        top = viewTop - pad - margin - tooltipH;
        left = viewLeft + targetRect.width / 2 - tooltipW / 2;
        break;
      case 'right':
        top = viewTop + targetRect.height / 2 - tooltipH / 2;
        left = viewLeft + targetRect.width + pad + margin;
        break;
      case 'left':
        top = viewTop + targetRect.height / 2 - tooltipH / 2;
        left = viewLeft - pad - margin - tooltipW;
        break;
    }

    // Clamp to viewport so the tooltip is never cut off
    if (top + tooltipH > vh - margin) top = vh - margin - tooltipH;
    if (top < margin) top = margin;
    if (left + tooltipW > vw - margin) left = vw - margin - tooltipW;
    if (left < margin) left = margin;

    return { position: 'fixed', top, left };
  };

  const getOverlaySvg = () => {
    if (!targetRect) return null;

    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    let x = targetRect.left - scrollX - pad;
    const y = targetRect.top - scrollY - pad;
    let w = targetRect.width + pad * 2;
    const h = targetRect.height + pad * 2;
    const r = 12;

    // When the target lives inside the sidebar, snap the highlight
    // horizontally to the full sidebar width for a flush appearance
    const sidebar = document.querySelector('aside');
    if (sidebar) {
      const sidebarRect = sidebar.getBoundingClientRect();
      const elViewLeft = targetRect.left - scrollX;
      // Only adjust when the target element lives inside the sidebar
      if (elViewLeft >= sidebarRect.left && elViewLeft < sidebarRect.right) {
        x = sidebarRect.left;
        w = sidebarRect.width;
      }
    }

    return (
      <svg className="fixed inset-0 w-full h-full z-[60] pointer-events-none" style={{ width: '100vw', height: '100vh' }}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect x={x} y={y} width={w} height={h} rx={r} ry={r} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(17,24,39,0.5)" mask="url(#tour-mask)" />
        <rect
          x={x} y={y} width={w} height={h} rx={r} ry={r}
          fill="none" strokeWidth="2" className="animate-pulse"
          style={{ stroke: '#f97316' }}
        />
      </svg>
    );
  };

  return (
    <>
      {getOverlaySvg()}

      {/* Non-interactive backdrop — tour closes only via X button or completing all steps */}
      <div className="fixed inset-0 z-[60]" />

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="z-[70] bg-white rounded-2xl shadow-2xl border border-gray-100 w-[min(340px,calc(100vw-24px))] overflow-hidden"
        style={getTooltipStyle()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={dismiss}
          className="absolute top-2.5 right-2.5 p-2.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors z-10 min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Header */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-xs font-bold text-warm-500 uppercase tracking-wider mb-1.5">
            Step {step + 1} of {steps.length}
          </p>
          <h3 className="font-bold text-gray-900 text-base leading-tight">{current.title}</h3>
          <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{current.description}</p>
        </div>

        {/* Hints list */}
        {current.hints && current.hints.length > 0 && (
          <div className="px-5 pb-2 max-h-[240px] overflow-y-auto">
            <div className="space-y-1.5 mt-1">
              {current.hints.map((hint, i) => {
                const HintIcon = hint.icon;
                return (
                  <div key={i} className="flex items-start gap-2.5 py-1">
                    <HintIcon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span className="text-[13px] text-gray-600 leading-snug">{hint.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer nav */}
        <div className="px-5 py-3.5 flex items-center justify-between border-t border-gray-100 mt-1">
          <div className="flex items-center gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`rounded-full transition-all ${
                  i === step ? 'w-5 h-1.5 bg-warm-500' : 'w-1.5 h-1.5 bg-gray-200'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            {isLast ? (
              <button
                onClick={dismiss}
                className="px-5 py-2 bg-warm-500 text-white text-sm font-semibold rounded-xl hover:bg-warm-600 transition-colors shadow-sm shadow-warm-500/20"
              >
                Got it!
              </button>
            ) : (
              <button
                onClick={() => setStep(step + 1)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
              >
                Next
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}