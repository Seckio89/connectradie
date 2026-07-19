// ─────────────────────────────────────────────────────────────────────────────
// SiteLocationDisclosureModal — the friendly pre-permission explainer shown
// BEFORE the OS location prompt. Doubles as the "prominent disclosure" Google
// Play REQUIRES before any background-location permission is requested: the user
// must affirmatively tap "Enable Location" before the OS "Always" prompt fires.
//
// The bolded sentence ("even when the app is closed or not in use") is mandated
// wording — do not soften or remove it without re-checking the Play location
// policy.
// ─────────────────────────────────────────────────────────────────────────────

import { MapPin, Home, CheckCircle2, AlertTriangle } from 'lucide-react';
import Modal from './Modal';

interface SiteLocationDisclosureModalProps {
  isOpen: boolean;
  onAllow: () => void;
  onDismiss: () => void;
}

const USES = [
  'Automatically check you in when you arrive at a job site',
  'Track time on site for accurate invoicing',
  'Verify completed work for your clients',
];

export default function SiteLocationDisclosureModal({
  isOpen, onAllow, onDismiss,
}: SiteLocationDisclosureModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onDismiss} maxWidth="md">
      <div className="p-6">
        <div className="flex items-start gap-3">
          {/* Map pin on a house */}
          <div className="relative w-12 h-12 rounded-2xl bg-secondary-50 flex items-center justify-center flex-shrink-0">
            <Home className="w-6 h-6 text-secondary-600" />
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center ring-2 ring-white">
              <MapPin className="w-3 h-3 text-white" />
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">Location access keeps your jobs on track</h2>
            <p className="text-sm text-gray-500 mt-0.5">Optional — you can turn this off any time in Settings.</p>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-sm font-medium text-gray-900 mb-2">ConnecTradie uses your location to:</p>
          <ul className="space-y-2">
            {USES.map((u) => (
              <li key={u} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-gray-700 leading-relaxed">{u}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-100 p-3">
          <p className="text-sm text-emerald-800 leading-relaxed">
            Your location is <span className="font-semibold">only used during active jobs</span> — we never track you outside of work hours.
          </p>
        </div>

        {/* Play-mandated background-location disclosure — keep the bold clause. */}
        <p className="mt-3 text-sm text-gray-600 leading-relaxed">
          To do this, <span className="font-semibold text-gray-900">ConnecTradie collects your location in
          the background, even when the app is closed or not in use</span> — only around job sites you’ve
          booked a visit for, to log arrival and departure.
        </p>

        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 leading-relaxed">
            Your phone may show a security warning — this is normal. Every app that uses background location
            (like Google Maps and Uber) triggers the same alert. No one is accessing your device.
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onAllow}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-600 transition-colors"
          >
            <MapPin className="w-4 h-4" /> Enable Location
          </button>
        </div>
      </div>
    </Modal>
  );
}
