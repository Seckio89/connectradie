// ─────────────────────────────────────────────────────────────────────────────
// HelpButton — a subtle "?" in the header that opens a slide-over help drawer for
// the CURRENT page: a few short tips, a (placeholder) quick-video link, contact
// support, and page-relevant FAQs. Always available, never in the way. Content
// is role- and route-specific; pages with no specific help still get a generic
// "need a hand" panel pointing to the full Help & FAQ.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { HelpCircle, X, PlayCircle, LifeBuoy, ChevronDown, ShieldAlert } from 'lucide-react';
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
        className="relative p-2.5 text-ct-mute hover:text-ct-ink hover:bg-ct-surface rounded-ct-sm min-w-[44px] min-h-[44px] flex items-center justify-center"
      >
        <HelpCircle className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="relative w-full max-w-sm bg-ct-surface h-full shadow-xl flex flex-col animate-in slide-in-from-right">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ct-line-soft">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-ct-mute-2" />
                <h2 className="text-base font-semibold text-ct-paper">{content?.title ?? 'Need a hand?'}</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close help"
                className="p-1.5 text-ct-mute hover:text-ct-mute-2 rounded-md hover:bg-ct-surface-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
              {content ? (
                <>
                  {/* FAQ */}
                  {content.faqs.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-ct-mute uppercase tracking-wide mb-2">Common questions</p>
                      <div className="divide-y divide-ct-line-soft border border-ct-line-soft rounded-ct-md overflow-hidden">
                        {content.faqs.map((faq, i) => (
                          <div key={i}>
                            <button
                              onClick={() => setOpenFaq(openFaq === i ? null : i)}
                              className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-ct-surface-2 transition-colors"
                            >
                              <span className="text-sm font-medium text-ct-paper">{faq.q}</span>
                              <ChevronDown className={`w-4 h-4 text-ct-mute flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                            </button>
                            {openFaq === i && (
                              <p className="px-3.5 pb-3 text-sm text-ct-mute-2 leading-relaxed">{faq.a}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-ct-md bg-ct-surface-2 border border-ct-line p-4">
                  <p className="text-sm text-ct-mute-2 leading-relaxed break-words">
                    Looking for help with this page? Browse the full help centre below, or get in touch and we&rsquo;ll point you in the right direction.
                  </p>
                </div>
              )}

              {/* Location & privacy — only for tradies who enabled background location */}
              {locationEnabled && (
                <div>
                  <p className="text-xs font-medium text-ct-mute uppercase tracking-wide mb-2">Location &amp; privacy</p>
                  <div className="border border-ct-line-soft rounded-ct-md overflow-hidden">
                    <button
                      onClick={() => setShowSecurityHelp((v) => !v)}
                      className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-ct-surface-2 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-ct-paper">
                        <ShieldAlert className="w-4 h-4 text-ct-amber flex-shrink-0" /> Getting a security warning?
                      </span>
                      <ChevronDown className={`w-4 h-4 text-ct-mute flex-shrink-0 transition-transform ${showSecurityHelp ? 'rotate-180' : ''}`} />
                    </button>
                    {showSecurityHelp && (
                      <div className="px-3.5 pb-3 text-sm text-ct-mute-2 leading-relaxed space-y-2">
                        <p>
                          Android sometimes shows warnings like “an app is accessing your location” when
                          background location is enabled. This is your phone’s standard security alert, not a
                          breach. To stop it:
                        </p>
                        <ul className="space-y-1.5">
                          <li className="flex items-start gap-2">
                            <span className="text-ct-mute-2 mt-0.5">•</span>
                            <span>Open <span className="font-medium text-ct-paper">Android Settings → Apps → ConnecTradie → Permissions → Location</span> and choose <span className="font-medium text-ct-paper">“Allow all the time”</span>.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-ct-mute-2 mt-0.5">•</span>
                            <span><span className="font-medium text-ct-paper">Samsung:</span> Settings → Biometrics and Security → turn off <span className="font-medium text-ct-paper">App permission monitor</span> for ConnecTradie.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-ct-mute-2 mt-0.5">•</span>
                            <span>Set <span className="font-medium text-ct-paper">Battery</span> to <span className="font-medium text-ct-paper">“Unrestricted”</span> for ConnecTradie.</span>
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
                  className="w-full inline-flex items-center gap-2.5 px-4 py-2.5 border border-ct-line rounded-ct-sm text-sm font-medium text-ct-mute-2 hover:bg-ct-surface-2 transition-colors"
                >
                  <PlayCircle className="w-4 h-4 text-ct-mute-2" /> Watch a quick video
                </button>
                <Link
                  to="/help"
                  onClick={() => setOpen(false)}
                  className="w-full inline-flex items-center gap-2.5 px-4 py-2.5 border border-ct-line rounded-ct-sm text-sm font-medium text-ct-mute-2 hover:bg-ct-surface-2 transition-colors"
                >
                  <LifeBuoy className="w-4 h-4 text-ct-mute-2" /> Contact support &amp; FAQ
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
