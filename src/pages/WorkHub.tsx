import React, { useState } from 'react';
import { Briefcase, Package, GraduationCap } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import Leads from './Leads';
import Jobs from './Jobs';
import TradeCareers from './TradeCareers';

type WorkHubTab = 'leads' | 'jobs' | 'hiring';

export default function WorkHub() {
  const [activeTab, setActiveTab] = useState<WorkHubTab>('leads');

  const tabs: { key: WorkHubTab; label: string; icon: typeof Briefcase }[] = [
    { key: 'leads', label: 'Leads', icon: Briefcase },
    { key: 'jobs', label: 'Active Jobs', icon: Package },
    { key: 'hiring', label: 'Recruitment', icon: GraduationCap },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
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

        {activeTab === 'leads' && <Leads embedded />}
        {activeTab === 'jobs' && <Jobs embedded />}
        {activeTab === 'hiring' && <TradeCareers embedded />}
      </div>
    </DashboardLayout>
  );
}
