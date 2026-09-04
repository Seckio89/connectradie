import { useState } from 'react';
import { Loader2, ScanLine } from 'lucide-react';
import { recordLicenceOcrConsent } from '../../lib/verification';

interface LicenceConsentScreenProps {
  onAgree: () => void;
  onTypeInstead: () => void;
}

/**
 * The consent gate before any licence photo leaves the device. Its own screen,
 * an explicit Agree button, no pre-ticked box. The copy is what the store
 * declarations and the privacy policy describe — change it there too, and bump
 * CONSENT_TEXT_VERSION_LICENCE_OCR in src/lib/verification.ts.
 */
export default function LicenceConsentScreen({ onAgree, onTypeInstead }: LicenceConsentScreenProps) {
  const [saving, setSaving] = useState<'agree' | 'decline' | null>(null);
  const [error, setError] = useState('');

  const decide = async (granted: boolean) => {
    setSaving(granted ? 'agree' : 'decline');
    setError('');
    try {
      await recordLicenceOcrConsent(granted);
      if (granted) onAgree();
      else onTypeInstead();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your choice couldn't be saved. Try again.");
      setSaving(null);
    }
  };

  return (
    <div className="space-y-5" role="region" aria-labelledby="licence-consent-title">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-ct-sm bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
          <ScanLine className="w-5 h-5 text-ct-teal" aria-hidden="true" />
        </div>
        <div>
          <h3 id="licence-consent-title" className="font-ct-display font-semibold text-lg text-ct-paper">
            We'll scan your licence to read the details
          </h3>
          <p className="text-sm text-ct-mute-2 mt-2 leading-relaxed">
            To save you typing, we send a photo of your licence to an AI reading service to pull out the licence number, name, class and expiry date. The photo is used only for this and is deleted as soon as an admin has checked your licence — usually within a few days. We keep the outcome (verified / not verified) and the expiry date, not the photo.
          </p>
          <p className="text-xs text-ct-mute mt-2">
            The reading service is Hugging Face (hosted inference). It receives the image only, never your name or account. Details in our{' '}
            <a href="/privacy#licence-verification" target="_blank" rel="noopener noreferrer" className="text-ct-teal hover:underline">privacy policy</a>.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-ct-rose" role="alert">{error}</p>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={() => decide(true)}
          disabled={saving !== null}
          className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-ct-teal text-ct-ink font-medium rounded-ct-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
        >
          {saving === 'agree' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
          Agree and continue
        </button>
        <button
          type="button"
          onClick={() => decide(false)}
          disabled={saving !== null}
          className="inline-flex items-center justify-center gap-2 px-5 py-2 border border-ct-line text-ct-mute-2 font-medium rounded-ct-sm hover:bg-ct-surface-2 hover:text-ct-paper disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
        >
          {saving === 'decline' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
          Type the details myself instead
        </button>
      </div>
    </div>
  );
}
