import { useEffect, useState } from 'react';
import { Zap, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Activity {
  id: string;
  type: 'booking' | 'review' | 'message';
  title: string;
  description: string;
  timestamp: string;
  icon: React.ReactNode;
}

export default function ActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
    const interval = setInterval(fetchActivities, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      const { data: recentJobs } = await supabase
        .from('jobs')
        .select('id, status, created_at, profiles!jobs_tradie_id_fkey(full_name)')
        .eq('status', 'accepted')
        .gte('created_at', twoHoursAgo)
        .order('created_at', { ascending: false })
        .limit(3);

      const activities: Activity[] = [];

      if (recentJobs && recentJobs.length > 0) {
        recentJobs.forEach((job: { id: string; created_at: string; status: string; profiles: { full_name: string } | null }) => {
          const timeAgo = getTimeAgo(job.created_at);
          activities.push({
            id: `booking-${job.id}`,
            type: 'booking',
            title: 'New Booking',
            description: `${job.profiles?.full_name || 'A tradie'} just accepted a job`,
            timestamp: timeAgo,
            icon: <Zap className="w-4 h-4 text-green-600" />,
          });
        });
      }

      setActivities(activities);
    } catch {
      // error handled silently
    } finally {
      setLoading(false);
    }
  };

  const getTimeAgo = (timestamp: string) => {
    const now = new Date();
    const past = new Date(timestamp);
    const diff = Math.floor((now.getTime() - past.getTime()) / 1000);

    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  if (loading) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Zap className="w-5 h-5 text-warm-600" />
        Platform Activity
      </h3>

      {activities.length === 0 ? (
        <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
          <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-900">All caught up!</p>
            <p className="text-xs text-gray-500">No new activity right now.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-center gap-3 p-3 bg-gradient-to-r from-warm-50 to-warm-50 rounded-xl border border-warm-100 hover:border-warm-300 transition-all duration-200 animate-in fade-in slide-in-from-top-2"
            >
              {activity.icon}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                <p className="text-xs text-gray-600">{activity.description}</p>
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0">{activity.timestamp}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
