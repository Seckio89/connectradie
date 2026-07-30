// ─────────────────────────────────────────────────────────────────────────────
// CalendarImport — one-time Google Calendar → ConnecTradie import.
// Flow: Connect Google → pick calendars (colours = employees) → map each to a
// team member → import events into imported_calendar_visits (dedup by event id).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Loader2, CheckCircle2, RefreshCw, Users } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
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

  // Re-read the Google connection status (used after the consent flow returns).
  const refreshConnected = async () => {
    if (!user) return;
    const { data: integ } = await supabase
      .from('calendar_integrations')
      .select('id').eq('tradie_id', user.id).eq('provider', 'google').maybeSingle();
    setConnected(!!integ);
  };

  // Reuse google-calendar-oauth's initiate flow (query-param API → direct fetch).
  const connect = async () => {
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar-oauth?action=initiate`, {
        headers: { Authorization: `Bearer ${session?.access_token}`, apikey: ANON },
      });
      const data = await res.json();
      if (!data.authUrl) { setError(data.error || 'Could not start Google sign-in.'); return; }

      // On the native app the WebView is an embedded user agent, which Google
      // blocks for OAuth (Error 403: disallowed_useragent). Open Google's consent
      // page in the system browser (Chrome Custom Tab / SFSafariViewController),
      // which Google accepts. The callback binds the tokens server-side via the
      // signed state, so we don't need the redirect to re-enter the app — the
      // user just returns and taps "Load my calendars". Re-check the connection
      // when the in-app browser closes so the status flips to "connected".
      if (Capacitor.isNativePlatform()) {
        const sub = await Browser.addListener('browserFinished', async () => {
          await sub.remove();
          await refreshConnected();
        });
        await Browser.open({ url: data.authUrl });
      } else {
        window.location.href = data.authUrl;
      }
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
      // Dedup: Google can return the same calendar more than once (e.g.
      // "Holidays in Australia" from multiple accounts). Collapse by name
      // (case-insensitive), keeping the first — same-named entries are noise.
      const seen = new Set<string>();
      const cals = ((data.calendars as GCalendar[]) ?? []).filter((c) => {
        const key = (c.summary?.trim().toLowerCase()) || c.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setCalendars(cals);
      // Nothing is selected by default — this is a SELECTIVE import. The user
      // ticks only the specific calendars they want (e.g. employee calendars),
      // leaving personal/other-account calendars untouched.
      setMap(Object.fromEntries(cals.map((c) => [c.id, {
        selected: false, teamMemberId: null, color: c.backgroundColor || '#64748b', summary: c.summary,
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
        <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-ct-mute hover:text-ct-mute-2">
          <ArrowLeft className="w-4 h-4" /> Settings
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-ct-md bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
            <Calendar className="w-6 h-6 text-ct-mute-2" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ct-paper">Import from Google Calendar</h1>
            <p className="text-sm text-ct-mute-2">Bring your existing jobs in. Each calendar (colour) maps to a team member.</p>
          </div>
        </div>

        {error && <div className="bg-ct-rose/[0.13] border border-ct-rose/[0.34] text-ct-rose text-sm rounded-ct-md px-4 py-3">{error}</div>}

        {/* Step 1 — connect */}
        <div className="bg-ct-surface border border-ct-line-soft rounded-ct-lg shadow-sm p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {connected ? <CheckCircle2 className="w-5 h-5 text-ct-teal" /> : <Calendar className="w-5 h-5 text-ct-mute" />}
              <span className="text-sm font-medium text-ct-paper">
                {connected == null ? 'Checking connection…' : connected ? 'Google Calendar connected' : 'Not connected'}
              </span>
            </div>
            <button onClick={connect} className="inline-flex items-center gap-2 px-4 py-2 border border-ct-line rounded-ct-sm text-sm font-medium text-ct-mute-2 hover:bg-ct-surface-2">
              <RefreshCw className="w-4 h-4" /> {connected ? 'Reconnect' : 'Connect Google Calendar'}
            </button>
          </div>
          <p className="text-xs text-ct-mute mt-2">
            To import, grant calendar access when prompted. After connecting, return here and load your calendars.
          </p>
        </div>

        {/* Step 2 — load + map calendars */}
        <div className="bg-ct-surface border border-ct-line-soft rounded-ct-lg shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ct-paper">Calendars</h2>
            <button onClick={loadCalendars} disabled={busy === 'calendars'} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-ct-line rounded-ct-sm text-xs font-medium text-ct-mute-2 hover:bg-ct-surface-2 disabled:opacity-60">
              {busy === 'calendars' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {calendars.length ? 'Reload' : 'Load my calendars'}
            </button>
          </div>

          {calendars.length === 0 ? (
            <p className="text-sm text-ct-mute">Load your calendars, then tick the specific ones to import and map each to a team member.</p>
          ) : (
            <>
              <p className="text-xs text-ct-mute bg-ct-surface-2 rounded-ct-sm px-3 py-2">
                Tick only the calendars you want to import (e.g. your employee calendars). Everything is unticked by default — personal calendars and other accounts are left out unless you tick them.
              </p>
              {/* Compact single-line rows — clean settings list, no wrapping:
                  checkbox + colour dot + name on the left, member dropdown on the
                  right. ~46px tall so all calendars fit without scrolling. */}
              <div className="divide-y divide-ct-line-soft mt-2">
              {calendars.map((c) => {
                const row = map[c.id];
                if (!row) return null;
                return (
                  <div key={c.id} className="flex items-center gap-2.5 py-2.5">
                    <input type="checkbox" checked={row.selected} onChange={(e) => setRow(c.id, { selected: e.target.checked })}
                      className="w-4 h-4 flex-shrink-0 rounded-ct-xs border-ct-line text-ct-teal focus:ring-ct-teal" />
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-black/5" style={{ background: row.color }} />
                    <span className="flex-1 min-w-0 text-sm text-ct-paper truncate">{c.summary}{c.primary && <span className="text-xs text-ct-mute"> · primary</span>}</span>
                    <select
                      value={row.teamMemberId ?? ''}
                      onChange={(e) => setRow(c.id, { teamMemberId: e.target.value || null })}
                      disabled={!row.selected}
                      className="flex-shrink-0 w-32 px-2 py-1 border border-ct-line rounded-ct-xs text-xs bg-ct-surface text-ct-mute-2 disabled:opacity-50 disabled:bg-ct-surface-2"
                    >
                      <option value="">Unassigned</option>
                      {team.map((m) => <option key={m.id} value={m.id}>{m.invite_name}</option>)}
                    </select>
                  </div>
                );
              })}
              </div>
            </>
          )}

          {team.length === 0 && calendars.length > 0 && (
            <p className="text-xs text-ct-amber flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> No team members yet — add them under Team to map calendars to people.</p>
          )}
        </div>

        {/* Step 3 — import only the ticked calendars */}
        {calendars.length > 0 && (() => {
          const selectedCount = calendars.filter((c) => map[c.id]?.selected).length;
          return (
            <div className="flex items-center justify-end gap-3">
              <span className="text-xs text-ct-mute">{selectedCount} calendar{selectedCount === 1 ? '' : 's'} selected</span>
              <button onClick={runImport} disabled={busy === 'import' || selectedCount === 0} className="inline-flex items-center gap-2 px-5 py-2.5 bg-ct-teal text-ct-ink rounded-ct-md text-sm font-semibold hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed">
                {busy === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />} Import Selected{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </button>
            </div>
          );
        })()}

        {result && (
          <div className="bg-ct-teal/[0.14] border border-ct-teal/30 rounded-ct-lg p-5">
            <p className="text-sm font-semibold text-ct-teal flex items-center gap-2"><CheckCircle2 className="w-5 h-5" /> Imported {result.imported} events{result.skipped ? ` · skipped ${result.skipped}` : ''}</p>
            <ul className="mt-2 text-xs text-ct-teal space-y-0.5">
              {Object.entries(result.byCalendar).map(([name, n]) => <li key={name}>{name}: {n}</li>)}
            </ul>
            <p className="text-xs text-ct-teal mt-2">Re-running is safe — existing events update instead of duplicating.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
