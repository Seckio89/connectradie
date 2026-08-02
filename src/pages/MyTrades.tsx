import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { TradieWithDetails, AvailabilitySlot } from '../types/database';
import DashboardLayout from '../components/DashboardLayout';
import TradieCard from '../components/TradieCard';
import ChatDrawer from '../components/ChatDrawer';
import AvailabilityCalendar from '../components/AvailabilityCalendar';

export default function MyTrades() {
  const [savedTradies, setSavedTradies] = useState<TradieWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [chatTradie, setChatTradie] = useState<TradieWithDetails | null>(null);
  const [calendarTradie, setCalendarTradie] = useState<TradieWithDetails | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchSavedTradies();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchSavedTradies = async () => {
    if (!user) return;
    setLoading(true);
    setError('');

    try {
      const { data: savedIds, error: savedErr } = await supabase
        .from('my_trades')
        .select('tradie_id')
        .eq('client_id', user.id);

      if (savedErr) throw savedErr;

      if (savedIds && savedIds.length > 0) {
        const tradieIds = savedIds.map((s) => s.tradie_id);

        const { data: profiles, error: profileErr } = await supabase
          .from('profiles')
          .select(`*, tradie_details (*)`)
          .in('id', tradieIds)
          .returns<TradieWithDetails[]>();

        if (profileErr) throw profileErr;

        if (profiles) {
          const tradiesWithAvailability = await Promise.all(
            profiles.map(async (tradie: TradieWithDetails) => {
              const now = new Date();
              const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

              const { data: slots } = await supabase
                .from('availability_slots')
                .select('*')
                .eq('tradie_id', tradie.id)
                .eq('status', 'available')
                .gte('start_time', now.toISOString())
                .lte('start_time', weekFromNow.toISOString());

              const availabilityHours = ((slots as AvailabilitySlot[]) || []).reduce((acc: number, slot: AvailabilitySlot) => {
                const start = new Date(slot.start_time);
                const end = new Date(slot.end_time);
                return acc + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
              }, 0);

              return {
                ...tradie,
                tradie_details: tradie.tradie_details,
                availability_hours: availabilityHours,
              } as TradieWithDetails;
            })
          );

          setSavedTradies(tradiesWithAvailability);
        }
      } else {
        setSavedTradies([]);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch saved tradies:', err);
      setError('Failed to load your saved tradies. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTradie = async (tradie: TradieWithDetails) => {
    if (!user) return;

    await supabase
      .from('my_trades')
      .delete()
      .eq('client_id', user.id)
      .eq('tradie_id', tradie.id);

    setSavedTradies(savedTradies.filter((t) => t.id !== tradie.id));
  };

  const filteredTradies = savedTradies.filter((tradie) => {
    if (filter === 'all') return true;
    if (filter === 'available') return (tradie.availability_hours || 0) >= 10;
    if (filter === 'verified') return tradie.tradie_details?.is_verified;
    return true;
  });

  const tradeCategories = [...new Set(savedTradies.map((t) => t.tradie_details?.trade_category))].filter(Boolean);

  return (
    <DashboardLayout wide>
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-ct-paper">My Trades</h1>
            <p className="text-ct-mute-2 mt-1">Your personal team of trusted tradies</p>
          </div>
          <Link
            to="/search"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Tradie
          </Link>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-3 sm:gap-6 border-b border-ct-line overflow-x-auto scrollbar-hide scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
            <button
              onClick={() => setFilter('all')}
              className={`py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                filter === 'all'
                  ? 'border-ct-teal text-ct-amber'
                  : 'border-transparent text-ct-mute hover:text-ct-mute-2 hover:border-ct-line'
              }`}
            >
              All ({savedTradies.length})
            </button>
            <button
              onClick={() => setFilter('available')}
              className={`py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                filter === 'available'
                  ? 'border-ct-teal text-ct-amber'
                  : 'border-transparent text-ct-mute hover:text-ct-mute-2 hover:border-ct-line'
              }`}
            >
              Available Now
            </button>
            <button
              onClick={() => setFilter('verified')}
              className={`py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                filter === 'verified'
                  ? 'border-ct-teal text-ct-amber'
                  : 'border-transparent text-ct-mute hover:text-ct-mute-2 hover:border-ct-line'
              }`}
            >
              Verified Only
            </button>
            {tradeCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat!)}
                className={`py-3 text-sm font-semibold whitespace-nowrap border-b-2 capitalize transition-colors ${
                  filter === cat
                    ? 'border-ct-teal text-ct-amber'
                    : 'border-transparent text-ct-mute hover:text-ct-mute-2 hover:border-ct-line'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="bg-ct-surface rounded-ct-lg border border-ct-rose/[0.34] p-6 sm:p-12 text-center">
            <AlertCircle className="w-12 h-12 text-ct-rose mx-auto mb-4" />
            <h3 className="text-lg font-medium text-ct-paper mb-2">Couldn't load your saved tradies</h3>
            <p className="text-ct-mute-2 mb-4">{error}</p>
            <button onClick={fetchSavedTradies} className="inline-flex items-center gap-2 px-4 py-2 bg-ct-teal text-ct-ink rounded-ct-sm hover:brightness-110 transition-colors">
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-ct-mute-2 animate-spin" />
          </div>
        ) : filteredTradies.length === 0 ? (
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-6 sm:p-12 text-center">
            <div className="w-16 h-16 bg-ct-surface-2 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-ct-mute" />
            </div>
            <h3 className="text-lg font-medium text-ct-paper mb-2">
              {savedTradies.length === 0 ? 'Build your go-to trade list' : 'No tradies match this filter'}
            </h3>
            <p className="text-ct-mute mb-6 max-w-sm mx-auto">
              {savedTradies.length === 0
                ? 'Save the tradies you rate and they\u2019ll be one tap away next time something needs doing'
                : 'Try a different filter, or save a few more tradies to your list'}
            </p>
            <Link
              to="/search"
              className="inline-flex items-center gap-2 px-6 py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 transition-colors"
            >
              <Search className="w-5 h-5" />
              Find Tradies
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-ct-mute mb-4">{filteredTradies.length} tradies</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTradies.map((tradie) => (
                <TradieCard
                  key={tradie.id}
                  tradie={tradie}
                  onChat={setChatTradie}
                  onViewCalendar={setCalendarTradie}
                  onSave={handleRemoveTradie}
                  isSaved={true}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <ChatDrawer
        isOpen={!!chatTradie}
        onClose={() => setChatTradie(null)}
        tradie={chatTradie}
      />

      <AvailabilityCalendar
        isOpen={!!calendarTradie}
        onClose={() => setCalendarTradie(null)}
        tradie={calendarTradie}
      />
    </DashboardLayout>
  );
}
