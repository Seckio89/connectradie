// ─────────────────────────────────────────────────────────────────────────────
// BetaModal — first-visit beta disclosure surfaced on Login + Register pages.
//
// Sets honest expectations at the exact moment a user is about to commit to an
// account: "this is beta, payments are test mode, tradie inventory is still
// being built, email us if anything breaks." The two paths it appears on are
// the only points where a casual SEO visitor turns into a real user.
//
// Persists dismissal in localStorage so a returning user is not pestered. The
// `v1` suffix on the storage key lets us re-trigger the modal for everyone
// (e.g. when launch status changes) by bumping to `v2`.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { X, CreditCard, Users, Mail } from 'lucide-react';

const STORAGE_KEY = 'connectradie-beta-acknowledged-v1';

export default function BetaModal() {
  const [show, setShow] = useState(false);

  // Show modal on mount unless the user has already acknowledged it.
  // Short delay so it does not feel jarring against the page transition.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const acknowledged = localStorage.getItem(STORAGE_KEY);
    if (acknowledged) return;
    const timer = setTimeout(() => setShow(true), 400);
    return () => clearTimeout(timer);
  }, []);

  // Esc closes the modal. Body scroll lock prevents background jitter on iOS.
  useEffect(() => {
    if (!show) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    window.addEventListener('keydown', onEsc);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onEsc);
      document.body.style.overflow = prevOverflow;
    };
  }, [show]);

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // localStorage may be disabled (private browsing strict mode). Silent
      // fallback — the modal will reappear next visit, which is acceptable.
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="beta-modal-title"
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-amber-50 to-warm-50/40 border-b border-amber-100">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl leading-none" aria-hidden="true">🚧</span>
            <h2 id="beta-modal-title" className="text-lg font-bold text-gray-900">
              ConnecTradie is in beta
            </h2>
          </div>
          <p className="text-sm text-gray-600 mt-1 ml-9">
            Thanks for checking us out early. Three things to know first.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Payments are in test mode</p>
              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                No real money will be charged or paid yet. If you test checkout, use card{' '}
                <code className="px-1 py-0.5 bg-gray-100 rounded text-gray-900 text-[11px] font-mono">
                  4242 4242 4242 4242
                </code>
                .
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-secondary-50 flex items-center justify-center">
              <Users className="w-4 h-4 text-secondary-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Tradies are still being onboarded</p>
              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                You can post a job, but verified tradies in your suburb may not yet be on the platform. We&apos;re onboarding professionals across Australia daily.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Mail className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Found a bug?</p>
              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                Email{' '}
                <a
                  href="mailto:admin@connectradie.com"
                  className="text-emerald-700 hover:text-emerald-800 font-medium"
                  onClick={(e) => e.stopPropagation()}
                >
                  admin@connectradie.com
                </a>
                {' '}— we read every message and ship fixes fast.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={handleDismiss}
            className="w-full px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-colors text-sm shadow-sm"
          >
            Got it, let me continue
          </button>
        </div>
      </div>
    </div>
  );
}
