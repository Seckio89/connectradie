import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { replayOnReconnect } from './lib/serviceWorker';
import { trackPageView } from './lib/analytics';
import { Loader2 } from 'lucide-react';

// Eagerly loaded — these are entry points visitors hit first
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import NotFound from './pages/NotFound';

// Lazy loaded — only downloaded when the user navigates to them
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Search = lazy(() => import('./pages/Search'));
const MyTrades = lazy(() => import('./pages/MyTrades'));
const Settings = lazy(() => import('./pages/Settings'));
const Jobs = lazy(() => import('./pages/Jobs'));
const Messages = lazy(() => import('./pages/Messages'));
const Explore = lazy(() => import('./pages/Explore'));
const Projects = lazy(() => import('./pages/Projects'));
const PostLead = lazy(() => import('./pages/PostLead'));
const Leads = lazy(() => import('./pages/Leads'));
const AdminVerifications = lazy(() => import('./pages/AdminVerifications'));
const AdminOverview = lazy(() => import('./pages/AdminOverview'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminPayments = lazy(() => import('./pages/AdminPayments'));
const AdminModeration = lazy(() => import('./pages/AdminModeration'));
const Team = lazy(() => import('./pages/Team'));
const SiteCalendar = lazy(() => import('./pages/SiteCalendar'));
const TradeCareers = lazy(() => import('./pages/TradeCareers'));
const Schedule = lazy(() => import('./pages/Schedule'));
const WorkHub = lazy(() => import('./pages/WorkHub'));
const PerformanceInsights = lazy(() => import('./pages/PerformanceInsights'));
const Payouts = lazy(() => import('./pages/Payouts'));
const PublicTradieProfile = lazy(() => import('./pages/PublicTradieProfile'));
const MyProfile = lazy(() => import('./pages/MyProfile'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Contact = lazy(() => import('./pages/Contact'));

function PageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children, requireAdmin, requireTradie, requireOnboarding = true }: { children: React.ReactNode; requireAdmin?: boolean; requireTradie?: boolean; requireOnboarding?: boolean }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <PageSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (requireOnboarding && profile && !profile.onboarding_completed) {
    return <Navigate to="/onboarding" />;
  }

  if (requireAdmin && profile?.role !== 'admin') {
    return <Navigate to="/dashboard" />;
  }

  if (requireTradie && profile?.role !== 'tradie') {
    return <Navigate to="/dashboard" />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <PageSpinner />;
  }

  if (user && profile?.onboarding_completed) {
    return <Navigate to="/dashboard" />;
  }

  return <>{children}</>;
}

function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);
  return null;
}

function AppRoutes() {
  useEffect(() => {
    replayOnReconnect();
    window.addEventListener('online', replayOnReconnect);
    return () => window.removeEventListener('online', replayOnReconnect);
  }, []);

  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute requireOnboarding={false}>
            <Onboarding />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route path="/search" element={<Search />} />
      <Route path="/tradie/:id" element={<PublicTradieProfile />} />
      <Route path="/explore" element={<Explore />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/contact" element={<Contact />} />
      <Route
        path="/my-trades"
        element={
          <ProtectedRoute>
            <MyTrades />
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs"
        element={
          <ProtectedRoute>
            <Jobs />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <Projects />
          </ProtectedRoute>
        }
      />
      <Route
        path="/post-lead"
        element={
          <ProtectedRoute>
            <PostLead />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads"
        element={
          <ProtectedRoute>
            <Leads />
          </ProtectedRoute>
        }
      />
      <Route
        path="/messages"
        element={
          <ProtectedRoute>
            <Messages />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/overview"
        element={
          <ProtectedRoute requireAdmin>
            <AdminOverview />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute requireAdmin>
            <AdminUsers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/verifications"
        element={
          <ProtectedRoute requireAdmin>
            <AdminVerifications />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/payments"
        element={
          <ProtectedRoute requireAdmin>
            <AdminPayments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/moderation"
        element={
          <ProtectedRoute requireAdmin>
            <AdminModeration />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-profile"
        element={
          <ProtectedRoute requireTradie>
            <MyProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/schedule"
        element={
          <ProtectedRoute requireTradie>
            <Schedule />
          </ProtectedRoute>
        }
      />
      <Route
        path="/work"
        element={
          <ProtectedRoute requireTradie>
            <WorkHub />
          </ProtectedRoute>
        }
      />
      <Route
        path="/performance"
        element={
          <ProtectedRoute requireTradie>
            <PerformanceInsights />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payouts"
        element={
          <ProtectedRoute requireTradie>
            <Payouts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/team"
        element={
          <ProtectedRoute requireTradie>
            <Team />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trade-careers"
        element={
          <ProtectedRoute requireTradie>
            <TradeCareers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/site-calendar"
        element={
          <ProtectedRoute requireTradie>
            <SiteCalendar />
          </ProtectedRoute>
        }
      />
      <Route path="/verification" element={<Navigate to="/settings" replace />} />
      <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <Router>
      <RouteTracker />
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}
