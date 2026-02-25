import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Loader2, Filter } from 'lucide-react';
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

    const { data: savedIds } = await supabase
      .from('my_trades')
      .select('tradie_id')
      .eq('client_id', user.id);

    if (savedIds && savedIds.length > 0) {
      const tradieIds = savedIds.map((s) => s.tradie_id);

      const { data: profiles } = await supabase
        .from('profiles')
        .select(`*, tradie_details (*)`)
        .in('id', tradieIds);

      if (profiles) {
        const tradiesWithAvailability = await Promise.all(
          profiles.map(async (tradie) => {
            const now = new Date();
            const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

            const { data: slots } = await supabase
              .from('availability_slots')
              .select('*')
              .eq('tradie_id', tradie.id)
              .eq('status', 'available')
              .gte('start_time', now.toISOString())
              .lte('start_time', weekFromNow.toISOString());

            const availabilityHours = (slots || []).reduce((acc: number, slot: AvailabilitySlot) => {
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
    }

    setLoading(false);
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
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Trades</h1>
            <p className="text-gray-600 mt-1">Your personal team of trusted tradies</p>
          </div>
          <Link
            to="/search"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Tradie
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-8">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                filter === 'all'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All ({savedTradies.length})
            </button>
            <button
              onClick={() => setFilter('available')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                filter === 'available'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Available Now
            </button>
            <button
              onClick={() => setFilter('verified')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                filter === 'verified'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Verified Only
            </button>
            {tradeCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat!)}
                className={`px-4 py-2 rounded-lg font-medium text-sm capitalize transition-colors ${
                  filter === cat
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          </div>
        ) : filteredTradies.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {savedTradies.length === 0 ? 'No saved tradies yet' : 'No tradies match this filter'}
            </h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              {savedTradies.length === 0
                ? 'Start building your personal trade team by saving your favourite tradies'
                : 'Try a different filter or add more tradies to your list'}
            </p>
            <Link
              to="/search"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors"
            >
              <Search className="w-5 h-5" />
              Find Tradies
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">{filteredTradies.length} tradies</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
