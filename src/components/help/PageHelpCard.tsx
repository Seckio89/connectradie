// ─────────────────────────────────────────────────────────────────────────────
// PageHelpCard — a small, dismissible orientation card shown the FIRST time a
// user lands on a major page. Once dismissed it never shows again (per page +
// role, remembered in localStorage). Never blocks the UI; if there's no help
// content for the current page/role, it renders nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getHelpContent, helpKey, type HelpRole } from '../../lib/helpContent';

export default function PageHelpCard() {
  const { profile } = useAuth();
  const location = useLocation();
  const role: HelpRole | null =
    profile?.role === 'tradie' ? 'tradie' : profile?.role === 'client' ? 'client' : null;
  const content = getHelpContent(location.pathname, role);
  const key = helpKey(location.pathname, role);

  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!content) { setDismissed(true); return; }
    try {
      setDismissed(!!localStorage.getItem(key));
    } catch {
      setDismissed(false); // localStorage disabled — show, just won't persist
    }
  }, [key, content]);

  if (!content || dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="relative bg-secondary-50 border border-secondary-100 rounded-xl p-4 pr-10 mb-4 sm:mb-6">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-secondary-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{content.title}</p>
          <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">{content.intro}</p>
        </div>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-white/70 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
