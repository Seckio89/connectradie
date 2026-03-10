import { useState } from 'react';
import { CalendarDays, Users, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import SiteCalendar from './SiteCalendar';
import Team from './Team';

type ScheduleTab = 'calendar' | 'team';

export default function Schedule() {
  const [activeTab, setActiveTab] = useState<ScheduleTab>('calendar');

  const tabs: { key: ScheduleTab; label: string; icon: typeof CalendarDays }[] = [
    { key: 'calendar', label: 'Site Calendar', icon: CalendarDays },
    { key: 'team', label: 'My Team', icon: Users },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto">
        <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
          <Link to="/dashboard" className="hover:text-primary-600 transition-colors">Dashboard</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="font-medium text-gray-900">Schedule</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-700">{tabs.find(t => t.key === activeTab)?.label}</span>
        </nav>
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

        {activeTab === 'calendar' && <SiteCalendar embedded />}
        {activeTab === 'team' && <Team embedded />}
      </div>
    </DashboardLayout>
  );
}
