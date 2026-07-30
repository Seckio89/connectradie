// ─────────────────────────────────────────────────────────────────────────────
// JobTracking — per-job geo/time tracking screen. Three role-aware views:
//   • worker  → their own check-in/out for this job
//   • owner   → every assigned worker's attendance + history
//   • client  → read-only proof of presence + PDF attendance report
// Reached from job detail ("View Tracking") and site-arrival notifications.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Loader2, CheckCircle2, Clock, ImageOff, Download, AlertTriangle, User, LogIn, LogOut } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { GEOFENCE_CROSSING_EVENT } from '../lib/siteGeofence';
import { fetchJobTracking, staticMapUrl, type JobTracking, type TrackVisit, type TrackWorker } from '../lib/jobTracking';
import { formatDuration, formatTime, formatDayLabel } from '../lib/siteActivity';
import { escapeHtml } from '../lib/escapeHtml';

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function JobTracking() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [data, setData] = useState<JobTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  // Ticks every second while someone is on site — drives the live timer.
  const [nowTs, setNowTs] = useState(Date.now());

  const reload = useCallback(async (initial = false) => {
    if (!jobId) return;
    if (initial) setLoading(true);
    const d = await fetchJobTracking(jobId);
    if (!d && initial) setNotFound(true);
    if (d) setData(d);
    if (initial) setLoading(false);
  }, [jobId]);

  useEffect(() => { reload(true); }, [reload]);

  // Instant refresh when the device crosses a geofence while this screen is up.
  useEffect(() => {
    const onCrossing = () => reload();
    window.addEventListener(GEOFENCE_CROSSING_EVENT, onCrossing);
    return () => window.removeEventListener(GEOFENCE_CROSSING_EVENT, onCrossing);
  }, [reload]);

  // Live timer while on site.
  useEffect(() => {
    if (!data?.onSiteNow) return;
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [data?.onSiteNow]);

  const isClient = profile?.role === 'client';
  const isOwner = !isClient && !!data && !!user && data.meta.ownerId === user.id;
  const isWorker = !isClient && !isOwner;

  const latest: TrackVisit | undefined = data?.visits[0];
  const status: 'on_site' | 'completed' | 'not_arrived' =
    data?.onSiteNow ? 'on_site' : data?.hasAnyVisit ? 'completed' : 'not_arrived';

  const mapUrl = data ? staticMapUrl(data.meta, data.visits) : null;

  // Average on-site time across completed visits.
  const completed = (data?.visits ?? []).filter((v) => v.durationMs != null);
  const avgMs = completed.length ? Math.round(completed.reduce((s, v) => s + (v.durationMs ?? 0), 0) / completed.length) : null;

  // Manual check-in/out fallback for unreliable GPS (indoors, basements).
  // Writes the same ENTER/EXIT rows the geofence would, with the current
  // position when the browser can supply one.
  const manualCheck = async (action: 'ENTER' | 'EXIT') => {
    if (!jobId || !user) return;
    setChecking(true); setCheckError('');
    try {
      const coords = await new Promise<{ lat: number | null; lng: number | null }>((resolve) => {
        if (!navigator.geolocation) { resolve({ lat: null, lng: null }); return; }
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve({ lat: null, lng: null }),
          { timeout: 8000, maximumAge: 30000 },
        );
      });
      const { error } = await supabase.from('site_visit_events').insert({
        tradie_id: user.id,
        job_id: jobId,
        action,
        occurred_at: new Date().toISOString(),
        latitude: coords.lat,
        longitude: coords.lng,
      });
      if (error) setCheckError('Could not record it — please try again.');
      else await reload();
    } catch {
      setCheckError('Could not record it — please try again.');
    }
    setChecking(false);
  };

  const exportReport = async () => {
    if (!data) return;
    setExporting(true);
    const rows = data.visits
      .map((v) => `<tr>
        <td>${escapeHtml(formatDayLabel(dayKey(v.arrivedAt)))}</td>
        <td>${escapeHtml(v.workerName)}</td>
        <td>${escapeHtml(formatTime(v.arrivedAt))}</td>
        <td>${v.leftAt ? escapeHtml(formatTime(v.leftAt)) : 'Still on site'}</td>
        <td>${escapeHtml(formatDuration(v.durationMs))}</td>
      </tr>`)
      .join('');
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="font-family: Arial, sans-serif; color:#26201E; padding:8px;">
        <h1 style="font-size:22px; margin:0 0 4px;">Attendance Report</h1>
        <p style="color:#6D9B8B; font-weight:600; margin:0 0 2px;">${escapeHtml(data.meta.title || 'Job')}</p>
        <p style="color:#A08B86; font-size:13px; margin:0 0 16px;">${escapeHtml(data.meta.address || '')}</p>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead><tr style="text-align:left; border-bottom:2px solid #6D9B8B;">
            <th style="padding:8px 6px;">Date</th><th>Worker</th><th>Check-in</th><th>Check-out</th><th>On site</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="5" style="padding:12px 6px; color:#A08B86;">No visits recorded yet.</td></tr>'}</tbody>
        </table>
        <p style="margin-top:20px; font-size:11px; color:#A08B86;">
          Generated by ConnecTradie from GPS geofence check-in/out events. Times are the tradie's local time.
        </p>
      </div>`;
    document.body.appendChild(container);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      await html2pdf().set({
        margin: 10,
        filename: `Attendance-${(data.meta.title || 'job').replace(/[^a-z0-9]+/gi, '-')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(container).save();
    } finally {
      document.body.removeChild(container);
      setExporting(false);
    }
  };

  if (loading) {
    return <DashboardLayout><div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 text-ct-mute-2 animate-spin" /></div></DashboardLayout>;
  }

  if (notFound || !data) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto py-16 text-center">
          <MapPin className="w-10 h-10 text-ct-mute mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-ct-paper">Tracking not available</h1>
          <p className="text-sm text-ct-mute mt-1">This job has no tracking, or you don’t have access to it.</p>
          <button onClick={() => navigate(-1)} className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 border border-ct-line rounded-ct-md text-sm font-medium text-ct-mute-2 hover:bg-ct-surface-2">
            <ArrowLeft className="w-4 h-4" /> Go back
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const statusChip = {
    on_site: { label: 'Currently on site', cls: 'bg-ct-teal/[0.14] text-ct-teal' },
    completed: { label: 'Completed', cls: 'bg-ct-teal/[0.14] text-ct-teal' },
    not_arrived: { label: 'Not yet arrived', cls: 'bg-ct-surface-2 text-ct-mute-2' },
  }[status];

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Back" className="p-2 -ml-2 text-ct-mute hover:text-ct-mute-2 rounded-ct-sm">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-ct-paper truncate">{data.meta.title || 'Job tracking'}</h1>
            {data.meta.address && <p className="text-sm text-ct-mute truncate flex items-center gap-1"><MapPin className="w-3.5 h-3.5 flex-shrink-0" /> {data.meta.address}</p>}
          </div>
        </div>

        {/* Map */}
        <div className="rounded-ct-lg border border-ct-line bg-ct-surface overflow-hidden shadow-sm">
          {mapUrl && !mapFailed ? (
            <img src={mapUrl} alt="Job site map with geofence" onError={() => setMapFailed(true)} className="w-full h-48 object-cover" />
          ) : (
            <div className="h-48 flex flex-col items-center justify-center gap-1 bg-ct-surface-2 text-ct-mute">
              <ImageOff className="w-5 h-5" />
              <span className="text-xs">Map unavailable</span>
            </div>
          )}
          <div className="flex items-center gap-3 px-4 py-2.5 text-[11px] text-ct-mute border-t border-ct-line-soft">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-ct-surface-20" /> Site</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-ct-teal" /> Check-in</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-ct-rose/[0.13]0" /> Check-out</span>
            <span className="ml-auto">Geofence ~{data.meta.radiusM}m</span>
          </div>
        </div>

        {/* Status + times */}
        <div className="rounded-ct-lg border border-ct-line bg-ct-surface p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-4">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusChip.cls}`}>
              {status === 'on_site' && <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ct-teal opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-ct-teal" /></span>}
              {status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
              {statusChip.label}
            </span>
            {isWorker && latest && (
              <span className="text-xs text-ct-mute">You checked in at <span className="font-semibold text-ct-paper">{formatTime(latest.arrivedAt)}</span></span>
            )}
          </div>

          {latest ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                <div className="rounded-ct-md bg-ct-surface-2 p-3">
                  <p className="text-[11px] text-ct-mute uppercase tracking-wide">Check-in</p>
                  <p className="text-base font-bold text-ct-paper mt-0.5 tabular-nums">{formatTime(latest.arrivedAt)}</p>
                </div>
                <div className="rounded-ct-md bg-ct-surface-2 p-3">
                  <p className="text-[11px] text-ct-mute uppercase tracking-wide">Check-out</p>
                  <p className="text-base font-bold text-ct-paper mt-0.5 tabular-nums">{latest.leftAt ? formatTime(latest.leftAt) : 'On site'}</p>
                </div>
                <div className="rounded-ct-md bg-ct-teal/[0.14] p-3">
                  <p className="text-[11px] text-ct-teal uppercase tracking-wide">On site</p>
                  <p className="text-base font-bold text-ct-teal mt-0.5 tabular-nums">
                    {latest.leftAt
                      ? formatDuration(latest.durationMs)
                      : formatDuration(Math.max(0, nowTs - new Date(latest.arrivedAt).getTime()))}
                  </p>
                </div>
              </div>

              {/* Timeline: arrival → on site → departure */}
              <div className="mt-4">
                <div className="flex items-center">
                  <span className="w-3 h-3 rounded-full bg-ct-teal flex-shrink-0" />
                  <span className={`flex-1 h-1.5 mx-1 rounded-full ${latest.leftAt ? 'bg-ct-teal/[0.14]' : 'bg-ct-teal/[0.14] animate-pulse'}`} />
                  <span className={`w-3 h-3 rounded-full flex-shrink-0 ${latest.leftAt ? 'bg-ct-rose/[0.13]0' : 'bg-ct-line'}`} />
                </div>
                <div className="flex items-center justify-between mt-1 text-[11px] text-ct-mute">
                  <span>Arrived {formatTime(latest.arrivedAt)}</span>
                  <span>{latest.leftAt ? `Left ${formatTime(latest.leftAt)}` : 'Still on site'}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-ct-mute">No check-ins recorded yet. This updates automatically when the tradie arrives on site.</p>
          )}

          {/* Manual fallback — GPS can be unreliable indoors. Same rows the
              geofence writes, so history and reports stay consistent. */}
          {!isClient && (
            <div className="mt-4 pt-4 border-t border-ct-line-soft">
              {data.onSiteNow ? (
                <button
                  onClick={() => manualCheck('EXIT')}
                  disabled={checking}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-ct-line text-ct-mute-2 rounded-ct-md text-sm font-medium hover:bg-ct-surface-2 disabled:opacity-50 transition-colors"
                >
                  {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4 text-ct-mute" />}
                  Check out now
                </button>
              ) : (
                <button
                  onClick={() => manualCheck('ENTER')}
                  disabled={checking}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-ct-teal text-ct-ink rounded-ct-md text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition-colors"
                >
                  {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                  Check in now
                </button>
              )}
              <p className="mt-1.5 text-[11px] text-ct-mute text-center">
                Check-in is automatic when you cross the site boundary — use this if GPS is unreliable indoors.
              </p>
              {checkError && <p className="mt-1 text-xs text-ct-rose text-center">{checkError}</p>}
            </div>
          )}
        </div>

        {/* Client proof-of-presence summary */}
        {isClient && latest && (
          <div className="rounded-ct-lg border border-ct-line bg-ct-surface-2/60 p-4">
            <p className="text-sm text-ct-mute-2 leading-relaxed">
              <span className="font-semibold">{latest.workerName}</span> arrived at <span className="font-semibold">{formatTime(latest.arrivedAt)}</span>
              {latest.leftAt ? <>, departed <span className="font-semibold">{formatTime(latest.leftAt)}</span> — <span className="font-semibold">{formatDuration(latest.durationMs)}</span> on site.</> : <> and is currently on site.</>}
            </p>
          </div>
        )}

        {/* Owner: per-worker attendance + early-checkout flag */}
        {isOwner && data.workers.length > 0 && (
          <div className="rounded-ct-lg border border-ct-line bg-ct-surface p-5 shadow-sm">
            <h2 className="text-sm font-bold text-ct-paper mb-3">Worker attendance</h2>
            <div className="space-y-2">
              {data.workers.map((w) => <WorkerRow key={w.workerId} worker={w} avgMs={avgMs} />)}
            </div>
          </div>
        )}

        {/* Visit history */}
        {data.visits.length > 1 && (
          <div className="rounded-ct-lg border border-ct-line bg-ct-surface p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-ct-paper">Visit history</h2>
              {avgMs != null && <span className="text-xs text-ct-mute">Avg <span className="font-semibold text-ct-paper">{formatDuration(avgMs)}</span> on site</span>}
            </div>
            <div className="divide-y divide-ct-line-soft">
              {data.visits.map((v, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ct-paper">{formatDayLabel(dayKey(v.arrivedAt))}</p>
                    <p className="text-xs text-ct-mute">
                      {formatTime(v.arrivedAt)} → {v.leftAt ? formatTime(v.leftAt) : 'on site'}
                      {!isWorker && <span className="text-ct-mute"> · {v.workerName}</span>}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-ct-mute-2 tabular-nums flex-shrink-0">{formatDuration(v.durationMs)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attendance report — client + owner */}
        {(isClient || isOwner) && data.hasAnyVisit && (
          <button onClick={exportReport} disabled={exporting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-ct-surface-2 text-ct-ink rounded-ct-md font-medium hover:bg-ct-surface-2 disabled:opacity-50 transition-colors">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download Attendance Report
          </button>
        )}

        {isWorker && (
          <p className="flex items-center gap-1.5 text-xs text-ct-mute justify-center">
            <Clock className="w-3.5 h-3.5" /> Check-in and check-out are recorded automatically by GPS when you cross the job-site boundary.
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}

function WorkerRow({ worker, avgMs }: { worker: TrackWorker; avgMs: number | null }) {
  // Flag a completed visit that ran notably shorter than the average.
  const last = worker.visits[0];
  const earlyLeave = !worker.onSiteNow && last?.durationMs != null && avgMs != null && avgMs > 0 && last.durationMs < avgMs * 0.6;
  return (
    <div className="flex items-center justify-between gap-3 rounded-ct-md bg-ct-surface-2 px-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-full bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4 text-ct-mute-2" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ct-paper truncate">{worker.workerName}</p>
          <p className="text-xs text-ct-mute">
            {worker.onSiteNow
              ? <span className="text-ct-teal font-medium">On site now</span>
              : <>on site for <span className="font-medium text-ct-mute-2">{formatDuration(worker.totalMs)}</span> across {worker.visits.length} visit{worker.visits.length === 1 ? '' : 's'}</>}
          </p>
        </div>
      </div>
      {earlyLeave && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-ct-amber/[0.13] text-ct-amber flex-shrink-0">
          <AlertTriangle className="w-3 h-3" /> Left early
        </span>
      )}
    </div>
  );
}
