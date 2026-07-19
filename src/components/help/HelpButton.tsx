// ─────────────────────────────────────────────────────────────────────────────
// HelpButton — a subtle "?" in the header that opens a slide-over help drawer for
// the CURRENT page: a few short tips, a (placeholder) quick-video link, contact
// support, and page-relevant FAQs. Always available, never in the way. Content
// is role- and route-specific; pages with no specific help still get a generic
// "need a hand" panel pointing to the full Help & FAQ.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { HelpCircle, X, PlayCircle, LifeBuoy, Lightbulb, ChevronDown, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { getHelpContent, type HelpRole } from '../../lib/helpContent';
import { hasGeofenceConsent } from '../../lib/siteGeofence';

export default function HelpButton() {
  const { profile } = useAuth();
  const location = useLocation();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showSecurityHelp, setShowSecurityHelp] = useState(false);
  // Only relevant to tradies who have turned on background location.
  const locationEnabled = hasGeofenceConsent();

  const role: HelpRole | null =
    profile?.role === 'tradie' ? 'tradie' : profile?.role === 'client' ? 'client' : null;
  const content = getHelpContent(location.pathname, role);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Help"
        className="relative p-2.5 text-gray-300 hover:text-white hover:bg-navy-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
      >
        <HelpCircle className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="relative w-full max-w-sm bg-white h-full shadow-xl flex flex-col animate-in slide-in-from-right">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-secondary-600" />
                <h2 className="text-base font-semibold text-gray-900">{content?.title ?? 'Need a hand?'}</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close help"
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
              {content ? (
                <>
                  {/* Tips */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Quick tips</p>
                    <ul className="space-y-2.5">
                      {content.tips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-700 leading-relaxed">{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* FAQ */}
                  {content.faqs.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Common questions</p>
                      <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                        {content.faqs.map((faq, i) => (
                          <div key={i}>
                            <button
                              onClick={() => setOpenFaq(openFaq === i ? null : i)}
                              className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-gray-50 transition-colors"
                            >
                              <span className="text-sm font-medium text-gray-800">{faq.q}</span>
                              <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                            </button>
                            {openFaq === i && (
                              <p className="px-3.5 pb-3 text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-xl bg-secondary-50 border border-secondary-100 p-4">
                  <p className="text-sm text-gray-700 leading-relaxed break-words">
                    Looking for help with this page? Browse the full help centre below, or get in touch and we&rsquo;ll point you in the right direction.
                  </p>
                </div>
              )}

              {/* Location & privacy — only for tradies who enabled background location */}
              {locationEnabled && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Location &amp; privacy</p>
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setShowSecurityHelp((v) => !v)}
                      className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                        <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0" /> Getting a security warning?
                      </span>
                      <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${showSecurityHelp ? 'rotate-180' : ''}`} />
                    </button>
                    {showSecurityHelp && (
                      <div className="px-3.5 pb-3 text-sm text-gray-600 leading-relaxed space-y-2">
                        <p>
                          Android sometimes shows warnings like “an app is accessing your location” when
                          background location is enabled. This is your phone’s standard security alert, not a
                          breach. To stop it:
                        </p>
                        <ul className="space-y-1.5">
                          <li className="flex items-start gap-2">
                            <span className="text-secondary-500 mt-0.5">•</span>
                            <span>Open <span className="font-medium text-gray-800">Android Settings → Apps → ConnecTradie → Permissions → Location</span> and choose <span className="font-medium text-gray-800">“Allow all the time”</span>.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-secondary-500 mt-0.5">•</span>
                            <span><span className="font-medium text-gray-800">Samsung:</span> Settings → Biometrics and Security → turn off <span className="font-medium text-gray-800">App permission monitor</span> for ConnecTradie.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-secondary-500 mt-0.5">•</span>
                            <span>Set <span className="font-medium text-gray-800">Battery</span> to <span className="font-medium text-gray-800">“Unrestricted”</span> for ConnecTradie.</span>
                          </li>
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => showToast('Video walkthroughs are coming soon.')}
                  className="w-full inline-flex items-center gap-2.5 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <PlayCircle className="w-4 h-4 text-secondary-600" /> Watch a quick video
                </button>
                <Link
                  to="/help"
                  onClick={() => setOpen(false)}
                  className="w-full inline-flex items-center gap-2.5 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <LifeBuoy className="w-4 h-4 text-secondary-600" /> Contact support &amp; FAQ
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
