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
      <div className="bg-ct-surface rounded-ct-lg border border-ct-line px-4 sm:px-6 py-4 sm:py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ct-surface-2 rounded-ct-md flex items-center justify-center">
            <FileText className="w-5 h-5 text-ct-mute-2" />
          </div>
          <h3 className="font-semibold text-ct-paper">Quote activity</h3>
        </div>
        <p className="text-sm text-ct-mute-2 mb-4">
          Start quoting on leads to see your performance insights here.
        </p>
        <Link
          to="/leads"
          className="inline-flex items-center gap-2 text-sm font-medium text-ct-mute-2 hover:text-ct-mute-2"
        >
          Browse leads <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-ct-surface rounded-ct-lg border border-ct-line px-4 sm:px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-ct-surface-2 rounded-ct-sm flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-ct-mute-2" />
          </div>
          <h3 className="text-base font-semibold text-ct-paper">Quote insights</h3>
        </div>
        <Link
          to="/leads?filter=quoted"
          className="text-sm text-ct-mute-2 hover:text-ct-mute-2 font-medium"
        >
          View all
        </Link>
      </div>

      {/* Two equal stat cards, tinted to differentiate at a glance. */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="p-3 bg-ct-surface-2 rounded-ct-md border border-ct-line">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="w-4 h-4 text-ct-mute-2" />
            <span className="text-xs text-ct-mute-2 font-medium">Win rate</span>
          </div>
          <p className="text-2xl font-bold text-ct-mute-2 tabular-nums">{stats.winRate}%</p>
        </div>
        <div className="p-3 bg-ct-teal/[0.14] rounded-ct-md border border-ct-teal/30">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-4 h-4 text-ct-teal" />
            <span className="text-xs text-ct-teal font-medium">Quoted earnings</span>
          </div>
          <p className="text-2xl font-bold text-ct-teal tabular-nums">${stats.totalEarned.toLocaleString()}</p>
        </div>
      </div>

      <div className="space-y-0 sm:space-y-3 divide-y sm:divide-y-0 divide-ct-line-soft">
        <div className="flex items-center justify-between text-sm py-2 sm:py-0">
          <span className="flex items-center gap-2 text-ct-mute-2">
            <span className="w-2 h-2 rounded-full bg-ct-teal sm:hidden" />
            <Clock className="w-4 h-4 text-ct-teal hidden sm:block" />
            Pending
          </span>
          <span className="font-semibold text-ct-paper">{stats.pendingQuotes}</span>
        </div>
        <div className="flex items-center justify-between text-sm py-2 sm:py-0">
          <span className="flex items-center gap-2 text-ct-mute-2">
            <span className="w-2 h-2 rounded-full bg-ct-teal/[0.14] sm:hidden" />
            <CheckCircle2 className="w-4 h-4 text-ct-teal hidden sm:block" />
            Won
          </span>
          <span className="font-semibold text-ct-teal">{stats.wonQuotes}</span>
        </div>
        <div className="flex items-center justify-between text-sm py-2 sm:py-0">
          <span className="flex items-center gap-2 text-ct-mute-2">
            <span className="w-2 h-2 rounded-full bg-ct-rose sm:hidden" />
            <XCircle className="w-4 h-4 text-ct-rose hidden sm:block" />
            Not selected
          </span>
          <span className="font-semibold text-ct-mute-2">{stats.declinedQuotes}</span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-ct-line-soft">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ct-mute">This month</span>
          <span className="font-semibold text-ct-paper">
            {stats.thisMonthQuotes} quoted, {stats.thisMonthWon} won
          </span>
        </div>
        {stats.avgQuoteAmount > 0 && (
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-ct-mute">Avg. quote</span>
            <span className="font-semibold text-ct-paper">${stats.avgQuoteAmount.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
