import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

// Labels must match what the sidebar calls the same destination — a page named
// one thing in the menu and another in the breadcrumb reads as two places.
// Segments of routes that only redirect are deliberately absent: the crumb can
// never render for them.
const ROUTE_LABELS: Record<string, string> = {
  'dashboard': 'Dashboard',
  'admin': 'Admin',
  'overview': 'Overview',
  'users': 'User Management',
  'verifications': 'Verifications',
  'payments': 'Payments',
  'financials': 'Financials',
  'moderation': 'Moderation',
  'disputes': 'Disputes',
  'custom-tasks': 'Custom Tasks',
  'updates': 'Updates',
  'projects': 'Projects',
  'messages': 'Messages',
  'settings': 'Settings',
  'my-profile': 'My Profile',
  'my-trades': 'Saved Tradies',
  'schedule': 'Schedule',
  'work': 'Work Hub',
  'clients': 'Clients',
  'analytics': 'My Stats',
  'performance': 'Performance',
  'payouts': 'Payouts',
  'notifications': 'Notifications',
  'leads': 'My Jobs',
  'post-lead': 'Post a Job',
  'tracking': 'Job Tracking',
  'invoice': 'Invoice',
  'tax-invoice': 'Tax Invoice',
  'review': 'Leave a Review',
};

export default function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs whitespace-nowrap overflow-hidden text-gray-500 mb-4">
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
