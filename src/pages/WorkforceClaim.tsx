// ─────────────────────────────────────────────────────────────────────────────
// WorkforceClaim — the landing page for a worker-invite link.
//
// Reads ?token= and posts it to worker-claim-profile. This is the only surface
// that makes that Edge Function reachable, so it ships with it.
//
// A worker arriving here may not be signed in. We send them to /login with a
// redirect back, preserving the token, rather than silently failing.
//
// Note: the static /workforce/claim segment outranks the dynamic
// /workforce/:workerId route in React Router's ranking, so the two do not collide.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type Phase = 'checking' | 'ready' | 'claiming' | 'done' | 'error';

export default function WorkforceClaim() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const token = params.get('token') ?? '';
  const [phase, setPhase] = useState<Phase>('checking');
  const [message, setMessage] = useState('');
  const [teamMemberId, setTeamMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setPhase('error');
      setMessage('This invite link is missing its token. Ask the business to send a new one.');
      return;
    }
    if (!user) {
      const back = encodeURIComponent(`/workforce/claim?token=${encodeURIComponent(token)}`);
      navigate(`/login?redirect=${back}`, { replace: true });
      return;
    }
    setPhase('ready');
  }, [authLoading, user, token, navigate]);

  const claim = useCallback(async () => {
    setPhase('claiming');
    setMessage('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setPhase('error');
        setMessage('Your session has expired. Please sign in again.');
        return;
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/worker-claim-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ token }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhase('error');
        setMessage(payload?.error || 'We could not accept this invite.');
        return;
      }
      setTeamMemberId(payload.teamMemberId ?? null);
      setPhase('done');
    } catch (e) {
      console.error('WorkforceClaim: claim failed', e);
      setPhase('error');
      setMessage('We could not accept this invite. Please try again.');
    }
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-xl shadow-sm p-6 w-full max-w-md">
        {phase === 'checking' && (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Checking your invite…</span>
          </div>
        )}

        {(phase === 'ready' || phase === 'claiming') && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-8 h-8 text-primary-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Join your team</h1>
              <p className="text-sm text-gray-600 mt-1">
                Accepting links this account to the business's roster so you can keep your own
                tickets, licences and certificates up to date.
              </p>
            </div>
            <button
              onClick={() => void claim()}
              disabled={phase === 'claiming'}
              className="inline-flex items-center justify-center gap-2 px-5 py-2 min-h-[44px] bg-warm-500 hover:bg-warm-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {phase === 'claiming' && <Loader2 className="w-4 h-4 animate-spin" />}
              Accept invite
            </button>
          </div>
        )}

        {phase === 'done' && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">You're on the team</h1>
              <p className="text-sm text-gray-600 mt-1">
                Your invite has been accepted. Your account role on the marketplace is unchanged.
              </p>
            </div>
            <Link
              to={teamMemberId ? `/workforce/${teamMemberId}` : '/dashboard'}
              className="inline-flex items-center justify-center px-5 py-2 min-h-[44px] bg-warm-500 hover:bg-warm-600 text-white rounded-lg text-sm font-medium"
            >
              Continue
            </Link>
          </div>
        )}

        {phase === 'error' && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">We couldn't accept this invite</h1>
              <p className="text-sm text-gray-600 mt-1">{message}</p>
            </div>
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Go to dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
