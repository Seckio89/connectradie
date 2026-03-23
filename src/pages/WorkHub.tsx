import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Briefcase, Package, GraduationCap, Infinity as InfinityIcon, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import Leads from './Leads';
import Jobs from './Jobs';
import TradeCareers from './TradeCareers';
import ServicesTab from '../components/ServicesTab';

type WorkHubTab = 'leads' | 'jobs' | 'services' | 'hiring';

const tabFromParam: Record<string, WorkHubTab> = {
  active: 'jobs',
  services: 'services',
  recruitment: 'hiring',
};

export default function WorkHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = tabFromParam[searchParams.get('tab') || ''] || 'leads';
  const [activeTab, setActiveTab] = useState<WorkHubTab>(initialTab);

  // Sync URL param to tab state when navigating via sidebar
  useEffect(() => {
    const paramTab = tabFromParam[searchParams.get('tab') || ''] || 'leads';
    setActiveTab(paramTab);
  }, [searchParams]);

  const tabs: { key: WorkHubTab; label: string; icon: typeof Briefcase }[] = [
    { key: 'leads', label: 'Leads', icon: Briefcase },
    { key: 'jobs', label: 'My Jobs', icon: Package },
    { key: 'services', label: 'Ongoing Services', icon: InfinityIcon },
    { key: 'hiring', label: 'Hiring', icon: GraduationCap },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
          <Link to="/dashboard" className="hover:text-gray-600 transition-colors">Dashboard</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-600">Work Hub</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-800 font-medium">{tabs.find(t => t.key === activeTab)?.label}</span>
        </nav>

        <h1 className="text-xl font-bold text-gray-900 mb-1">Work Hub</h1>
        <p className="text-sm text-gray-500 mb-4">
          {activeTab === 'leads' && 'Browse new job requests from clients and submit your quotes'}
          {activeTab === 'jobs' && 'Track jobs you\'ve been assigned and manage active work'}
          {activeTab === 'services' && 'Manage ongoing client relationships, log visits, and generate invoices'}
          {activeTab === 'hiring' && 'Post vacancies and find apprentices or qualified tradies to join your team'}
        </p>

        <div className="flex items-center gap-0.5 border-b border-gray-200 mb-5">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  const paramKey = tab.key === 'jobs' ? 'active' : tab.key === 'services' ? 'services' : tab.key === 'hiring' ? 'recruitment' : '';
                  if (paramKey) {
                    setSearchParams({ tab: paramKey }, { replace: true });
                  } else {
                    setSearchParams({}, { replace: true });
                  }
                }}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
                  isActive
                    ? 'border-warm-500 text-gray-900'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <SectionErrorBoundary>
          {activeTab === 'leads' && <Leads embedded />}
          {activeTab === 'jobs' && <Jobs embedded />}
          {activeTab === 'services' && <ServicesTab />}
          {activeTab === 'hiring' && <TradeCareers embedded />}
        </SectionErrorBoundary>
      </div>
    </DashboardLayout>
  );
}
