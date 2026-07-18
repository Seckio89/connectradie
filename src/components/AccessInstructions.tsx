import { useEffect, useRef, useState } from 'react';
import { Lock, KeyRound, Loader2 } from 'lucide-react';
import { hasAccessInstructions } from '../lib/accessPin';
import AccessPinModal from './AccessPinModal';
import FormattedNotes from './FormattedNotes';

// ─────────────────────────────────────────────────────────────────────────────
// AccessInstructions — PIN-gated reveal of a job's access details (gate/alarm
// codes, key locations). The text is withheld server-side and only fetched
// after the viewer enters their PIN; it auto-hides after 60s.
// Renders nothing when the job has no access instructions.
// ─────────────────────────────────────────────────────────────────────────────

const REVEAL_SECONDS = 60;

export default function AccessInstructions({ jobId, className }: { jobId: string; className?: string }) {
  const [loading, setLoading] = useState(true);
  const [present, setPresent] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    hasAccessInstructions(jobId).then((r) => {
      if (!cancelled) { setPresent(!!(r.ok && r.data?.hasInstructions)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [jobId]);

  // Auto-hide countdown while revealed; clears on unmount / navigate away.
  useEffect(() => {
    if (text == null) return;
    setSecondsLeft(REVEAL_SECONDS);
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { setText(null); if (timerRef.current) window.clearInterval(timerRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [text]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-xs text-gray-400 ${className ?? ''}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking access details…
      </div>
    );
  }
  if (!present) return null;

  return (
    <div className={className}>
      {text != null ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 uppercase tracking-wide">
              <KeyRound className="w-3.5 h-3.5" /> Access instructions
            </span>
            <span className="text-[11px] text-amber-600 tabular-nums">Auto-locking in {secondsLeft}s</span>
          </div>
          {text.trim()
            ? <FormattedNotes text={text} className="text-sm text-amber-900 space-y-1" />
            : <p className="text-sm text-amber-700 italic">No access instructions were provided for this job.</p>}
          <button onClick={() => setText(null)} className="mt-2 text-xs font-medium text-amber-700 hover:text-amber-800">Hide now</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPinOpen(true)}
          className="w-full text-left rounded-xl border border-gray-200 bg-gray-50 p-3 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
              <Lock className="w-4 h-4 text-gray-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800">Tap to view access details</p>
              <p className="text-xs text-gray-500">Access codes are PIN-protected to keep your client’s property secure. Tap to enter your PIN and view.</p>
            </div>
          </div>
        </button>
      )}

      <AccessPinModal
        isOpen={pinOpen}
        onClose={() => setPinOpen(false)}
        jobId={jobId}
        onRevealed={(t) => setText(t ?? '')}
      />
    </div>
  );
}
