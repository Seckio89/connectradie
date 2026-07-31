import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Loader2, AlertCircle, Eye, EyeOff, CheckCircle2, ArrowLeft, ShieldX, X, UserX } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { signInWithGoogleNative, isGoogleCancel, showGoogleSignIn } from '../lib/nativeGoogleAuth';
import { friendlyError } from '../lib/utils';
import SEO from '../components/SEO';
import BetaModal from '../components/BetaModal';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');
  const [removedNotice, setRemovedNotice] = useState<{ reason: string; message: string } | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  // Google sign-in does a top-level redirect to Google, so we keep the spinner
  // up on the way out. If the user then cancels / hits Back, the browser can
  // restore this page from the back-forward cache with `googleLoading` still
  // true — leaving the button stuck spinning. Reset all in-flight loading state
  // whenever the page is restored from bfcache (pageshow.persisted).
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setGoogleLoading(false);
        setLoading(false);
        setResetLoading(false);
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError('');

    // Native app: Google blocks OAuth inside embedded WebViews (Error 403:
    // disallowed_useragent), so use the plugin's native account picker +
    // signInWithIdToken instead of the web redirect below.
    if (Capacitor.isNativePlatform()) {
      try {
        await signInWithGoogleNative();
        navigate('/dashboard');
      } catch (err) {
        if (!isGoogleCancel(err)) {
          setError('Google sign-in didn’t complete. Please try again, or use your email and password.');
        }
        setGoogleLoading(false);
      }
      return;
    }

    try {
      // Preflight: confirm Google is actually enabled as an auth provider BEFORE
      // handing the browser to Supabase. signInWithOAuth navigates the top-level
      // window straight to the authorize URL, and a disabled/misconfigured
      // provider responds with a raw JSON error page ("Unsupported provider…")
      // instead of an error we can catch — especially jarring inside the
      // Capacitor WebView. /auth/v1/settings is CORS-enabled and lists which
      // external providers are on, so we can fail gracefully here instead.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      try {
        const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
          headers: { apikey: anonKey },
        });
        if (res.ok) {
          const settings = await res.json();
          if (settings?.external?.google === false) {
            throw new Error('google-provider-disabled');
          }
        }
      } catch (preflightErr) {
        // Only block if we positively confirmed the provider is off; a network
        // hiccup on the settings probe shouldn't stop a working sign-in.
        if (preflightErr instanceof Error && preflightErr.message === 'google-provider-disabled') {
          throw preflightErr;
        }
      }

      // redirectTo resolves to the live origin (e.g. https://connectradie.com/dashboard),
      // which is what the Capacitor WebView loads — so the OAuth round-trip stays
      // in-app. This URL must be whitelisted in Supabase Auth → URL Configuration.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) throw error;
      // Success: the browser is now redirecting to Google — keep the spinner up.
    } catch {
      setError('Google sign-in isn’t available right now. Please sign in with your email and password.');
      setGoogleLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/settings`,
    });

    setResetLoading(false);
    if (error) {
      setResetError(friendlyError(error, 'Unable to send reset email. Please check your email address.'));
    } else {
      setResetSent(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn(email, password);

    if (result.error) {
      setError(friendlyError(result.error, 'Invalid email or password. Please try again.'));
      setLoading(false);
      return;
    }

    // Account was removed by admin — show removal notice
    if (result.removed) {
      setRemovedNotice({
        reason: result.removalReason || 'Your account has been removed by an administrator.',
        message: result.removalMessage || '',
      });
      setLoading(false);
      return;
    }

    // Account was self-deleted — show different message
    if (result.selfDeleted) {
      setRemovedNotice({
        reason: 'self_deleted',
        message: '',
      });
      setLoading(false);
      return;
    }

    navigate('/dashboard');
  };

  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-ct-surface flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <SEO title="Reset Password" description="Reset your ConnecTradie account password." noindex />
        <BetaModal />
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <Link to="/" className="flex items-center justify-center">
            <span className="text-2xl font-extrabold tracking-tight text-ct-paper">
              Connec<span className="text-ct-teal">Tradie</span>
            </span>
          </Link>
          <h2 className="mt-6 text-center text-3xl font-bold text-ct-paper">
            Reset your password
          </h2>
          <p className="mt-2 text-center text-ct-mute-2">
            Enter your email and we'll send you a reset link
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-ct-surface py-8 px-4 shadow-sm rounded-ct-lg sm:px-10 border border-ct-line-soft">
            {resetError && (
              <div className="mb-6 p-4 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-ct-rose flex-shrink-0 mt-0.5" />
                <p className="text-sm text-ct-rose">{resetError}</p>
              </div>
            )}

            {resetSent ? (
              <div className="text-center">
                <div className="w-16 h-16 bg-ct-teal/[0.14] rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-ct-teal" />
                </div>
                <h3 className="text-lg font-semibold text-ct-paper mb-2">Check your email</h3>
                <p className="text-ct-mute-2 text-sm mb-6">
                  If an account exists for {resetEmail}, we've sent a password reset link.
                </p>
                <button
                  onClick={() => {
                    setShowForgotPassword(false);
                    setResetSent(false);
                    setResetEmail('');
                  }}
                  className="inline-flex items-center gap-2 text-ct-mute-2 font-medium hover:text-ct-mute-2 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <form onSubmit={handleResetPassword} className="space-y-6">
                  <div>
                    <label htmlFor="reset-email" className="block text-sm font-medium text-ct-mute-2 mb-2">
                      Email address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ct-mute" />
                      <input
                        id="reset-email"
                        type="email"
                        required
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal focus:border-ct-teal transition-all"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full py-3 px-4 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {resetLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send Reset Link'
                    )}
                  </button>
                </form>

                <button
                  onClick={() => {
                    setShowForgotPassword(false);
                    setResetError('');
                  }}
                  className="mt-6 w-full text-center text-sm text-ct-mute-2 hover:text-ct-paper transition-colors inline-flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ct-surface flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <SEO title="Sign In" description="Sign in to your ConnecTradie account." noindex />
      <BetaModal />
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link to="/" className="flex items-center justify-center">
          <span className="text-2xl font-extrabold tracking-tight text-ct-paper">
            Connec<span className="text-ct-teal">Tradie</span>
          </span>
        </Link>
        <h2 className="mt-6 text-center text-3xl font-bold text-ct-paper">
          Welcome back
        </h2>
        <p className="mt-2 text-center text-ct-mute-2">
          Sign in to manage your jobs and messages
        </p>
      </div>

      {/* Account Notice Modal */}
      {removedNotice && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[70] p-4 animate-fade-in">
          <div className="bg-ct-surface rounded-ct-lg max-w-md w-full shadow-2xl animate-scale-in">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {removedNotice.reason === 'self_deleted' ? (
                    <>
                      <div className="p-3 bg-ct-surface-2 rounded-full">
                        <UserX className="w-6 h-6 text-ct-mute-2" />
                      </div>
                      <h3 className="text-lg font-semibold text-ct-paper">Account Deleted</h3>
                    </>
                  ) : (
                    <>
                      <div className="p-3 bg-ct-rose/[0.13] rounded-full">
                        <ShieldX className="w-6 h-6 text-ct-rose" />
                      </div>
                      <h3 className="text-lg font-semibold text-ct-paper">Account Removed</h3>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setRemovedNotice(null)}
                  className="p-2.5 text-ct-mute hover:text-ct-mute-2 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {removedNotice.reason === 'self_deleted' ? (
                <div className="space-y-4">
                  <p className="text-ct-mute-2 leading-relaxed">
                    This account has been deleted. All associated data has been permanently removed.
                  </p>

                  <div className="bg-ct-surface-2 border border-ct-line rounded-ct-md p-4">
                    <p className="text-sm font-medium text-ct-paper mb-1">Want to come back?</p>
                    <p className="text-sm text-ct-mute-2">
                      You can create a new account using the same or a different email address to get started again.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-ct-mute-2 leading-relaxed">
                    Your ConnecTradie account has been removed and you can no longer access the platform.
                  </p>

                  <div className="bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md p-4">
                    <p className="text-sm font-medium text-ct-paper mb-1">Reason for removal:</p>
                    <p className="text-sm text-ct-rose">{removedNotice.reason}</p>
                    {removedNotice.message && (
                      <p className="text-sm text-ct-rose mt-2">{removedNotice.message}</p>
                    )}
                  </div>

                  <div className="bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-md p-4">
                    <p className="text-sm font-medium text-ct-paper mb-1">Believe this was a mistake?</p>
                    <p className="text-sm text-ct-amber">
                      You can dispute this decision by emailing{' '}
                      <a
                        href="mailto:admin@connectradie.com?subject=Account Removal Dispute"
                        className="font-semibold underline hover:text-ct-paper"
                      >
                        admin@connectradie.com
                      </a>{' '}
                      with your registered email address and details of your dispute. Our team will review your case within 5 business days.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-3">
              {removedNotice.reason === 'self_deleted' && (
                <Link
                  to="/register"
                  className="flex-1 px-4 py-3 bg-ct-teal text-ct-ink rounded-ct-md font-medium hover:brightness-110 transition-colors text-center"
                >
                  Create New Account
                </Link>
              )}
              <button
                onClick={() => setRemovedNotice(null)}
                className={`${removedNotice.reason === 'self_deleted' ? 'flex-1' : 'w-full'} px-4 py-3 bg-ct-surface-2 text-ct-mute-2 rounded-ct-md font-medium hover:bg-ct-line transition-colors`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-ct-surface py-8 px-4 shadow-sm rounded-ct-lg sm:px-10 border border-ct-line-soft">
          {error && (
            <div className="mb-6 p-4 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-ct-rose flex-shrink-0 mt-0.5" />
              <p className="text-sm text-ct-rose">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" aria-label="ConnecTradie Login">
            <input type="hidden" name="form-name" value="connectradie-login" />
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ct-mute-2 mb-2">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ct-mute" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal focus:border-ct-teal transition-all"
                  placeholder="you@example.com"
                  aria-label="Email address for ConnecTradie"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ct-mute-2 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ct-mute" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal focus:border-ct-teal transition-all"
                  placeholder="Enter your password"
                  aria-label="Password for ConnecTradie"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ct-mute hover:text-ct-mute-2 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(true);
                    setResetEmail(email);
                  }}
                  className="text-sm text-ct-mute-2 font-medium hover:text-ct-mute-2 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ct-teal disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              aria-label="Sign in to ConnecTradie"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Hidden on the native app until native Google auth is configured
              (see showGoogleSignIn / nativeGoogleAuth.ts). Web always shows it. */}
          {showGoogleSignIn() && (
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-ct-line" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-ct-surface text-ct-mute">or</span>
              </div>
            </div>

            <button
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="mt-4 w-full flex items-center justify-center gap-3 px-4 py-3 bg-ct-surface border border-ct-line rounded-ct-md font-medium text-ct-mute-2 hover:bg-ct-surface-2 disabled:opacity-50 transition-all shadow-sm"
            >
              {googleLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              Continue with Google
            </button>
          </div>
          )}

          <p className="mt-6 text-center text-sm text-ct-mute-2">
            New here?{' '}
            <Link to="/register" className="text-ct-mute-2 font-medium hover:text-ct-mute-2">
              Create a free account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
