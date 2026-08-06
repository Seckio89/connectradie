import { useState, useEffect } from 'react';
import { CalendarDays, Users, ChevronRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import SiteCalendar from './SiteCalendar';
import Team from './Team';
import ServicesTab from '../components/ServicesTab';
import ClientServicesTab from '../components/ClientServicesTab';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type ScheduleTab = 'calendar' | 'team';

export default function Schedule() {
  // Deep-linkable tab (?tab=team) — used by e.g. the Assign Worker modal's
  // "Go to My Team" link. Mirrors the WorkHub ?tab= pattern.
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<ScheduleTab>(
    searchParams.get('tab') === 'team' ? 'team' : 'calendar'
  );
  const { profile, user } = useAuth();
  const isTradie = profile?.role === 'tradie';

  useEffect(() => {
    setActiveTab(searchParams.get('tab') === 'team' ? 'team' : 'calendar');
  }, [searchParams]);

  // Single-service clients get a focused layout: their service first, the
  // calendar collapsed below it. null = still counting (avoids a layout flash).
  const [activeServiceCount, setActiveServiceCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user || isTradie) return;
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from('recurring_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', user.id)
        .eq('is_active', true);
      if (!cancelled) setActiveServiceCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [user, isTradie]);

  const isSingleService = !isTradie && activeServiceCount === 1;

  const tabs: { key: ScheduleTab; label: string; icon: typeof CalendarDays }[] = isTradie
    ? [
        { key: 'calendar', label: 'Site Calendar', icon: CalendarDays },
        { key: 'team', label: 'My Team', icon: Users },
      ]
    : [
        { key: 'calendar', label: 'My Calendar', icon: CalendarDays },
      ];

  const breadcrumbLabel = tabs.find(t => t.key === activeTab)?.label || 'Calendar';

  return (
    <DashboardLayout wide>
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-ct-mute mb-4">
          <Link to="/dashboard" className="hover:text-ct-mute-2 transition-colors">Dashboard</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="font-medium text-ct-paper">{isTradie ? 'Teams & Schedule' : 'Schedule'}</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-ct-mute-2">{breadcrumbLabel}</span>
        </nav>

        {isTradie && (
          <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
            <div className="flex items-center gap-1 bg-ct-surface-2 rounded-ct-md p-1 w-fit">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-ct-sm text-sm font-medium transition-all ${
                      activeTab === tab.key
                        ? 'bg-ct-surface text-ct-paper shadow-sm'
                        : 'text-ct-mute hover:text-ct-mute-2'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
            {/* HIDDEN until the Google Calendar import issue is fixed. The
                /calendar-import route still works for direct testing — just
                restore this Link to re-expose the entry point. */}
            {/* eslint-disable-next-line no-constant-binary-expression */}
            {false && (
              <Link
                to="/calendar-import"
                className="inline-flex items-center gap-2 px-4 py-2 border border-ct-line rounded-ct-sm text-sm font-medium text-ct-mute-2 hover:bg-ct-surface-2 whitespace-nowrap"
              >
                <CalendarDays className="w-4 h-4 text-ct-mute-2" /> Import from Google Calendar
              </Link>
            )}
          </div>
        )}

        {activeTab === 'calendar' && (
          !isTradie && activeServiceCount === null ? (
            <div className="flex items-center justify-center py-16">
              <span className="w-6 h-6 border-2 border-ct-line border-t-gray-500 rounded-full animate-spin" />
            </div>
          ) : isSingleService ? (
            <>
              {/* Single-service client: lead with the service, calendar collapsed below */}
              <div className="mb-10">
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-ct-paper">Ongoing Services</h2>
                  <p className="text-sm text-ct-mute mt-0.5">
                    Your recurring services, upcoming sessions, and invoices
                  </p>
                </div>
                <ClientServicesTab />
              </div>
              <div className="pt-8 border-t border-ct-line">
                <SiteCalendar embedded defaultCollapsed />
              </div>
            </>
          ) : (
            <>
              <SiteCalendar embedded />

              {/* Ongoing Services section */}
              <div className="mt-10 pt-8 border-t border-ct-line">
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-ct-paper">
                    Ongoing Services
                  </h2>
                  <p className="text-sm text-ct-mute mt-0.5">
                    {isTradie
                      ? 'Regular clients, upcoming visits, and invoices'
                      : 'Your recurring services, upcoming sessions, and invoices'}
                  </p>
                </div>
                {isTradie ? <ServicesTab /> : <ClientServicesTab />}
              </div>
            </>
          )
        )}
        {activeTab === 'team' && isTradie && <Team embedded />}
      </div>
    </DashboardLayout>
  );
}
