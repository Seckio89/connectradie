// ─────────────────────────────────────────────────────────────────────────────
// MyHoursTab — a worker's READ-ONLY view of their own timesheet: the hours their
// employer(s) have on record for them, week by week, with the on-site arrival /
// departure / travel behind each auto-logged entry. No approve/reject — the
// employer owns that. Data comes from the get_my_time_entries RPC (scoped to the
// caller). Shown on the Team page only when the user is an active worker.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Timer, MapPin, LogIn, LogOut, Navigation, Briefcase } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatTime, formatDuration } from '../../lib/siteActivity';

interface MyEntry {
  id: string;
  job_id: string | null;
  job_title: string | null;
  entry_date: string;
  hours: number;
  status: 'pending' | 'approved' | 'rejected';
  source: string;
  arrived_at: string | null;
  departed_at: string | null;
  employer_name: string | null;
}

/** Local calendar date (yyyy-mm-dd) — never via toISOString (which shifts to UTC). */
const toLocalYmd = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const STATUS_CLS: Record<string, string> = {
  approved: 'bg-ct-teal/[0.14] text-ct-teal',
  rejected: 'bg-ct-rose/[0.13] text-ct-rose',
  pending: 'bg-ct-amber/[0.13] text-ct-amber',
};

export default function MyHoursTab() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [entries, setEntries] = useState<MyEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const { data } = await supabase.rpc('get_my_time_entries', {
        p_since: toLocalYmd(weekStart),
        p_until: toLocalYmd(weekEnd),
      });
      if (!cancelled) {
        setEntries((data as MyEntry[]) ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, weekStart]);

  // Travel between consecutive geofenced sites on the same day (this arrival −
  // the previous departure), keyed by the later entry.
  const travelMs: Record<string, number> = {};
  {
    const byDay: Record<string, MyEntry[]> = {};
    for (const e of entries) {
      if (e.source !== 'geofence' || !e.arrived_at) continue;
      (byDay[e.entry_date] ||= []).push(e);
    }
    for (const key of Object.keys(byDay)) {
      const list = byDay[key].slice().sort((a, b) => (a.arrived_at! < b.arrived_at! ? -1 : 1));
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1], cur = list[i];
        if (prev.departed_at && cur.arrived_at) {
          const ms = new Date(cur.arrived_at).getTime() - new Date(prev.departed_at).getTime();
          if (ms > 0) travelMs[cur.id] = ms;
        }
      }
    }
  }

  const totalHours = entries.reduce((s, e) => s + Number(e.hours), 0);
  const approvedHours = entries.filter(e => e.status === 'approved').reduce((s, e) => s + Number(e.hours), 0);

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}
          className="p-1.5 rounded-ct-sm hover:bg-ct-surface-2 text-ct-mute"
          aria-label="Previous week"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h3 className="text-sm font-semibold text-ct-paper">
          Week of {weekStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
        </h3>
        <button
          onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}
          className="p-1.5 rounded-ct-sm hover:bg-ct-surface-2 text-ct-mute"
          aria-label="Next week"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {!loading && entries.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-ct-surface-2 rounded-ct-sm border border-ct-teal/30">
            <Timer className="w-4 h-4 text-ct-mute-2" />
            <span className="text-sm text-ct-mute-2">This week</span>
            <span className="text-sm font-bold text-ct-mute-2">{totalHours}h</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-ct-teal/[0.14] rounded-ct-sm border border-ct-teal/30">
            <span className="text-sm text-ct-mute-2">Approved</span>
            <span className="text-sm font-bold text-ct-teal">{approvedHours}h</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-ct-mute text-sm">Loading your hours…</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-ct-mute text-sm">
          <Timer className="w-10 h-10 mx-auto mb-3 text-ct-mute" />
          <p className="font-medium text-ct-mute-2">No hours recorded this week</p>
          <p className="text-xs mt-1">On-site hours are logged automatically when you check in at a booked job site.</p>
        </div>
      ) : (
        <div className="divide-y divide-ct-line-soft border border-ct-line rounded-ct-md overflow-hidden">
          {entries.map(entry => (
            <div key={entry.id} className="flex items-center gap-4 p-4 bg-ct-surface">
              <div className="w-9 h-9 rounded-ct-sm bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-4 h-4 text-ct-mute-2" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-ct-paper text-sm truncate">{entry.job_title || 'On-site work'}</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_CLS[entry.status] || STATUS_CLS.pending}`}>
                    {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                  </span>
                  {entry.source === 'geofence' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-ct-surface-2 text-ct-mute-2" title="Auto-logged from on-site check-in">
                      <MapPin className="w-3 h-3" /> Auto
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-ct-mute flex-wrap">
                  <span>{new Date(`${entry.entry_date}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span className="font-semibold text-ct-mute-2">{entry.hours}h</span>
                  {entry.employer_name && <span className="truncate">for {entry.employer_name}</span>}
                </div>
                {entry.source === 'geofence' && entry.arrived_at && (
                  <div className="flex items-center gap-3 mt-1 text-xs text-ct-mute flex-wrap">
                    <span className="inline-flex items-center gap-1" title="Arrived on site">
                      <LogIn className="w-3.5 h-3.5 text-ct-mute" /> {formatTime(entry.arrived_at)}
                    </span>
                    <span className="inline-flex items-center gap-1" title="Left site">
                      <LogOut className="w-3.5 h-3.5 text-ct-mute" /> {entry.departed_at ? formatTime(entry.departed_at) : '—'}
                    </span>
                    {travelMs[entry.id] != null && (
                      <span className="inline-flex items-center gap-1 text-ct-mute-2" title="Travel from the previous site">
                        <Navigation className="w-3.5 h-3.5" /> {formatDuration(travelMs[entry.id])} drive from last site
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
