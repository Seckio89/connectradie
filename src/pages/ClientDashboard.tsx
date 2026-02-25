import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Plus, Search, Loader2, MapPin, ArrowRight, Crown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { TradieWithDetails, AvailabilitySlot } from '../types/database';
import DashboardLayout from '../components/DashboardLayout';
import TradieCard from '../components/TradieCard';
import ChatDrawer from '../components/ChatDrawer';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import ActivityFeed from '../components/ActivityFeed';
import OnboardingChecklist from '../components/OnboardingChecklist';
import ServiceRemindersWidget from '../components/ServiceRemindersWidget';
import SubscriptionModal from '../components/SubscriptionModal';
import TooltipHint from '../components/TooltipHint';
import UserTradeBadges from '../components/UserTradeBadges';

export default function ClientDashboard() {
  const [savedTradies, setSavedTradies] = useState<TradieWithDetails[]>([]);
  const [recommendedTradies, setRecommendedTradies] = useState<TradieWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatTradie, setChatTradie] = useState<TradieWithDetails | null>(null);
  const [calendarTradie, setCalendarTradie] = useState<TradieWithDetails | null>(null);
  const [availableThisWeek, setAvailableThisWeek] = useState(0);
  const [unreadTradieIds, setUnreadTradieIds] = useState<Set<string>>(new Set());
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [trainingModeEnabled, setTrainingModeEnabled] = useState(false);
  const [toast, setToast] = useState<{ message: string; show: boolean; isError?: boolean }>({ message: '', show: false });
  const { user, profile } = useAuth();
  const isClientPro = profile?.is_premium;

  const showToast = (message: string, isError = false) => {
    setToast({ message, show: true, isError });
    setTimeout(() => setToast({ message: '', show: false }), 3000);
  };

  useEffect(() => {
    if (user) {
      fetchSavedTradies();
      fetchRecommendedTradies();
      fetchUnreadTradieIds();
      fetchTrainingMode();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchTrainingMode();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const fetchTrainingMode = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'training_mode_enabled')
      .maybeSingle();

    setTrainingModeEnabled(data?.value === true);
  };

  const fetchSavedTradies = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data: savedIds, error: savedError } = await supabase
        .from('my_trades')
        .select('tradie_id')
        .eq('client_id', user.id);

      if (savedError) throw savedError;

      if (savedIds && savedIds.length > 0) {
        const tradieIds = savedIds.map((s) => s.tradie_id);

        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select(`*, tradie_details (*)`)
          .in('id', tradieIds);

        if (profilesError) throw profilesError;

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

          const available = tradiesWithAvailability.filter((t) => (t.availability_hours || 0) >= 10).length;
          setAvailableThisWeek(available);
        }
      }
    } catch {
      showToast('Failed to load saved tradies. Please refresh.', true);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadTradieIds = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', user.id)
      .is('read_at', null)
      .is('deleted_at', null);

    if (data) {
      setUnreadTradieIds(new Set(data.map((m) => m.sender_id)));
    }
  };

  const handleOpenChat = (tradie: TradieWithDetails) => {
    setChatTradie(tradie);
    setUnreadTradieIds((prev) => {
      const next = new Set(prev);
      next.delete(tradie.id);
      return next;
    });
    supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', tradie.id)
      .eq('receiver_id', user!.id)
      .is('read_at', null)
      .then(() => {});
  };

  const fetchRecommendedTradies = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select(`*, tradie_details (*)`)
        .eq('role', 'tradie')
        .limit(4);

      if (error) throw error;

      if (profiles) {
        const filtered = profiles.filter((p) => p.tradie_details);
        setRecommendedTradies(filtered as TradieWithDetails[]);
      }
    } catch {
      showToast('Failed to load recommendations. Please refresh.', true);
    }
  };

  const handleRemoveTradie = async (tradie: TradieWithDetails) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('my_trades')
        .delete()
        .eq('client_id', user.id)
        .eq('tradie_id', tradie.id);

      if (error) throw error;

      setSavedTradies(savedTradies.filter((t) => t.id !== tradie.id));
    } catch {
      showToast('Failed to remove tradie. Please try again.', true);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back, {profile?.full_name?.split(' ')[0]}!
            </h1>
            <p className="text-gray-600 mt-1">Manage your saved tradies and find new ones</p>
          </div>
          <Link
            to="/search"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors min-h-[44px]"
          >
            <Plus className="w-5 h-5" />
            Find New Tradie
          </Link>
        </div>

        {availableThisWeek > 0 && (
          <div className="mb-8 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-300 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-green-600 animate-pulse" />
            </div>
            <div>
              <p className="font-semibold text-green-900">
                Great timing! {availableThisWeek} of your saved tradies just opened up slots this week
              </p>
              <p className="text-sm text-green-800 mt-0.5">
                Check their calendars now — popular times fill up fast!
              </p>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">My Saved Tradies</h2>
              <span className="text-sm text-gray-600">{savedTradies.length} saved</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
              </div>
            ) : savedTradies.length === 0 ? (
              <TooltipHint
                hintKey="empty_saved_tradies"
                title="Find your first tradie"
                description="Start exploring professionals in your area. You can save your favorites and message them anytime."
                position="top"
                theme="blue"
              >
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border border-blue-200 p-12 text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Ready to find great tradies?</h3>
                  <p className="text-gray-600 mb-6 max-w-sm mx-auto">
                    Browse through hundreds of skilled professionals and build your personal team. You'll get instant availability updates and can message them directly.
                  </p>
                  <Link
                    to="/search"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 active:scale-95 transition-all duration-200"
                  >
                    <Search className="w-5 h-5" />
                    Explore Tradies
                  </Link>
                </div>
              </TooltipHint>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {savedTradies.map((tradie) => (
                  <TradieCard
                    key={tradie.id}
                    tradie={tradie}
                    onChat={handleOpenChat}
                    onViewCalendar={setCalendarTradie}
                    onSave={handleRemoveTradie}
                    isSaved={true}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-1 space-y-6">
            {trainingModeEnabled && (
              <button
                onClick={() => setShowSubscriptionModal(true)}
                className={`w-full rounded-2xl border p-5 text-left transition-all hover:shadow-lg ${
                  isClientPro
                    ? 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-300'
                    : 'bg-gradient-to-br from-gray-50 to-slate-50 border-gray-200 hover:border-amber-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    isClientPro ? 'bg-amber-200' : 'bg-gray-200'
                  }`}>
                    <Crown className={`w-5 h-5 ${isClientPro ? 'text-amber-700' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${isClientPro ? 'text-amber-900' : 'text-gray-900'}`}>
                      {isClientPro ? 'Pro Member' : 'Upgrade to Pro'}
                    </p>
                    <p className="text-xs text-gray-600">
                      {isClientPro ? 'All features unlocked' : 'Get premium features'}
                    </p>
                  </div>
                </div>
              </button>
            )}
            <ServiceRemindersWidget />
            <OnboardingChecklist />
            <ActivityFeed />

            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">New & Recommended</h3>

              {profile?.postcode && (
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                  <MapPin className="w-4 h-4" />
                  Near {profile.postcode}
                </div>
              )}

              <div className="space-y-4">
                {recommendedTradies.map((tradie) => (
                  <div
                    key={tradie.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all duration-200 cursor-pointer active:scale-95"
                    onClick={() => handleOpenChat(tradie)}
                  >
                    <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary-600">
                        {tradie.full_name?.charAt(0) || 'T'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {tradie.tradie_details?.business_name || tradie.full_name}
                      </p>
                      <p className="text-xs text-gray-600 capitalize">
                        {tradie.tradie_details?.trade_category}
                      </p>
                      <div className="mt-1">
                        <UserTradeBadges
                          verifiedTrades={tradie.verified_trades || []}
                          declaredTrades={tradie.declared_trades || []}
                          size="sm"
                        />
                      </div>
                    </div>
                    {unreadTradieIds.has(tradie.id) && (
                      <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                    )}
                  </div>
                ))}
              </div>

              <Link
                to="/search"
                className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 text-primary-600 font-medium hover:bg-primary-50 active:scale-95 rounded-xl transition-all duration-200 min-h-[44px]"
              >
                View All
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
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

      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
      />

      {toast.show && (
        <div className={`fixed bottom-4 right-4 ${toast.isError ? 'bg-red-600' : 'bg-green-600'} text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 z-50 animate-slide-up`}>
          <div className={`w-2 h-2 ${toast.isError ? 'bg-red-300' : 'bg-green-300'} rounded-full animate-pulse`} />
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </DashboardLayout>
  );
}
