import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, CalendarClock, AlertTriangle, RefreshCw, X, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { ServiceReminder } from '../types/database';

function formatCategoryName(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getDaysUntilDue(dueDate: string): number {
  const due = new Date(dueDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getDueLabel(daysUntil: number): { text: string; color: string } {
  if (daysUntil < 0) {
    return { text: `${Math.abs(daysUntil)}d overdue`, color: 'text-red-600' };
  }
  if (daysUntil === 0) {
    return { text: 'Due today', color: 'text-red-600' };
  }
  if (daysUntil <= 7) {
    return { text: `Due in ${daysUntil}d`, color: 'text-amber-600' };
  }
  return { text: `Due in ${daysUntil}d`, color: 'text-gray-500' };
}

export default function ServiceRemindersWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reminders, setReminders] = useState<ServiceReminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchReminders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchReminders = async () => {
    if (!user) return;
    setLoading(true);

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const { data } = await supabase
      .from('service_reminders')
      .select(`
        *,
        tradie:profiles!service_reminders_tradie_id_fkey(
          full_name,
          tradie_details!tradie_details_profile_id_fkey(business_name)
        )
      `)
      .eq('client_id', user.id)
      .in('status', ['pending', 'sent'])
      .lte('due_date', thirtyDaysFromNow.toISOString().split('T')[0])
      .order('due_date', { ascending: true })
      .limit(5);

    if (data) {
      const mapped: ServiceReminder[] = data.map((r: any) => ({
        ...r,
        tradie_name: r.tradie?.full_name || 'Unknown',
        tradie_business: r.tradie?.tradie_details?.business_name || null,
      }));
      setReminders(mapped);
    }

    setLoading(false);
  };

  const handleDismiss = async (id: string) => {
    await supabase
      .from('service_reminders')
      .update({ status: 'dismissed' })
      .eq('id', id);

    setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  const handleBookAgain = (reminder: ServiceReminder) => {
    const params = new URLSearchParams();
    if (reminder.category_name) params.set('category', reminder.category_name);
    if (reminder.location_address) params.set('location', reminder.location_address);
    if (reminder.tradie_id) params.set('tradie', reminder.tradie_id);
    navigate(`/search?${params.toString()}`);
  };

  if (loading || reminders.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-teal-100">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-teal-600" />
          Maintenance Due
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">Services coming up or overdue</p>
      </div>

      <div className="divide-y divide-gray-100">
        {reminders.map((reminder) => {
          const daysUntil = getDaysUntilDue(reminder.due_date);
          const dueLabel = getDueLabel(daysUntil);
          const isOverdue = daysUntil < 0;

          return (
            <div
              key={reminder.id}
              className={`px-5 py-4 transition-colors ${isOverdue ? 'bg-red-50/50' : 'hover:bg-gray-50'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isOverdue
                    ? 'bg-red-100'
                    : daysUntil <= 7
                      ? 'bg-amber-100'
                      : 'bg-teal-100'
                }`}>
                  {isOverdue ? (
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  ) : (
                    <Wrench className={`w-4 h-4 ${daysUntil <= 7 ? 'text-amber-600' : 'text-teal-600'}`} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {formatCategoryName(reminder.category_name)}
                    </p>
                    <button
                      onClick={() => handleDismiss(reminder.id)}
                      className="p-1 text-gray-300 hover:text-gray-500 rounded transition-colors flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-xs text-gray-500 truncate">
                    {reminder.tradie_business || reminder.tradie_name}
                  </p>

                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-xs font-medium ${dueLabel.color}`}>
                      {dueLabel.text}
                    </span>
                    <button
                      onClick={() => handleBookAgain(reminder)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded-md transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Book Again
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {reminders.length >= 5 && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
          <button
            onClick={() => navigate('/search')}
            className="flex items-center justify-center gap-1 w-full text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors"
          >
            View all reminders
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
