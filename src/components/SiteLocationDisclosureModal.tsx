// ─────────────────────────────────────────────────────────────────────────────
// SiteLocationDisclosureModal — the in-app "prominent disclosure" Google Play
// REQUIRES before any background-location permission is requested. Shown once, in
// context (the tradie has a booked site visit), and the user must affirmatively
// tap "Allow background location" before the OS "Always" prompt is triggered.
//
// The bolded sentence ("even when the app is closed or not in use") is mandated
// wording — do not soften it without re-checking the Play location policy.
// ─────────────────────────────────────────────────────────────────────────────

import { MapPin } from 'lucide-react';
import Modal from './Modal';

interface SiteLocationDisclosureModalProps {
  isOpen: boolean;
  onAllow: () => void;
  onDismiss: () => void;
}

export default function SiteLocationDisclosureModal({
  isOpen, onAllow, onDismiss,
}: SiteLocationDisclosureModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onDismiss} maxWidth="md">
      <div className="p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary-50 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-5 h-5 text-secondary-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">Automatic job-site check-in</h2>
            <p className="text-sm text-gray-500 mt-0.5">Optional — you can turn this off any time in Settings.</p>
          </div>
        </div>

        <div className="mt-5 space-y-3 text-sm text-gray-600 leading-relaxed">
          <p>
            ConnecTradie can automatically detect when you arrive at and leave a job site you’ve
            booked a visit for — so your client is notified you’re on your way in, and your on-site
            hours are recorded accurately without you having to remember to check in.
          </p>
          <p>
            To do this, <span className="font-semibold text-gray-900">ConnecTradie collects your
            location in the background, even when the app is closed or not in use.</span> Your
            location is only checked around job sites you have a booked visit for, and only to log
            arrival and departure — never continuous tracking.
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
            <MapPin className="w-4 h-4" /> Allow background location
          </button>
        </div>
      </div>
    </Modal>
  );
}
