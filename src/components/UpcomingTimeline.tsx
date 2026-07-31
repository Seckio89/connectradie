import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, FileText, Briefcase, ArrowRight, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/*
  UpcomingTimeline — replaces the old global "Platform Activity" feed.
  Shows the next 7 days of personal events for the client: upcoming recurring
  visits, upcoming auto-invoice generation dates, and scheduled one-off jobs.
  Distinct from the bell icon (past events) and the Invoices/Spending widgets.
*/

type Item = {
  key: string;
  date: Date;
  icon: 'session' | 'invoice' | 'job';
  title: string;
  subtitle: string;
  badge?: string;
  href: string;
  warning?: boolean;
};

// Match the negative-int convention from src/lib/recurringJobs.ts:
// -3=daily, -2=fortnightly, -1=weekly, 1+=monthly cadence.
function frequencyLabel(months: number | null | undefined): string | undefined {
  if (months === -3) return 'Daily';
  if (months === -2) return 'Fortnightly';
  if (months === -1) return 'Weekly';
  if (typeof months === 'number' && months >= 1) return months === 1 ? 'Monthly' : `Every ${months}mo`;
  return undefined;
}

// Pull just the suburb out of an address string (e.g. "12 Smith St, Parramatta NSW 2150").
function suburbFrom(address: string | null | undefined): string | undefined {
  if (!address) return undefined;
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  // Last comma-separated chunk usually has "Suburb STATE postcode" — take the suburb prefix.
  const tail = parts[parts.length - 1];
  const match = tail.match(/^([A-Za-z\s'-]+?)\s+[A-Z]{2,3}\s+\d{4}$/);
  if (match) return match[1].trim();
  // Otherwise, the second-to-last chunk is usually the suburb.
  return parts.length > 1 ? parts[parts.length - 2] : tail;
}

const HORIZON_DAYS = 7;

// Day-group heading: "Today" / "Tomorrow" / "Sat 17 May".
function formatDayHeading(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Midnight ISO key so items can be bucketed into day groups.
function dayKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function addCycleToDate(from: Date, cycle: string | null | undefined): Date {
  const d = new Date(from);
  if (cycle === 'weekly') d.setDate(d.getDate() + 7);
  else if (cycle === 'fortnightly') d.setDate(d.getDate() + 14);
  else d.setMonth(d.getMonth() + 1); // monthly default
  return d;
}

export default function UpcomingTimeline() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchItems = async () => {
      try {
        const now = new Date();
        const horizon = new Date(now);
        horizon.setDate(horizon.getDate() + HORIZON_DAYS);
        const todayIso = now.toISOString().split('T')[0];
        const horizonIso = horizon.toISOString().split('T')[0];

        const next: Item[] = [];

        // 1. Upcoming recurring sessions (Nicole's services). Pulled via the
        // recurring_jobs FK so we only see jobs she owns. Location + frequency
        // come along so rows for the same trade at different addresses don't
        // look identical in the list.
        const { data: sessions } = await supabase
          .from('recurring_sessions')
          .select(`
            id,
            scheduled_date,
            start_time,
            recurring_job:recurring_jobs!recurring_sessions_recurring_job_id_fkey(
              client_id,
              trade_category,
              service_subtype,
              location,
              frequency_months,
              tradie:profiles!recurring_jobs_tradie_id_fkey(full_name)
            )
          `)
          .gte('scheduled_date', todayIso)
          .lte('scheduled_date', horizonIso)
          .in('status', ['scheduled', 'pending_confirmation', 'extra'])
          .limit(20);

        for (const s of sessions ?? []) {
          const job = s.recurring_job as { client_id?: string; trade_category?: string; service_subtype?: string | null; location?: string | null; frequency_months?: number | null; tradie?: { full_name?: string } | null } | null;
          if (!job || job.client_id !== user.id) continue;
          const date = new Date(s.scheduled_date + 'T' + (s.start_time || '09:00:00'));
          const tradeLabel = (job.service_subtype || job.trade_category || 'Service')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
          const tradieName = job.tradie?.full_name?.split(' ')[0] || 'your tradie';
          const suburb = suburbFrom(job.location);
          const time = s.start_time ? s.start_time.slice(0, 5) : null;
          // Build subtitle: tradie · time · suburb — drop falsy parts cleanly.
          const subtitle = [tradieName, time, suburb].filter(Boolean).join(' · ');
          next.push({
            key: `session-${s.id}`,
            date,
            icon: 'session',
            title: `${tradeLabel} visit`,
            subtitle,
            badge: frequencyLabel(job.frequency_months),
            href: '/schedule',
          });
        }

        // 2. Upcoming auto-invoice generation. Heuristic: last_invoiced_at (or
        // created_at) + billing_cycle. Approximates the cron's behaviour without
        // duplicating its day-of-week logic — close enough for a glance widget.
        const { data: jobs } = await supabase
          .from('recurring_jobs')
          .select('id, trade_category, service_subtype, billing_cycle, last_invoiced_at, created_at, agreed_price, is_active, cancelled_at, location, frequency_months')
          .eq('client_id', user.id)
          .eq('is_active', true)
          .is('cancelled_at', null);

        for (const j of jobs ?? []) {
          const anchor = j.last_invoiced_at ? new Date(j.last_invoiced_at) : new Date(j.created_at);
          const nextDate = addCycleToDate(anchor, j.billing_cycle);
          if (nextDate < now || nextDate > horizon) continue;
          const tradeLabel = (j.service_subtype || j.trade_category || 'Service')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
          const suburb = suburbFrom(j.location);
          const priceLabel = j.agreed_price ? `~$${j.agreed_price.toFixed(0)}/visit` : 'Auto-generated';
          const subtitle = [priceLabel, suburb].filter(Boolean).join(' · ');
          next.push({
            key: `invoice-${j.id}`,
            date: nextDate,
            icon: 'invoice',
            title: `${tradeLabel} invoice generates`,
            subtitle,
            badge: frequencyLabel(j.frequency_months),
            href: '/payments',
          });
        }

        // 3. Outstanding invoices about to go overdue (or already overdue).
        // Surfaced here so a "due tomorrow" doesn't sit invisible at the bottom
        // of the Invoices widget.
        const { data: invoices } = await supabase
          .from('recurring_invoices')
          .select('id, total, due_date, status')
          .eq('homeowner_id', user.id)
          .in('status', ['sent', 'overdue'])
          .not('due_date', 'is', null)
          .lte('due_date', horizonIso);

        for (const inv of invoices ?? []) {
          if (!inv.due_date) continue;
          const dueDate = new Date(inv.due_date + 'T23:59:59');
          const isOverdue = inv.status === 'overdue' || dueDate < now;
          next.push({
            key: `invoice-due-${inv.id}`,
            date: dueDate,
            icon: 'invoice',
            title: isOverdue ? 'Invoice overdue' : 'Invoice due',
            subtitle: `$${Number(inv.total).toFixed(2)} · pay before due date`,
            href: '/payments',
            warning: true,
          });
        }

        // 4. One-off jobs scheduled in the next 7 days.
        const { data: oneOffJobs } = await supabase
          .from('jobs')
          .select('id, title, description, scheduled_date, scheduled_time, status, profiles!jobs_tradie_id_fkey(full_name)')
          .eq('client_id', user.id)
          .in('status', ['funded', 'in_progress', 'accepted'])
          .gte('scheduled_date', todayIso)
          .lte('scheduled_date', horizonIso)
          .not('scheduled_date', 'is', null);

        for (const j of oneOffJobs ?? []) {
          const date = new Date(j.scheduled_date + 'T' + (j.scheduled_time || '09:00:00'));
          const category = (j.description as string)?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ');
          const label = j.title || category || 'Job';
          const tradie = (j.profiles as { full_name?: string } | null)?.full_name?.split(' ')[0] || 'your tradie';
          next.push({
            key: `job-${j.id}`,
            date,
            icon: 'job',
            title: `${label}`,
            subtitle: `${tradie} arriving${j.scheduled_time ? ` · ${j.scheduled_time.slice(0, 5)}` : ''}`,
            href: `/leads?job=${j.id}`,
          });
        }

        // Rolling view: once an event's scheduled time has elapsed it drops
        // out and the next upcoming one takes its place (the 60s refresh keeps
        // this live). Overdue invoices are kept — they still need action.
        const upcoming = next
          .filter((item) => item.warning || item.date >= now)
          .sort((a, b) => a.date.getTime() - b.date.getTime());
        setItems(upcoming.slice(0, 3));
      } catch (err) {
        console.error('UpcomingTimeline fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
    const timer = setInterval(fetchItems, 60_000);
    return () => clearInterval(timer);
  }, [user]);

  // Bucket the (already date-sorted) items by calendar day so the date shows
  // once as a heading instead of repeating on every row.
  const todayKey = dayKey(new Date());
  const dayGroups = items.reduce<{ key: string; label: string; isToday: boolean; items: Item[] }[]>((acc, item) => {
    const key = dayKey(item.date);
    let group = acc.find((g) => g.key === key);
    if (!group) {
      group = { key, label: formatDayHeading(item.date), isToday: key === todayKey, items: [] };
      acc.push(group);
    }
    group.items.push(item);
    return acc;
  }, []);

  return (
    <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-4 sm:p-6">
      <h3 className="font-semibold text-ct-paper mb-4 flex items-center gap-2">
        <Calendar className="w-5 h-5 text-ct-amber" />
        This Week
      </h3>

      {loading ? (
        <div className="space-y-2">
          <div className="h-12 bg-ct-surface-2 rounded-ct-sm animate-pulse" />
          <div className="h-12 bg-ct-surface-2 rounded-ct-sm animate-pulse" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 p-3 bg-ct-surface-2 rounded-ct-md border border-ct-line-soft">
          <Calendar className="w-5 h-5 text-ct-mute flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-ct-paper">Nothing scheduled</p>
            <p className="text-xs text-ct-mute">Your next 7 days are clear.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {dayGroups.map((dayGroup) => (
            <div key={dayGroup.key}>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${dayGroup.isToday ? 'text-ct-amber' : 'text-ct-mute'}`}>
                {dayGroup.label}
              </p>
              <div className="space-y-1">
                {dayGroup.items.map((item) => {
                  const Icon = item.icon === 'session' ? Calendar : item.icon === 'invoice' ? FileText : Briefcase;
                  const accentClass = item.warning
                    ? 'bg-ct-amber/[0.13] text-ct-amber'
                    : item.icon === 'session'
                      ? 'bg-ct-surface-2 text-ct-mute-2'
                      : item.icon === 'invoice'
                        ? 'bg-ct-surface-2 text-ct-mute-2'
                        : 'bg-ct-teal/[0.14] text-ct-teal';
                  return (
                    <Link
                      key={item.key}
                      to={item.href}
                      className="flex items-center gap-3 p-2.5 rounded-ct-md hover:bg-ct-surface-2 transition-colors group"
                    >
                      <div className={`w-9 h-9 rounded-ct-sm flex items-center justify-center flex-shrink-0 ${accentClass}`}>
                        {item.warning ? <AlertTriangle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-ct-paper truncate">{item.title}</p>
                          {item.badge && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-ct-surface-2 text-ct-mute-2 flex-shrink-0">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ct-mute truncate">{item.subtitle}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-ct-mute group-hover:text-ct-mute transition-colors flex-shrink-0" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
