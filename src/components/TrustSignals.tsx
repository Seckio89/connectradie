// ─────────────────────────────────────────────────────────────────────────────
// TrustSignals — a small "what you get on-platform" panel surfaced at high-
// stakes decision moments (client at Accept & Pay, tradie at Submit Final).
//
// Reframes the platform from "fee being charged" to "protection being bought."
// Every signal here is a factual statement about what the platform actually
// does — no overpromise, no marketing language. Add new ones only when the
// underlying capability is real.
//
// Retention strategy: value bundle, not lock-in. See conversation thread.
// ─────────────────────────────────────────────────────────────────────────────

import { Lock, ShieldCheck, FileText, Star } from 'lucide-react';

interface TrustSignalsProps {
  role: 'client' | 'tradie';
  /** Optional caption above the list. Defaults to a role-appropriate line. */
  caption?: string;
  /** Layout: 'card' for a bordered panel, 'inline' for a single-row strip. */
  variant?: 'card' | 'inline';
  className?: string;
}

const CLIENT_SIGNALS = [
  {
    icon: Lock,
    title: 'Secure Payments',
    body: 'Your payment is held by Stripe until you approve release.',
  },
  {
    icon: ShieldCheck,
    title: 'Dispute resolution',
    body: 'If the work doesn’t match the agreement, we mediate.',
  },
  {
    icon: FileText,
    title: 'GST-compliant receipt',
    body: 'Tax-ready invoice emailed automatically.',
  },
];

const TRADIE_SIGNALS = [
  {
    icon: Lock,
    title: 'Guaranteed payment',
    body: 'Funds release to your account on client approval.',
  },
  {
    icon: ShieldCheck,
    title: 'Dispute mediation',
    body: 'We step in if there’s a disagreement.',
  },
  {
    icon: Star,
    title: 'Reputation builds on-platform',
    body: 'Reviews from this job count toward your profile.',
  },
];

export default function TrustSignals({
  role,
  caption,
  variant = 'card',
  className = '',
}: TrustSignalsProps) {
  const signals = role === 'client' ? CLIENT_SIGNALS : TRADIE_SIGNALS;
  const defaultCaption = role === 'client'
    ? 'Included when you pay through ConnecTradie'
    : 'ConnecTradie has your back';
  const captionText = caption ?? defaultCaption;

  if (variant === 'inline') {
    return (
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ct-mute-2 ${className}`}>
        {signals.map((s) => {
          const Icon = s.icon;
          return (
            <span key={s.title} className="inline-flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 text-ct-mute-2 flex-shrink-0" />
              <span className="font-medium">{s.title}</span>
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`p-3 bg-ct-surface-2/50 border border-ct-line rounded-ct-sm ${className}`}>
      <p className="text-xs font-semibold text-ct-mute-2 mb-2">{captionText}</p>
      <ul className="space-y-1.5">
        {signals.map((s) => {
          const Icon = s.icon;
          return (
            <li key={s.title} className="flex items-start gap-2 text-xs text-ct-mute-2">
              <Icon className="w-3.5 h-3.5 text-ct-mute-2 flex-shrink-0 mt-0.5" />
              <span>
                <span className="font-medium text-ct-paper">{s.title}.</span>{' '}
                {s.body}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
