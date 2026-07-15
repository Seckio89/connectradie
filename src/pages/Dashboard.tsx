import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ClientDashboard from './ClientDashboard';
import TradieDashboard from './TradieDashboard';
import OnboardingWelcome from '../components/onboarding/OnboardingWelcome';
import OnboardingStageTwo from '../components/onboarding/OnboardingStageTwo';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { fetchOnboardingSignals, resolveStage, setOnboardingStage } from '../lib/onboardingStage';

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
  </div>
);

export default function Dashboard() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const [resolving, setResolving] = useState(true);
  const resolvedRef = useRef(false);

  const stage = profile?.onboarding_stage ?? 4;
  const needsResolve =
    !!profile && profile.onboarding_completed && profile.role !== 'admin' && stage < 4;

  // Auto-detect (#7): if a user is below the full stage, check whether their data
  // already justifies a higher stage and advance them — so existing users (and
  // users who complete a key action elsewhere) are never re-onboarded. Advance
  // only; never downgrade. Runs once per mount.
  useEffect(() => {
    let active = true;
    if (!needsResolve || resolvedRef.current || !profile) {
      setResolving(false);
      return;
    }
    resolvedRef.current = true;
    (async () => {
      try {
        const signals = await fetchOnboardingSignals(profile);
        const target = Math.max(stage, resolveStage(profile.role, signals));
        if (target > stage && user) {
          await setOnboardingStage(user.id, target);
          await refreshProfile();
        }
      } catch {
        /* ignore — render the current stage */
      } finally {
        if (active) setResolving(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsResolve, profile?.id]);

  if (loading) return <Spinner />;
  if (!profile) return <Navigate to="/login" />;
  if (!profile.onboarding_completed) return <Navigate to="/onboarding" />;
  if (profile.role === 'admin') return <Navigate to="/admin/overview" />;

  // While auto-detecting a sub-stage-4 user, hold on a spinner so existing users
  // never flash the welcome screen before being advanced.
  if (needsResolve && resolving) return <Spinner />;

  const effStage = profile.onboarding_stage ?? 4;
  if (effStage <= 1) return <OnboardingWelcome />;
  if (effStage === 2) return <OnboardingStageTwo />;

  return profile.role === 'tradie' ? <TradieDashboard /> : <ClientDashboard />;
}
