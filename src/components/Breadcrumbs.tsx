import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const ROUTE_LABELS: Record<string, string> = {
  'dashboard': 'Dashboard',
  'admin': 'Admin',
  'overview': 'Overview',
  'users': 'Users',
  'verifications': 'Verifications',
  'payments': 'Payments',
  'moderation': 'Moderation',
  'disputes': 'Disputes',
  'jobs': 'Jobs',
  'projects': 'Projects',
  'messages': 'Messages',
  'settings': 'Settings',
  'my-profile': 'My Profile',
  'my-trades': 'My Trades',
  'schedule': 'Schedule',
  'work': 'Work Hub',
  'analytics': 'Analytics',
  'performance': 'Performance',
  'payouts': 'Payouts',
  'notifications': 'Notifications',
  'leads': 'Leads',
  'post-lead': 'Post Lead',
  'team': 'Team',
};

export default function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 text-sm text-gray-500 mb-4">
      <Link to="/dashboard" className="hidden sm:flex hover:text-gray-700 transition-colors">
        <Home className="w-3.5 h-3.5" />
      </Link>
      {segments.map((segment, index) => {
        const path = '/' + segments.slice(0, index + 1).join('/');
        const label = ROUTE_LABELS[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
        const isLast = index === segments.length - 1;

        return (
          <span key={path} className="flex items-center gap-1.5">
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            {isLast ? (
              <span className="font-medium text-gray-900">{label}</span>
            ) : (
              <Link to={path} className="hover:text-gray-700 transition-colors">{label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
