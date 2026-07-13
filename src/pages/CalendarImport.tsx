// ─────────────────────────────────────────────────────────────────────────────
// CalendarImport — one-time Google Calendar → ConnecTradie import.
// Flow: Connect Google → pick calendars (colours = employees) → map each to a
// team member → import events into imported_calendar_visits (dedup by event id).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Loader2, CheckCircle2, RefreshCw, Users } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';

interface GCalendar { id: string; summary: string; backgroundColor?: string; primary?: boolean; }
interface TeamMember { id: string; invite_name: string; }
interface Mapping { selected: boolean; teamMemberId: string | null; color: string; summary: string; }

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export default function CalendarImport() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [calendars, setCalendars] = useState<GCalendar[]>([]);
  const [map, setMap] = useState<Record<string, Mapping>>({});
  const [busy, setBusy] = useState<string>(''); // '', 'calendars', 'import'
  const [result, setResult] = useState<{ imported: number; skipped: number; byCalendar: Record<string, number> } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: integ }, { data: members }] = await Promise.all([
        supabase.from('calendar_integrations').select('id').eq('tradie_id', user.id).eq('provider', 'google').maybeSingle(),
        supabase.from('business_team_members').select('id, invite_name').eq('business_owner_id', user.id).order('invite_name'),
      ]);
      setConnected(!!integ);
      setTeam((members as TeamMember[]) ?? []);
    })();
  }, [user]);

  // Reuse google-calendar-oauth's initiate flow (query-param API → direct fetch).
  const connect = async () => {
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar-oauth?action=initiate`, {
        headers: { Authorization: `Bearer ${session?.access_token}`, apikey: ANON },
      });
      const data = await res.json();
      if (data.authUrl) window.location.href = data.authUrl;
      else setError(data.error || 'Could not start Google sign-in.');
    } catch { setError('Could not start Google sign-in.'); }
  };

  const loadCalendars = async () => {
    setBusy('calendars'); setError(''); setResult(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('google-calendar-import', { body: { action: 'calendars' } });
      if (fnErr || data?.error) {
        setError(data?.error || 'Could not list calendars. Reconnect Google and grant calendar access.');
        return;
      }
      const cals = (data.calendars as GCalendar[]) ?? [];
      setCalendars(cals);
      setMap(Object.fromEntries(cals.map((c) => [c.id, {
        selected: !c.primary, teamMemberId: null, color: c.backgroundColor || '#64748b', summary: c.summary,
      } as Mapping])));
    } catch { setError('Could not list calendars.'); }
    finally { setBusy(''); }
  };

  const runImport = async () => {
    const chosen = calendars.filter((c) => map[c.id]?.selected);
    if (!chosen.length) { setError('Select at least one calendar to import.'); return; }
    setBusy('import'); setError(''); setResult(null);
    try {
      const payload = chosen.map((c) => ({ id: c.id, summary: map[c.id].summary, color: map[c.id].color, teamMemberId: map[c.id].teamMemberId }));
      const { data, error: fnErr } = await supabase.functions.invoke('google-calendar-import', { body: { action: 'import', calendars: payload } });
      if (fnErr || data?.error) { setError(data?.error || 'Import failed.'); return; }
      setResult(data);
      // Persist each mapped member's colour so the schedule can tell them apart.
      await Promise.all(chosen.filter((c) => map[c.id].teamMemberId).map((c) =>
        supabase.from('business_team_members').update({ color: map[c.id].color }).eq('id', map[c.id].teamMemberId!)));
      showToast(`Imported ${data.imported} events.`);
    } catch { setError('Import failed.'); }
    finally { setBusy(''); }
  };

  const setRow = (id: string, patch: Partial<Mapping>) => setMap((m) => ({ ...m, [id]: { ...m[id], ...patch } }));

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> Settings
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-secondary-50 flex items-center justify-center flex-shrink-0">
            <Calendar className="w-6 h-6 text-secondary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Import from Google Calendar</h1>
            <p className="text-sm text-gray-600">Bring your existing jobs in. Each calendar (colour) maps to a team member.</p>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

        {/* Step 1 — connect */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {connected ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Calendar className="w-5 h-5 text-gray-400" />}
              <span className="text-sm font-medium text-gray-900">
                {connected == null ? 'Checking connection…' : connected ? 'Google Calendar connected' : 'Not connected'}
              </span>
            </div>
            <button onClick={connect} className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
              <RefreshCw className="w-4 h-4" /> {connected ? 'Reconnect' : 'Connect Google Calendar'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            To import, grant calendar access when prompted. After connecting, return here and load your calendars.
          </p>
        </div>

        {/* Step 2 — load + map calendars */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Calendars</h2>
            <button onClick={loadCalendars} disabled={busy === 'calendars'} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-60">
              {busy === 'calendars' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Load my calendars
            </button>
          </div>

          {calendars.length === 0 ? (
            <p className="text-sm text-gray-400">Load your calendars, then tick the ones to import and map each to a team member.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {calendars.map((c) => {
                const row = map[c.id];
                if (!row) return null;
                return (
                  <div key={c.id} className="flex items-center gap-3 py-3 flex-wrap">
                    <input type="checkbox" checked={row.selected} onChange={(e) => setRow(c.id, { selected: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    <span className="w-4 h-4 rounded-full flex-shrink-0 border border-black/5" style={{ background: row.color }} />
                    <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">{c.summary}{c.primary && <span className="text-xs text-gray-400 font-normal"> · primary</span>}</span>
                    <select
                      value={row.teamMemberId ?? ''}
                      onChange={(e) => setRow(c.id, { teamMemberId: e.target.value || null })}
                      disabled={!row.selected}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white disabled:opacity-50 max-w-[180px]"
                    >
                      <option value="">Unassigned</option>
                      {team.map((m) => <option key={m.id} value={m.id}>{m.invite_name}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          )}

          {team.length === 0 && calendars.length > 0 && (
            <p className="text-xs text-amber-600 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> No team members yet — add them under Team to map calendars to people.</p>
          )}
        </div>

        {/* Step 3 — import */}
        {calendars.length > 0 && (
          <div className="flex items-center justify-end gap-3">
            <button onClick={runImport} disabled={busy === 'import'} className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
              {busy === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />} Import selected calendars
            </button>
          </div>
        )}

        {result && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-emerald-800 flex items-center gap-2"><CheckCircle2 className="w-5 h-5" /> Imported {result.imported} events{result.skipped ? ` · skipped ${result.skipped}` : ''}</p>
            <ul className="mt-2 text-xs text-emerald-700 space-y-0.5">
              {Object.entries(result.byCalendar).map(([name, n]) => <li key={name}>{name}: {n}</li>)}
            </ul>
            <p className="text-xs text-emerald-600 mt-2">Re-running is safe — existing events update instead of duplicating.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
