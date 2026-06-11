// ─────────────────────────────────────────────────────────────────────────────
// JobPostGuide — first-visit spotlight tour for clients posting their first
// job. Mirrors WelcomeGuide's overlay/spotlight pattern but scoped to the
// /post-lead flow and trimmed to four moment-of-action tips.
//
// Why a dedicated component (and not just another WelcomeGuide variant): the
// dashboard tour is "here's the layout"; this is "here's how to do this one
// thing well." Different intent, different storage key, different cadence.
// Sharing the engine isn't worth the extra coupling for a 4-step tour.
//
// Storage: localStorage key bumped with `_v1` so we can re-trigger globally
// later by bumping to _v2.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Wrench,
  Zap,
  Hammer,
  Ruler,
  DoorOpen,
  Clock,
  Camera,
  CalendarDays,
  AlertTriangle,
  PaintBucket,
} from 'lucide-react';
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

const STORAGE_KEY = 'connectradie_postlead_tour_v1';

const STEPS: TourStep[] = [
  {
    selector: '[data-tour="postlead-category"]',
    title: 'Start with the right trade',
    description:
      'Only verified tradies in this category will see your job — so picking the right one matters.',
    hints: [
      { icon: Wrench, text: 'Plumber — taps, pipes, hot water' },
      { icon: Zap, text: 'Electrician — power, lights, switchboards' },
      { icon: Hammer, text: 'Carpenter — timber, decks, doors' },
      { icon: PaintBucket, text: 'Painter — interiors, exteriors, fences' },
    ],
    position: 'bottom',
  },
  {
    selector: '[data-tour="postlead-description"]',
    title: 'Detail = better quotes',
    description:
      'Vague descriptions get vague quotes. The more you tell tradies up front, the closer their price will be to the final.',
    hints: [
      { icon: Ruler, text: 'Size and dimensions' },
      { icon: Wrench, text: 'Materials or finish you want' },
      { icon: DoorOpen, text: 'Access notes (gates, stairs, parking)' },
      { icon: Clock, text: 'Timeline or urgency' },
    ],
    position: 'top',
  },
  {
    selector: '[data-tour="postlead-photos"]',
    title: 'Photos do half the work',
    description:
      'Jobs with photos get more quotes and tighter prices. Even one good shot helps tradies scope the work.',
    hints: [
      { icon: Camera, text: 'A wide shot of the area' },
      { icon: Camera, text: 'A close-up of the problem' },
      { icon: AlertTriangle, text: 'Anything unusual — hazards, tight access' },
    ],
    position: 'top',
  },
  {
    selector: '[data-tour="postlead-schedule"]',
    title: 'Urgent or flexible?',
    description:
      'Pick the timing that matches the job. Urgent reaches tradies instantly; flexible gets better prices.',
    hints: [
      { icon: Zap, text: 'Urgent — bursts, leaks, lockouts, no power' },
      { icon: CalendarDays, text: 'Flexible — renovations, paint jobs, deck builds' },
    ],
    position: 'top',
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function JobPostGuide() {
  const [visible, setVisible] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Defer first paint so the form mounts and data-tour anchors exist in DOM.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = localStorage.getItem(STORAGE_KEY);
    if (seen) return;
    const timer = setTimeout(() => setVisible(true), 700);
    return () => clearTimeout(timer);
  }, []);

  // Lock background scroll while the guide is open. Mirrors BetaModal's
  // approach — without this, mobile users (especially iOS) can scroll the
  // underlying form while the spotlight stays pinned, making the highlighted
  // anchor drift visually away from the cut-out.
  useEffect(() => {
    if (!visible) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [visible]);

  // Only include steps whose target is currently in the DOM (the form has
  // multiple branches — e.g. job-type selection screen vs. the actual form).
  const [resolvedSteps, setResolvedSteps] = useState<TourStep[]>([]);

  useEffect(() => {
    if (!showTour) return;
    const timer = setTimeout(() => {
      const available = STEPS.filter((s) => {
        const el = document.querySelector(s.selector) as HTMLElement | null;
        return el && el.offsetHeight > 0;
      });
      setResolvedSteps(available);
    }, 120);
    return () => clearTimeout(timer);
  }, [showTour]);

  const steps = resolvedSteps.length > 0 ? resolvedSteps : STEPS;

  const updateTargetRect = useCallback(() => {
    if (!showTour || steps.length === 0) return;
    const current = steps[step];
    if (!current) return;
    const el = document.querySelector(current.selector) as HTMLElement | null;
    if (el && el.offsetHeight > 0) {
      const rect = el.getBoundingClientRect();
      setTargetRect({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      });
    } else if (step < steps.length - 1) {
      setStep(step + 1);
      setTargetRect(null);
    }
  }, [showTour, step, steps]);

  useEffect(() => {
    if (!showTour || steps.length === 0) return;
    const current = steps[step];
    if (!current) return;
    const el = document.querySelector(current.selector) as HTMLElement | null;
    if (el && el.offsetHeight > 0) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // localStorage disabled — accept that the modal may reappear next visit.
    }
  };

  if (!visible) return null;

  // ─── Intro ask screen ──────────────────────────────────────
  if (!showTour) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-gray-900/40" onClick={dismiss} />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
          <button
            onClick={dismiss}
            className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors z-10"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="px-6 pt-8 pb-6 text-center">
            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-7 h-7 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              First time posting?
            </h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              Four quick tips for getting the best quotes. Takes about 30 seconds.
            </p>

            <div className="mt-6 space-y-2.5">
              <button
                onClick={() => setShowTour(true)}
                className="w-full py-2.5 px-4 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 transition-colors shadow-sm"
              >
                Show me how
              </button>
              <button
                onClick={dismiss}
                className="w-full py-2.5 px-4 bg-gray-50 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-100 border border-gray-200 transition-colors"
              >
                Skip, I&apos;ve got it
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Spotlight tour ────────────────────────────────────────
  const current = steps[step];
  if (!current) return null;
  const isLast = step === steps.length - 1;
  const pad = 8;

  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const viewTop = targetRect.top - scrollY;
    const viewLeft = targetRect.left - scrollX;

    const tooltipW = 340;
    const tooltipH = tooltipRef.current?.offsetHeight || 320;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    let top = 0;
    let left = 0;

    switch (current.position) {
      case 'bottom':
        top = viewTop + targetRect.height + pad + margin;
        left = viewLeft + targetRect.width / 2 - tooltipW / 2;
        break;
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

    if (top + tooltipH > vh - margin) top = vh - margin - tooltipH;
    if (top < margin) top = margin;
    if (left + tooltipW > vw - margin) left = vw - margin - tooltipW;
    if (left < margin) left = margin;

    return { position: 'fixed', top, left };
  };

  const renderSpotlight = () => {
    if (!targetRect) return null;
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const x = targetRect.left - scrollX - pad;
    const y = targetRect.top - scrollY - pad;
    const w = targetRect.width + pad * 2;
    const h = targetRect.height + pad * 2;
    const r = 12;

    return (
      <svg
        className="fixed inset-0 w-full h-full z-[60] pointer-events-none"
        style={{ width: '100vw', height: '100vh' }}
      >
        <defs>
          <mask id="postlead-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect x={x} y={y} width={w} height={h} rx={r} ry={r} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(17,24,39,0.5)" mask="url(#postlead-tour-mask)" />
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={r}
          ry={r}
          fill="none"
          strokeWidth="2"
          className="animate-pulse"
          style={{ stroke: '#10b981' }}
        />
      </svg>
    );
  };

  return (
    <>
      {renderSpotlight()}
      <div className="fixed inset-0 z-[60]" onClick={dismiss} />

      <div
        ref={tooltipRef}
        className="z-[70] bg-white rounded-2xl shadow-2xl border border-gray-100 w-[340px] overflow-hidden"
        style={getTooltipStyle()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={dismiss}
          className="absolute top-3.5 right-3.5 p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors z-10"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="px-5 pt-4 pb-2">
          <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-1.5">
            Tip {step + 1} of {steps.length}
          </p>
          <h3 className="font-bold text-gray-900 text-base leading-tight">{current.title}</h3>
          <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{current.description}</p>
        </div>

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

        <div className="px-5 py-3.5 flex items-center justify-between border-t border-gray-100 mt-1">
          <div className="flex items-center gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`rounded-full transition-all ${
                  i === step ? 'w-5 h-1.5 bg-emerald-500' : 'w-1.5 h-1.5 bg-gray-200'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Previous"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            {isLast ? (
              <button
                onClick={dismiss}
                className="px-5 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 transition-colors shadow-sm"
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
