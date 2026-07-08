// ─────────────────────────────────────────────────────────────────────────────
// WorkerDetailsModal — "who's coming to my job?" for clients. Shows the
// assigned worker's professional details (name, trade, verification badges,
// certificates) via the GATED get_service_worker_details RPC. Personal contact
// (phone/email) is intentionally never returned — clients reach workers through
// in-app messaging or the business.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, BadgeCheck, UserCheck, GraduationCap, HardHat, Briefcase } from 'lucide-react';
import Modal from './Modal';
import { supabase } from '../lib/supabase';

interface WorkerDetails {
  worker_name: string | null;
  employment_type: string | null;
  trade_specialty: string | null;
  declared_trades: string[];
  verified_trades: string[];
  abn_verified: boolean;
  license_verified: boolean;
  identity_verified: boolean;
  qualifications: string[];
  white_card: string | null;
  business_name: string | null;
}

interface WorkerDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  recurringJobId: string;
}

const ROLE_LABELS: Record<string, string> = {
  employee: 'Employee',
  subcontractor: 'Subcontractor',
  apprentice: 'Apprentice',
};

export default function WorkerDetailsModal({ isOpen, onClose, recurringJobId }: WorkerDetailsModalProps) {
  const [details, setDetails] = useState<WorkerDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data, error: rpcError } = await supabase.rpc('get_service_worker_details', {
          p_recurring_job_id: recurringJobId,
        });
        if (cancelled) return;
        if (rpcError) throw rpcError;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) {
          setError('No worker is assigned to this service yet.');
        } else {
          setDetails(row as WorkerDetails);
        }
      } catch {
        if (!cancelled) setError('Could not load worker details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, recurringJobId]);

  const badges = details
    ? [
        details.abn_verified && { icon: BadgeCheck, label: 'ABN verified' },
        details.license_verified && { icon: ShieldCheck, label: 'Licence verified' },
        details.identity_verified && { icon: UserCheck, label: 'ID verified' },
      ].filter(Boolean) as { icon: typeof BadgeCheck; label: string }[]
    : [];

  const trades = details
    ? [...new Set([...(details.verified_trades || []), ...(details.declared_trades || [])])]
    : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md">
      <div className="p-6 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Loading worker details…</span>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        ) : details ? (
          <>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-secondary-100 to-secondary-200 flex items-center justify-center flex-shrink-0">
                <span className="text-xl font-bold text-secondary-800">
                  {(details.worker_name || '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 truncate">{details.worker_name}</h2>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  {details.employment_type && ROLE_LABELS[details.employment_type] && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary-100 text-secondary-700">
                      {ROLE_LABELS[details.employment_type]}
                    </span>
                  )}
                  {details.business_name && (
                    <span className="text-xs text-gray-500">of {details.business_name}</span>
                  )}
                </div>
              </div>
            </div>

            {badges.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {badges.map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </span>
                ))}
              </div>
            )}

            {(details.trade_specialty || trades.length > 0) && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Trade</p>
                <div className="flex flex-wrap gap-1.5">
                  {details.trade_specialty && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-gray-100 text-gray-700">
                      <Briefcase className="w-3 h-3" /> {details.trade_specialty}
                    </span>
                  )}
                  {trades.filter(t => t !== details.trade_specialty).map((t) => (
                    <span key={t} className="px-2.5 py-1 rounded-lg text-xs bg-gray-100 text-gray-700 capitalize">
                      {t.replace(/-/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(details.qualifications.length > 0 || details.white_card) && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Certificates</p>
                <ul className="space-y-1">
                  {details.white_card && (
                    <li className="flex items-center gap-2 text-sm text-gray-700">
                      <HardHat className="w-4 h-4 text-gray-400" /> White Card
                    </li>
                  )}
                  {details.qualifications.map((q) => (
                    <li key={q} className="flex items-center gap-2 text-sm text-gray-700">
                      <GraduationCap className="w-4 h-4 text-gray-400" /> {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-gray-400">
              Questions about a visit? Message the business through the app — workers are contacted via
              {details.business_name ? ` ${details.business_name}` : ' the business'}.
            </p>

            <button
              onClick={onClose}
              className="w-full py-3 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
