import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  ArrowRight,
  BarChart3,
  Target,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface QuoteStats {
  totalQuotes: number;
  pendingQuotes: number;
  wonQuotes: number;
  declinedQuotes: number;
  winRate: number;
  avgQuoteAmount: number;
  totalEarned: number;
  thisMonthQuotes: number;
  thisMonthWon: number;
}

export default function QuoteInsightsWidget() {
  const { user } = useAuth();
  const [stats, setStats] = useState<QuoteStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchStats = async () => {
    if (!user) return;

    const { data: allQuotes } = await supabase
      .from('quotes')
      .select('status, price_min, price_max, firm_price, created_at')
      .eq('tradie_id', user.id);

    if (!allQuotes) {
      setLoading(false);
      return;
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const pending = allQuotes.filter((q) => q.status === 'pending');
    const won = allQuotes.filter((q) => q.status === 'accepted');
    const declined = allQuotes.filter((q) => q.status === 'declined');
    const resolved = won.length + declined.length;
    const winRate = resolved > 0 ? Math.round((won.length / resolved) * 100) : 0;

    const avgAmount =
      allQuotes.length > 0
        ? allQuotes.reduce((sum, q) => sum + (q.firm_price || (q.price_min + q.price_max) / 2), 0) / allQuotes.length
        : 0;

    const totalEarned = won.reduce((sum, q) => sum + (q.firm_price || (q.price_min + q.price_max) / 2), 0);

    const thisMonth = allQuotes.filter((q) => q.created_at >= monthStart);
    const thisMonthWon = thisMonth.filter((q) => q.status === 'accepted');

    setStats({
      totalQuotes: allQuotes.length,
      pendingQuotes: pending.length,
      wonQuotes: won.length,
      declinedQuotes: declined.length,
      winRate,
      avgQuoteAmount: Math.round(avgAmount),
      totalEarned: Math.round(totalEarned),
      thisMonthQuotes: thisMonth.length,
      thisMonthWon: thisMonthWon.length,
    });

    setLoading(false);
  };

  if (loading || !stats) {
    return null;
  }

  if (stats.totalQuotes === 0) {
    return (
      <div className="bg-white rounded-none sm:rounded-2xl border-x-0 sm:border-x border-y sm:border border-gray-200 px-4 sm:px-6 py-4 sm:py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-secondary-100 rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5 text-secondary-600" />
          </div>
          <h3 className="font-semibold text-gray-900">Quote Activity</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Start quoting on leads to see your performance insights here.
        </p>
        <Link
          to="/leads"
          className="inline-flex items-center gap-2 text-sm font-medium text-secondary-600 hover:text-secondary-700"
        >
          Browse Leads <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-none sm:rounded-2xl border-x-0 sm:border-x border-y sm:border border-gray-200 px-4 sm:px-6 py-4 sm:py-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-secondary-100 rounded-xl flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-secondary-600" />
          </div>
          <h3 className="font-semibold text-gray-900">Quote Insights</h3>
        </div>
        <Link
          to="/leads?filter=quoted"
          className="text-sm text-secondary-600 hover:text-secondary-700 font-medium"
        >
          View All
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-0 sm:gap-3 divide-x sm:divide-x-0 divide-gray-200 mb-5">
        <div className="p-3 bg-secondary-50 rounded-none sm:rounded-xl border-0 sm:border border-secondary-100 pr-3 sm:pr-3">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-secondary-600" />
            <span className="text-xs text-secondary-600 font-medium">Win Rate</span>
          </div>
          <p className="text-2xl font-bold text-secondary-800">{stats.winRate}%</p>
        </div>
        <div className="p-3 bg-white rounded-none sm:rounded-xl border-0 sm:border border-gray-200 pl-3 sm:pl-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-secondary-600" />
            <span className="text-xs text-gray-500 font-medium">Quoted Earnings</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">${stats.totalEarned.toLocaleString()}</p>
        </div>
      </div>

      <div className="space-y-0 sm:space-y-3 divide-y sm:divide-y-0 divide-gray-100">
        <div className="flex items-center justify-between text-sm py-3 sm:py-0">
          <span className="flex items-center gap-2 text-gray-600">
            <span className="w-2 h-2 rounded-full bg-warm-500 sm:hidden" />
            <Clock className="w-4 h-4 text-warm-500 hidden sm:block" />
            Pending
          </span>
          <span className="font-semibold text-gray-900">{stats.pendingQuotes}</span>
        </div>
        <div className="flex items-center justify-between text-sm py-3 sm:py-0">
          <span className="flex items-center gap-2 text-gray-600">
            <span className="w-2 h-2 rounded-full bg-green-500 sm:hidden" />
            <CheckCircle2 className="w-4 h-4 text-green-500 hidden sm:block" />
            Won
          </span>
          <span className="font-semibold text-green-700">{stats.wonQuotes}</span>
        </div>
        <div className="flex items-center justify-between text-sm py-3 sm:py-0">
          <span className="flex items-center gap-2 text-gray-600">
            <span className="w-2 h-2 rounded-full bg-red-400 sm:hidden" />
            <XCircle className="w-4 h-4 text-red-400 hidden sm:block" />
            Not Selected
          </span>
          <span className="font-semibold text-gray-600">{stats.declinedQuotes}</span>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">This Month</span>
          <span className="font-semibold text-gray-900">
            {stats.thisMonthQuotes} quoted, {stats.thisMonthWon} won
          </span>
        </div>
        {stats.avgQuoteAmount > 0 && (
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-gray-500">Avg. Quote</span>
            <span className="font-semibold text-gray-900">${stats.avgQuoteAmount.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
