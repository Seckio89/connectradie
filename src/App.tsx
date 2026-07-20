import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useDarkMode } from './hooks/useDarkMode';
import { replayOnReconnect } from './lib/serviceWorker';
import { trackPageView } from './lib/analytics';
import { Loader2 } from 'lucide-react';
import OfflineBanner from './components/OfflineBanner';
import ErrorBoundary from './components/ErrorBoundary';
import { isPlatformAdmin } from './lib/subscription';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}

// Eagerly loaded — these are entry points visitors hit first
import LandingPage from './pages/LandingPage';
import HireLanding from './pages/HireLanding';
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
const CareersPublic = lazy(() => import('./pages/CareersPublic'));
const CareerDetailPublic = lazy(() => import('./pages/CareerDetailPublic'));
const Projects = lazy(() => import('./pages/Projects'));
const PostLead = lazy(() => import('./pages/PostLead'));
const Leads = lazy(() => import('./pages/Leads'));
const AdminVerifications = lazy(() => import('./pages/AdminVerifications'));
const AdminOverview = lazy(() => import('./pages/AdminOverview'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminPayments = lazy(() => import('./pages/AdminPayments'));
const AdminModeration = lazy(() => import('./pages/AdminModeration'));
const AdminCustomTasks = lazy(() => import('./pages/AdminCustomTasks'));
const AdminDisputes = lazy(() => import('./pages/AdminDisputes'));
const AdminUpdates = lazy(() => import('./pages/AdminUpdates'));
const AdminFinancials = lazy(() => import('./pages/AdminFinancials'));
const Schedule = lazy(() => import('./pages/Schedule'));
const CalendarImport = lazy(() => import('./pages/CalendarImport'));
const Clients = lazy(() => import('./pages/Clients'));
const ClientDetail = lazy(() => import('./pages/ClientDetail'));
const PublicQuote = lazy(() => import('./pages/PublicQuote'));
const WorkHub = lazy(() => import('./pages/WorkHub'));
const PerformanceInsights = lazy(() => import('./pages/PerformanceInsights'));
const Payouts = lazy(() => import('./pages/Payouts'));
const PublicTradieProfile = lazy(() => import('./pages/PublicTradieProfile'));
const MyProfile = lazy(() => import('./pages/MyProfile'));
const JobTracking = lazy(() => import('./pages/JobTracking'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Contact = lazy(() => import('./pages/Contact'));
const HelpFAQ = lazy(() => import('./pages/HelpFAQ'));
const Pricing = lazy(() => import('./pages/Pricing'));
const AnalyticsDashboard = lazy(() => import('./pages/AnalyticsDashboard'));
const PaymentHistory = lazy(() => import('./pages/PaymentHistory'));
const PaymentSuccess = lazy(() => import('./pages/PaymentSuccess'));
const PaymentCancelled = lazy(() => import('./pages/PaymentCancelled'));
const Invoice = lazy(() => import('./pages/Invoice'));
const Notifications = lazy(() => import('./pages/Notifications'));
const LeaveReview = lazy(() => import('./pages/LeaveReview'));

// SEO landing pages — programmatic /find and /costs hierarchy. These are
// public, no auth, indexable. See src/lib/seoContent/ for the data source.
const FindTradies = lazy(() => import('./pages/FindTradies'));
const FindByTrade = lazy(() => import('./pages/FindByTrade'));
const FindByLocation = lazy(() => import('./pages/FindByLocation'));
const CostGuide = lazy(() => import('./pages/CostGuide'));

function PageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children, requireAdmin, requireTradie, requireClient, requireOnboarding = true }: { children: React.ReactNode; requireAdmin?: boolean; requireTradie?: boolean; requireClient?: boolean; requireOnboarding?: boolean }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <PageSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  // User is authenticated but has no profile — account was removed by admin
  if (!profile && !loading) {
    return <Navigate to="/login" />;
  }

  if (requireOnboarding && profile && !profile.onboarding_completed) {
    return <Navigate to="/onboarding" />;
  }

  // Platform admins (role='admin' OR the is_admin entitlement flag) may enter the
  // admin panels — this lets the owner keep a tradie account yet still administer.
  if (requireAdmin && !isPlatformAdmin(profile)) {
    return <Navigate to="/dashboard" />;
  }

  if (requireTradie && profile?.role !== 'tradie') {
    return <Navigate to="/dashboard" />;
  }

  if (requireClient && profile?.role !== 'client') {
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

const PAGE_TITLES: Record<string, string> = {
  '/': 'ConnecTradie — Find Trusted Local Tradies',
  '/login': 'Sign In | ConnecTradie',
  '/register': 'Register | ConnecTradie',
  '/onboarding': 'Get Started | ConnecTradie',
  '/dashboard': 'Dashboard | ConnecTradie',
  '/leads': 'My Jobs | ConnecTradie',
  '/post-lead': 'Post a Job | ConnecTradie',
  '/search': 'Search Tradies | ConnecTradie',
  '/my-trades': 'Saved Tradies | ConnecTradie',
  '/projects': 'Projects | ConnecTradie',
  '/jobs': 'Active Jobs | ConnecTradie',
  '/messages': 'Messages | ConnecTradie',
  '/notifications': 'Notifications | ConnecTradie',
  '/settings': 'Settings | ConnecTradie',
  '/payments': 'Payments | ConnecTradie',
  '/review': 'Leave a Review | ConnecTradie',
  '/payouts': 'Payouts | ConnecTradie',
  '/schedule': 'Schedule | ConnecTradie',
  '/calendar-import': 'Import from Google Calendar | ConnecTradie',
  '/work': 'Work Hub | ConnecTradie',
  '/my-profile': 'My Profile | ConnecTradie',
  '/explore': 'Explore | ConnecTradie',
  '/careers': 'Trade Jobs & Apprenticeships | ConnecTradie',
  '/contact': 'Contact | ConnecTradie',
  '/help': 'Help & FAQ | ConnecTradie',
  '/pricing': 'Pricing | ConnecTradie',
  '/terms': 'Terms of Service | ConnecTradie',
  '/privacy': 'Privacy Policy | ConnecTradie',
  '/analytics': 'Analytics | ConnecTradie',
  '/performance': 'Performance Insights | ConnecTradie',
  '/admin': 'Admin | ConnecTradie',
  '/admin/verifications': 'Verifications | ConnecTradie Admin',
  '/admin/users': 'Users | ConnecTradie Admin',
  '/admin/payments': 'Payments | ConnecTradie Admin',
  '/admin/moderation': 'Moderation | ConnecTradie Admin',
  '/admin/disputes': 'Disputes | ConnecTradie Admin',
  '/admin/financials': 'Financials | ConnecTradie Admin',
};

function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
    document.title = PAGE_TITLES[location.pathname] || 'ConnecTradie';
  }, [location]);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
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
      <Route path="/hire" element={<HireLanding />} />
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
      <Route path="/careers" element={<CareersPublic />} />
      <Route path="/careers/:id" element={<CareerDetailPublic />} />

      {/* SEO landing pages — order matters; most specific first */}
      <Route path="/find/:trade/:locationSlug" element={<FindTradies />} />
      <Route path="/find/:trade" element={<FindByTrade />} />
      <Route path="/find-in/:locationSlug" element={<FindByLocation />} />
      <Route path="/quote/:token" element={<PublicQuote />} />
      <Route path="/costs/:trade" element={<CostGuide />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/help" element={<HelpFAQ />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/payment-success" element={<PaymentSuccess />} />
      <Route path="/payment-cancelled" element={<PaymentCancelled />} />
      <Route path="/invoice/:paymentId" element={<Invoice />} />
      <Route
        path="/my-trades"
        element={
          <ProtectedRoute requireClient>
            <MyTrades />
          </ProtectedRoute>
        }
      />
      <Route path="/jobs" element={<Navigate to="/work" replace />} />
      <Route path="/team" element={<Navigate to="/schedule?tab=team" replace />} />
      <Route
        path="/projects"
        element={
          <ProtectedRoute requireClient>
            <Projects />
          </ProtectedRoute>
        }
      />
      <Route
        path="/post-lead"
        element={
          <ProtectedRoute requireClient>
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
        path="/admin/financials"
        element={
          <ProtectedRoute requireAdmin>
            <AdminFinancials />
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
        path="/admin/custom-tasks"
        element={
          <ProtectedRoute requireAdmin>
            <AdminCustomTasks />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/disputes"
        element={
          <ProtectedRoute requireAdmin>
            <AdminDisputes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/updates"
        element={
          <ProtectedRoute requireAdmin>
            <AdminUpdates />
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
        path="/tracking/:jobId"
        element={
          <ProtectedRoute>
            <JobTracking />
          </ProtectedRoute>
        }
      />
      <Route
        path="/schedule"
        element={
          <ProtectedRoute>
            <Schedule />
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar-import"
        element={
          <ProtectedRoute requireTradie>
            <CalendarImport />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients"
        element={
          <ProtectedRoute requireTradie>
            <Clients />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients/:id"
        element={
          <ProtectedRoute requireTradie>
            <ClientDetail />
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
        path="/analytics"
        element={
          <ProtectedRoute requireTradie>
            <AnalyticsDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <Notifications />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payments"
        element={
          <ProtectedRoute>
            <PaymentHistory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/review/:jobId"
        element={
          <ProtectedRoute>
            <LeaveReview />
          </ProtectedRoute>
        }
      />
      <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
      <Route path="/verification" element={<Navigate to="/settings" replace />} />
      <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  useDarkMode();
  return (
    <ErrorBoundary>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <OfflineBanner />
        <a href="#main-content" className="skip-to-content">Skip to content</a>
        <RouteTracker />
        <ScrollToTop />
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}
