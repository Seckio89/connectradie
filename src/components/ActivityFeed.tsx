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
        recentJobs.forEach((job) => {
          const timeAgo = getTimeAgo(job.created_at);
          activities.push({
            id: `booking-${job.id}`,
            type: 'booking',
            title: 'New Booking',
            description: `${job.profiles?.full_name || 'A tradie'} just accepted a job`,
            timestamp: timeAgo,
            icon: <Zap className="w-4 h-4 text-ct-teal" />,
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
    <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-6">
      <h3 className="font-semibold text-ct-paper mb-4 flex items-center gap-2">
        <Zap className="w-5 h-5 text-ct-amber" />
        Platform Activity
      </h3>

      {activities.length === 0 ? (
        <div className="flex items-center gap-3 p-3 bg-ct-teal/[0.14] rounded-ct-md border border-ct-teal/30">
          <CheckCircle2 className="w-5 h-5 text-ct-teal flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-ct-paper">All caught up!</p>
            <p className="text-xs text-ct-mute">No new activity right now.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-center gap-3 p-3 bg-gradient-to-r from-ct-teal to-ct-teal rounded-ct-md border border-ct-teal/30 hover:border-ct-teal/30 transition-all duration-200 animate-in fade-in slide-in-from-top-2"
            >
              {activity.icon}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ct-paper">{activity.title}</p>
                <p className="text-xs text-ct-mute-2">{activity.description}</p>
              </div>
              <span className="text-xs text-ct-mute flex-shrink-0">{activity.timestamp}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
