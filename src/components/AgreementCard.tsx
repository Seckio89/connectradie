import { useState, useEffect } from 'react';
import { Calendar, DollarSign, Plus, FileText, Pause, MoreVertical } from 'lucide-react';
import { getMonthlyTotal, pauseAgreement, endAgreement, type MonthlyTotal } from '../lib/ongoingServices';
import type { ServiceAgreement } from '../types/database';
import LogVisitModal from './LogVisitModal';

interface AgreementCardProps {
  agreement: ServiceAgreement & { client?: { full_name: string }; tradie?: { full_name: string } };
  userRole: 'client' | 'tradie';
  onRefresh: () => void;
  onGenerateInvoice?: (agreement: ServiceAgreement) => void;
}

export default function AgreementCard({ agreement, userRole, onRefresh, onGenerateInvoice }: AgreementCardProps) {
  const [showLogVisit, setShowLogVisit] = useState(false);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyTotal | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  useEffect(() => {
    const now = new Date();
    getMonthlyTotal(agreement.id, now.getFullYear(), now.getMonth() + 1)
      .then(setMonthlyStats)
      .catch(() => { /* ignore */ });
  }, [agreement.id]);

  const refreshStats = () => {
    const now = new Date();
    getMonthlyTotal(agreement.id, now.getFullYear(), now.getMonth() + 1)
      .then(setMonthlyStats)
      .catch(() => { /* ignore */ });
    onRefresh();
  };

  const currentMonth = new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  const otherPartyName = userRole === 'tradie'
    ? agreement.client?.full_name || 'Client'
    : agreement.tradie?.full_name || 'Tradie';

  const freqLabel: Record<string, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    fortnightly: 'Fortnightly',
    monthly: 'Monthly',
    as_needed: 'As needed',
  };

  return (
    <>
      <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ct-paper truncate">{agreement.title}</h3>
            <p className="text-xs text-ct-mute truncate">{otherPartyName}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="px-3 py-1 bg-ct-teal/[0.14] text-ct-teal text-xs font-medium rounded-full">
              Active
            </span>
            {userRole === 'tradie' && (
              <div className="relative">
                <button onClick={() => setShowMenu(!showMenu)} className="p-1 text-ct-mute hover:text-ct-mute-2 rounded-ct-xs transition-colors">
                  <MoreVertical className="w-4 h-4" />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => { setShowMenu(false); setConfirmEnd(false); }} />
                    <div className="absolute right-0 mt-1 w-48 bg-ct-surface rounded-ct-sm shadow-lg border border-ct-line z-20 py-1">
                      <button
                        onClick={async () => { await pauseAgreement(agreement.id); setShowMenu(false); onRefresh(); }}
                        className="w-full px-3 py-2 text-left text-sm text-ct-mute-2 hover:bg-ct-surface-2 flex items-center gap-2"
                      >
                        <Pause className="w-3.5 h-3.5 text-ct-mute" />
                        Pause
                      </button>
                      {!confirmEnd ? (
                        <button
                          onClick={() => setConfirmEnd(true)}
                          className="w-full px-3 py-2 text-left text-sm text-ct-rose hover:bg-ct-rose/[0.13] flex items-center gap-2"
                        >
                          End Agreement
                        </button>
                      ) : (
                        <div className="px-3 py-2 space-y-2">
                          <p className="text-xs text-ct-mute-2">Are you sure?</p>
                          <div className="flex gap-2">
                            <button
                              onClick={async () => { await endAgreement(agreement.id); setShowMenu(false); setConfirmEnd(false); onRefresh(); }}
                              className="px-2.5 py-1 bg-ct-rose/[0.13]0 text-ct-ink text-xs font-medium rounded-ct-xs hover:bg-ct-rose transition-colors"
                            >
                              Yes, end it
                            </button>
                            <button
                              onClick={() => setConfirmEnd(false)}
                              className="text-xs text-ct-mute hover:text-ct-mute-2 font-medium"
                            >
                              No
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Rate & Schedule */}
        <div className="flex items-center gap-3 mb-2 text-xs text-ct-mute">
          <span className="inline-flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            ${agreement.rate_per_visit}/visit
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {(agreement.typical_frequency && freqLabel[agreement.typical_frequency]) || agreement.typical_frequency}
            {agreement.typical_day && ` (${agreement.typical_day})`}
          </span>
        </div>

        {/* Address */}
        {agreement.address && (
          <p className="text-xs text-ct-mute mb-3 truncate">
            {[agreement.address, agreement.suburb, agreement.state].filter(Boolean).join(', ')}
          </p>
        )}

        {/* This Month Summary */}
        {monthlyStats && (
          <div className="p-3 bg-ct-surface-2 rounded-ct-sm mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-ct-mute-2">{currentMonth}</span>
              <span className="text-xs text-ct-mute">{monthlyStats.visitCount} visit{monthlyStats.visitCount !== 1 ? 's' : ''}</span>
            </div>
            <p className="text-lg font-semibold text-ct-paper">
              ${monthlyStats.total.toFixed(2)}
              <span className="text-xs font-normal text-ct-mute ml-1">inc. GST</span>
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {userRole === 'tradie' && (
            <>
              <button
                onClick={() => setShowLogVisit(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-ct-teal/30 text-ct-teal text-xs font-medium rounded-ct-sm hover:bg-ct-teal/[0.14] transition-colors"
              >
                <Plus className="w-3 h-3" />
                Log Extra Visit
              </button>
              {onGenerateInvoice && (
                <button
                  onClick={() => onGenerateInvoice(agreement)}
                  className="px-3 py-2 border border-ct-line text-ct-mute-2 rounded-ct-sm hover:bg-ct-surface-2 transition-colors"
                  title="Generate Invoice"
                >
                  <FileText className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <LogVisitModal
        isOpen={showLogVisit}
        agreement={agreement}
        onClose={() => setShowLogVisit(false)}
        onSuccess={refreshStats}
      />
    </>
  );
}
