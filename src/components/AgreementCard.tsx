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
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{agreement.title}</h3>
            <p className="text-xs text-gray-500 truncate">{otherPartyName}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
              Active
            </span>
            {userRole === 'tradie' && (
              <div className="relative">
                <button onClick={() => setShowMenu(!showMenu)} className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors">
                  <MoreVertical className="w-4 h-4" />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 z-20 py-1">
                      <button
                        onClick={async () => { await pauseAgreement(agreement.id); setShowMenu(false); onRefresh(); }}
                        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Pause className="w-3.5 h-3.5 text-gray-400" />
                        Pause
                      </button>
                      <button
                        onClick={async () => { if (confirm('End this service agreement?')) { await endAgreement(agreement.id); setShowMenu(false); onRefresh(); } }}
                        className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        End Agreement
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Rate & Schedule */}
        <div className="flex items-center gap-3 mb-3 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            ${agreement.rate_per_visit}/visit
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {freqLabel[agreement.typical_frequency] || agreement.typical_frequency}
            {agreement.typical_day && ` (${agreement.typical_day})`}
          </span>
        </div>

        {/* This Month Summary */}
        {monthlyStats && (
          <div className="p-3 bg-gray-50 rounded-lg mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">{currentMonth}</span>
              <span className="text-xs text-gray-500">{monthlyStats.visitCount} visit{monthlyStats.visitCount !== 1 ? 's' : ''}</span>
            </div>
            <p className="text-lg font-semibold text-gray-900">
              ${monthlyStats.total.toFixed(2)}
              <span className="text-xs font-normal text-gray-500 ml-1">inc. GST</span>
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {userRole === 'tradie' && (
            <>
              <button
                onClick={() => setShowLogVisit(true)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500 text-white text-xs font-medium rounded-lg hover:bg-emerald-600 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Log Visit
              </button>
              {onGenerateInvoice && (
                <button
                  onClick={() => onGenerateInvoice(agreement)}
                  className="px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
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
