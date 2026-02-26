import { useAuth } from '../contexts/AuthContext';
import ClientDashboard from './ClientDashboard';
import TradieDashboard from './TradieDashboard';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function Dashboard() {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" />;
  }

  if (!profile.onboarding_completed) {
    return <Navigate to="/onboarding" />;
  }

  if (profile.role === 'admin') {
    return <Navigate to="/admin/overview" />;
  }

  if (profile.role === 'tradie') {
    return <TradieDashboard />;
  }

  return <ClientDashboard />;
}
