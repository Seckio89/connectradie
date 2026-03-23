import { useState } from 'react';
import { CalendarDays, Users, ChevronRight, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import SiteCalendar from './SiteCalendar';
import Team from './Team';
import ServicesTab from '../components/ServicesTab';
import ClientServicesTab from '../components/ClientServicesTab';
import { useAuth } from '../contexts/AuthContext';

type ScheduleTab = 'calendar' | 'team';

export default function Schedule() {
  const [activeTab, setActiveTab] = useState<ScheduleTab>('calendar');
  const { profile } = useAuth();
  const isTradie = profile?.role === 'tradie';

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
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto">
        <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
          <Link to="/dashboard" className="hover:text-primary-600 transition-colors">Dashboard</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="font-medium text-gray-900">Schedule</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-700">{breadcrumbLabel}</span>
        </nav>

        {tabs.length > 1 && (
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.key
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {activeTab === 'calendar' && (
          <>
            <SiteCalendar embedded />

            {/* Ongoing Services section */}
            <div className="mt-10 pt-8 border-t border-gray-200">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  Ongoing Services
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {isTradie
                    ? 'Regular clients, upcoming visits, and invoices'
                    : 'Your recurring services, upcoming sessions, and invoices'}
                </p>
              </div>
              {isTradie ? <ServicesTab /> : <ClientServicesTab />}
            </div>
          </>
        )}
        {activeTab === 'team' && isTradie && <Team embedded />}
      </div>
    </DashboardLayout>
  );
}
