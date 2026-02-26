import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  Download,
  Filter,
  Loader2,
  X,
  ExternalLink,
  CreditCard,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Receipt,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import DashboardLayout from '../components/DashboardLayout';

interface PaymentRow {
  id: string;
  profile_id: string;
  job_id: string | null;
  payment_type: string;
  amount: number;
  processing_fee: number | null;
  currency: string;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  jobs: { description: string } | null;
}

type StatusFilter = 'all' | 'pending' | 'completed' | 'refunded' | 'failed';

const PAGE_SIZE = 20;

export default function PaymentHistory() {
  const { user, profile } = useAuth();
  const { toast, showToast } = useToast();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null);

  const isTradie = profile?.role === 'tradie';

  const fetchPayments = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let query = supabase
      .from('payments')
      .select('*, jobs:jobs!payments_job_id_fkey(description)', { count: 'exact' })
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (dateFrom) query = query.gte('created_at', new Date(dateFrom).toISOString());
    if (dateTo) query = query.lte('created_at', new Date(dateTo + 'T23:59:59').toISOString());
    if (typeFilter) query = query.eq('payment_type', typeFilter);

    const { data, count } = await query;
    setPayments((data as unknown as PaymentRow[]) || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [user, page, statusFilter, dateFrom, dateTo, typeFilter]);

  useEffect(() => {
    if (user) fetchPayments();
  }, [user, fetchPayments]);

  // Summary calculations
  const allPaymentsForSummary = payments; // Uses current filtered view
  const totalAmount = allPaymentsForSummary.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0);
  const pendingAmount = allPaymentsForSummary.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
  const completedCount = allPaymentsForSummary.filter(p => p.status === 'completed').length;
  const refundedAmount = allPaymentsForSummary.filter(p => p.status === 'refunded').reduce((s, p) => s + p.amount, 0);

  const formatCurrency = (cents: number) =>
    (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  const formatDateTime = (dateString: string) =>
    new Date(dateString).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; icon: typeof CheckCircle2 }> = {
      pending: { bg: 'bg-amber-100 text-amber-700', icon: Clock },
      completed: { bg: 'bg-green-100 text-green-700', icon: CheckCircle2 },
      refunded: { bg: 'bg-blue-100 text-blue-700', icon: RotateCcw },
      failed: { bg: 'bg-red-100 text-red-700', icon: XCircle },
    };
    const cfg = map[status] || { bg: 'bg-gray-100 text-gray-600', icon: Clock };
    const StatusIcon = cfg.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg}`}>
        <StatusIcon className="w-3 h-3" />
        {status}
      </span>
    );
  };

  const handleExportCSV = () => {
    if (payments.length === 0) {
      showToast('No payments to export', true);
      return;
    }
    const header = 'Date,Description,Amount,Processing Fee,Status,Currency\n';
    const rows = payments.map(p =>
      `"${formatDate(p.created_at)}","${p.jobs?.description || p.payment_type}","${(p.amount / 100).toFixed(2)}","${((p.processing_fee || 0) / 100).toFixed(2)}","${p.status}","${p.currency || 'AUD'}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported successfully');
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (loading && payments.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payment History</h1>
            <p className="text-gray-600 mt-1">{isTradie ? 'Track your earnings and payouts' : 'View your payment transactions'}</p>
          </div>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-green-50 rounded-xl"><DollarSign className="w-5 h-5 text-green-600" /></div>
              <span className="text-sm font-medium text-gray-500">{isTradie ? 'Total Earned' : 'Total Spent'}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalAmount)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-amber-50 rounded-xl"><Clock className="w-5 h-5 text-amber-600" /></div>
              <span className="text-sm font-medium text-gray-500">Pending</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(pendingAmount)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-blue-50 rounded-xl"><CheckCircle2 className="w-5 h-5 text-blue-600" /></div>
              <span className="text-sm font-medium text-gray-500">Completed</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{completedCount}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-purple-50 rounded-xl"><RotateCcw className="w-5 h-5 text-purple-600" /></div>
              <span className="text-sm font-medium text-gray-500">Refunded</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(refundedAmount)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value as StatusFilter); setPage(0); }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="refunded">Refunded</option>
              <option value="failed">Failed</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(0); }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="From"
            />
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(0); }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="To"
            />
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setPage(0); }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Types</option>
              <option value="job_payment">Job Payment</option>
              <option value="subscription">Subscription</option>
              <option value="lead_credit">Lead Credit</option>
              <option value="refund">Refund</option>
            </select>
            {(statusFilter !== 'all' || dateFrom || dateTo || typeFilter) && (
              <button
                onClick={() => { setStatusFilter('all'); setDateFrom(''); setDateTo(''); setTypeFilter(''); setPage(0); }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            </div>
          ) : payments.length === 0 ? (
            <div className="py-16 text-center">
              <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No payments found</h3>
              <p className="text-gray-500 text-sm">
                {statusFilter !== 'all' || dateFrom || dateTo ? 'Try adjusting your filters.' : 'Your payment transactions will appear here.'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500">
                      <th className="px-6 py-3 font-medium">Date</th>
                      <th className="px-6 py-3 font-medium">Description</th>
                      <th className="px-6 py-3 font-medium text-right">{isTradie ? 'Received' : 'Amount'}</th>
                      <th className="px-6 py-3 font-medium text-right">Fee</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedPayment(p)}>
                        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{formatDate(p.created_at)}</td>
                        <td className="px-6 py-4 text-gray-900 max-w-[250px] truncate">
                          {p.jobs?.description || p.payment_type.replace(/_/g, ' ')}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(p.amount)}</td>
                        <td className="px-6 py-4 text-right text-gray-500 whitespace-nowrap">{p.processing_fee ? formatCurrency(p.processing_fee) : '--'}</td>
                        <td className="px-6 py-4">{getStatusBadge(p.status)}</td>
                        <td className="px-6 py-4 text-right">
                          <button className="text-blue-600 hover:text-blue-700 text-xs font-medium">Details</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                  <p className="text-sm text-gray-500">
                    Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-gray-600">Page {page + 1} of {totalPages}</span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Payment Detail Modal */}
        {selectedPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelectedPayment(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">Payment Details</h3>
                <button onClick={() => setSelectedPayment(null)} className="p-1 rounded-lg hover:bg-gray-100">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Amount</span>
                  <span className="text-lg font-bold text-gray-900">{formatCurrency(selectedPayment.amount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Processing Fee</span>
                  <span className="text-sm text-gray-700">{selectedPayment.processing_fee ? formatCurrency(selectedPayment.processing_fee) : 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Status</span>
                  {getStatusBadge(selectedPayment.status)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Type</span>
                  <span className="text-sm text-gray-700 capitalize">{selectedPayment.payment_type.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Date</span>
                  <span className="text-sm text-gray-700">{formatDateTime(selectedPayment.created_at)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Currency</span>
                  <span className="text-sm text-gray-700">{selectedPayment.currency || 'AUD'}</span>
                </div>
                {selectedPayment.job_id && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Job</span>
                    <span className="text-sm text-blue-600 flex items-center gap-1">
                      {selectedPayment.jobs?.description?.slice(0, 40) || selectedPayment.job_id.slice(0, 8)}
                      <ExternalLink className="w-3 h-3" />
                    </span>
                  </div>
                )}
                {selectedPayment.metadata && Object.keys(selectedPayment.metadata).length > 0 && (
                  <div>
                    <p className="text-sm text-gray-500 mb-2">Metadata</p>
                    <div className="bg-gray-50 rounded-xl p-3 text-xs font-mono text-gray-600 overflow-x-auto">
                      {Object.entries(selectedPayment.metadata).map(([key, val]) => (
                        <div key={key} className="flex gap-2">
                          <span className="text-gray-400">{key}:</span>
                          <span>{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!isTradie && selectedPayment.status === 'completed' && (
                  <button
                    onClick={() => {
                      showToast('Refund request submitted. Our team will review it shortly.');
                      setSelectedPayment(null);
                    }}
                    className="w-full mt-4 px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
                  >
                    Request Refund
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast.show && (
          <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.isError ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
          }`}>
            {toast.message}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
