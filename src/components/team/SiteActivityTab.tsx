// ─────────────────────────────────────────────────────────────────────────────
// SiteActivityTab — employer view of a team's automatically-tracked job-site
// arrivals/departures (native background geofencing). Shows, per worker per day:
// arrived / left / time-on-site, plus travel time + straight-line distance
// between consecutive sites. Read-only; data comes from get_team_site_activity.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { MapPin, Clock, Navigation, LogIn, LogOut, Loader2, Radar, Info } from 'lucide-react';
import {
  fetchTeamSiteActivity,
  formatDuration,
  formatTime,
  formatDayLabel,
  type WorkerSiteActivity,
} from '../../lib/siteActivity';

interface ActiveMember {
  id: string;
  full_name: string;
  employment_type: 'employee' | 'subcontractor';
}

interface SiteActivityTabProps {
  activeMembers: ActiveMember[];
}

const RANGES = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
];

const ROLE_BADGE: Record<string, string> = {
  employee: 'bg-secondary-100 text-secondary-700',
  subcontractor: 'bg-warm-100 text-warm-700',
};

export default function SiteActivityTab({ activeMembers }: SiteActivityTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rangeDays, setRangeDays] = useState(7);
  const [workers, setWorkers] = useState<WorkerSiteActivity[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchTeamSiteActivity(rangeDays);
        if (!cancelled) setWorkers(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load site activity');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rangeDays]);

  const activityByTradie = new Map(workers.map((w) => [w.tradieId, w]));

  return (
    <div className="p-5 space-y-4">
      {/* Header + range toggle */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Radar className="w-4 h-4 text-secondary-600" />
            Site Activity
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Automatically logged when a worker arrives at or leaves a booked job site on the app.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRangeDays(r.days)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                rangeDays === r.days ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Straight-line disclaimer */}
      <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
        <span>
          Distances are straight-line (point to point), not road distance. Times reflect when the worker&apos;s
          phone crossed the site boundary.
        </span>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading site activity…</span>
        </div>
      ) : activeMembers.length === 0 ? (
        <div className="text-center py-12">
          <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-900">No active team members</p>
          <p className="text-xs text-gray-500 mt-1">Add employees or subcontractors to track their site activity.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeMembers.map((member) => (
            <WorkerCard
              key={member.id}
              member={member}
              activity={activityByTradie.get(member.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkerCard({ member, activity }: { member: ActiveMember; activity?: WorkerSiteActivity }) {
  const days = activity?.days ?? [];
  const totalSites = days.reduce((n, d) => n + d.visits.length, 0);
  const totalMs = days.reduce((n, d) => n + d.totalOnSiteMs, 0);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Worker header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50/60">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary-100 to-secondary-200 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-secondary-800">{member.full_name.charAt(0).toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 truncate">{member.full_name}</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[member.employment_type]}`}>
              {member.employment_type === 'employee' ? 'Employee' : 'Subcontractor'}
            </span>
          </div>
          {totalSites > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {totalSites} site {totalSites === 1 ? 'visit' : 'visits'} · {formatDuration(totalMs)} on site
            </p>
          )}
        </div>
      </div>

      {days.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-gray-500">No site arrivals recorded in this period.</p>
          <p className="text-xs text-gray-400 mt-1">
            Tracked automatically once they arrive at a booked job site with the app installed.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {days.map((day) => (
            <div key={day.date} className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  {formatDayLabel(day.date)}
                </span>
                <span className="text-xs text-gray-500">{formatDuration(day.totalOnSiteMs)} on site</span>
              </div>

              <ol className="space-y-0">
                {day.visits.map((visit, i) => {
                  const leg = day.legs.find((l) => l.departedAt === visit.leftAt);
                  return (
                    <li key={`${visit.jobId}-${visit.arrivedAt}`}>
                      {/* Visit */}
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center pt-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-secondary-500" />
                          {(i < day.visits.length - 1 || leg) && (
                            <span className="w-px flex-1 bg-gray-200 my-1" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {visit.jobTitle || 'Job site'}
                          </p>
                          {visit.jobAddress && (
                            <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              {visit.jobAddress}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs">
                            <span className="inline-flex items-center gap-1 text-secondary-700">
                              <LogIn className="w-3.5 h-3.5" />
                              {formatTime(visit.arrivedAt)}
                            </span>
                            {visit.leftAt ? (
                              <span className="inline-flex items-center gap-1 text-gray-600">
                                <LogOut className="w-3.5 h-3.5" />
                                {formatTime(visit.leftAt)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                On site now
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 text-gray-500">
                              <Clock className="w-3.5 h-3.5" />
                              {formatDuration(visit.durationMs)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Travel leg to the next site */}
                      {leg && (
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span className="w-px flex-1 bg-gray-200" />
                          </div>
                          <div className="flex items-center gap-2 py-1.5 text-xs text-gray-400">
                            <Navigation className="w-3.5 h-3.5" />
                            <span>
                              {formatDuration(leg.travelMs)} travel
                              {leg.straightLineKm != null && ` · ~${leg.straightLineKm.toFixed(1)} km`}
                            </span>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
