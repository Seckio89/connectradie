import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Phone, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff, Shield, Star, Zap, Check } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { signInWithGoogleNative, isGoogleCancel, showGoogleSignIn, describeAuthError } from '../lib/nativeGoogleAuth';
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

const clientBenefits = [
  { icon: Shield, text: 'ABN-verified & license-checked tradies' },
  { icon: Star, text: 'Real reviews from completed jobs' },
  { icon: Zap, text: 'Post a job, get quotes in minutes' },
];

const tradieBenefits = [
  { icon: Zap, text: 'Receive leads directly — no bidding wars' },
  { icon: Shield, text: 'Your Pro badge builds instant trust' },
  { icon: Star, text: 'Grow your reputation with verified reviews' },
];

export default function Register() {
  const [searchParams] = useSearchParams();
  const isTradie = searchParams.get('type') === 'tradie';
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showNameExpanded, setShowNameExpanded] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();

  // Google sign-up redirects the top-level window to Google, so the spinner is
  // kept up on the way out. If the user cancels / hits Back, the browser can
  // restore this page from the back-forward cache with `googleLoading` still
  // true, leaving the button stuck spinning. Reset loading state on bfcache
  // restore (pageshow.persisted).
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setGoogleLoading(false);
        setLoading(false);
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    setError('');

    // Native app: Google blocks OAuth in embedded WebViews, so use the plugin's
    // native picker + signInWithIdToken instead of the web redirect.
    if (Capacitor.isNativePlatform()) {
      try {
        await signInWithGoogleNative();
        navigate('/onboarding');
      } catch (err) {
        if (!isGoogleCancel(err)) {
          // TEMP: surface the exact error (with code) to finish native setup.
          setError(`Google error: ${describeAuthError(err)}`);
        }
        setGoogleLoading(false);
      }
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/onboarding` },
    });
    if (error) {
      setError(friendlyError(error, 'Unable to sign up with Google. Please try again.'));
      setGoogleLoading(false);
    }
  };

  const benefits = isTradie ? tradieBenefits : clientBenefits;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const trimmedPhone = phone.replace(/\s+/g, '');
    if (!/^(\+?61|0)[2-9]\d{8}$/.test(trimmedPhone)) {
      setError('Please enter a valid Australian mobile or phone number');
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must include at least one uppercase letter and one number');
      setLoading(false);
      return;
    }

    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
    const { error } = await signUp(email, password, fullName, trimmedPhone);

    if (error) {
      setError(friendlyError(error, 'Unable to create your account. Please try again.'));
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50/30 flex items-center justify-center py-10 px-4 sm:px-6 lg:px-8">
      <SEO title="Create Account" description="Create a free ConnecTradie account." noindex />
      <BetaModal />

      <div className="w-full max-w-[480px]">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center justify-center mb-6">
            <span className="text-2xl font-extrabold tracking-tight text-black">
              Connec<span className="text-warm-500">Tradie</span>
            </span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            {isTradie ? 'Join as a Verified Tradie' : 'Create your account'}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {isTradie
              ? 'Get verified and start receiving job leads.'
              : 'Find trusted, licensed tradies in your area.'}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 sm:p-8">
            {error && (
              <div className="mb-5 p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {success ? (
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Check your email</h2>
                <p className="text-gray-600 mb-2">
                  We've sent a confirmation link to:
                </p>
                <p className="font-semibold text-gray-900 mb-4">{email}</p>
                <p className="text-sm text-gray-500 mb-6">
                  Click the link in your email to activate your account. You'll be signed in automatically.
                </p>
                <div className="space-y-3">
                  <Link
                    to="/login"
                    className="block w-full py-3 px-4 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors text-center"
                  >
                    Go to Sign In
                  </Link>
                  <p className="text-xs text-gray-400">
                    Didn't get the email? Check your spam folder or{' '}
                    <button
                      type="button"
                      onClick={() => { setSuccess(false); setError(''); }}
                      className="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      try again
                    </button>
                  </p>
                </div>
              </div>
            ) : (
            <>
            <form onSubmit={handleSubmit} className="space-y-4" aria-label="ConnecTradie Registration">
              <input type="hidden" name="form-name" value="connectradie-register" />

              {/* Name fields */}
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Name
                </label>
                <div className="rounded-xl border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent transition-all">
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                    <input
                      id="firstName"
                      name="firstName"
                      type="text"
                      autoComplete="given-name"
                      required
                      value={firstName}
                      onFocus={() => setShowNameExpanded(true)}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-sm border-0 focus:outline-none focus:ring-0 bg-white placeholder:text-gray-400"
                      placeholder="First name"
                    />
                  </div>
                  {showNameExpanded && (
                    <>
                      <div className="border-t border-gray-100">
                        <input
                          id="middleName"
                          name="middleName"
                          type="text"
                          autoComplete="additional-name"
                          value={middleName}
                          onChange={(e) => setMiddleName(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 text-sm border-0 focus:outline-none focus:ring-0 bg-white placeholder:text-gray-400"
                          placeholder="Middle name (optional)"
                        />
                      </div>
                      <div className="border-t border-gray-100">
                        <input
                          id="lastName"
                          name="lastName"
                          type="text"
                          autoComplete="family-name"
                          required
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 text-sm border-0 focus:outline-none focus:ring-0 bg-white placeholder:text-gray-400"
                          placeholder="Last name"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Mobile phone
                </label>
                <div className="relative rounded-xl border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent transition-all">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border-0 focus:outline-none focus:ring-0 bg-white placeholder:text-gray-400"
                    placeholder="04XX XXX XXX"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email address
                </label>
                <div className="relative rounded-xl border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent transition-all">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border-0 focus:outline-none focus:ring-0 bg-white placeholder:text-gray-400"
                    placeholder="you@example.com"
                    aria-label="Email address for ConnecTradie account"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Password
                </label>
                <div className="relative rounded-xl border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent transition-all">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-11 py-2.5 text-sm border-0 focus:outline-none focus:ring-0 bg-white placeholder:text-gray-400"
                    placeholder="Min. 8 characters (A-Z, 0-9)"
                    aria-label="Create password for ConnecTradie account"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    <span className={`text-xs flex items-center gap-1 ${password.length >= 8 ? 'text-green-600' : 'text-gray-400'}`}>
                      {password.length >= 8 ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-gray-300 inline-block" />}
                      8+ characters
                    </span>
                    <span className={`text-xs flex items-center gap-1 ${/[A-Z]/.test(password) ? 'text-green-600' : 'text-gray-400'}`}>
                      {/[A-Z]/.test(password) ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-gray-300 inline-block" />}
                      Uppercase letter
                    </span>
                    <span className={`text-xs flex items-center gap-1 ${/[0-9]/.test(password) ? 'text-green-600' : 'text-gray-400'}`}>
                      {/[0-9]/.test(password) ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-gray-300 inline-block" />}
                      Number
                    </span>
                  </div>
                )}
              </div>

              {/* Terms checkbox */}
              <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
                <div className={`mt-px w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${agreedToTerms ? 'bg-warm-500 border-warm-500' : 'border-gray-300 bg-white'}`}>
                  {agreedToTerms && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </div>
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="sr-only"
                />
                <span className="text-xs text-gray-500 leading-relaxed">
                  I agree to the{' '}
                  <Link to="/terms" className="text-primary-600 hover:text-primary-700 font-medium">Terms of Service</Link>
                  {' '}and{' '}
                  <Link to="/privacy" className="text-primary-600 hover:text-primary-700 font-medium">Privacy Policy</Link>
                </span>
              </label>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || success || !agreedToTerms}
                className="w-full py-3 px-4 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-warm-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-sm shadow-warm-500/20"
                aria-label="Create ConnecTradie account"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating account...
                  </>
                ) : isTradie ? (
                  'Create Tradie Account'
                ) : (
                  'Create Free Account'
                )}
              </button>
            </form>

            {/* Hidden on the native app until native Google auth is configured
                (see showGoogleSignIn / nativeGoogleAuth.ts). Web always shows it. */}
            {showGoogleSignIn() && (
            <div className="mt-5">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-white text-gray-400">or</span>
                </div>
              </div>

              <button
                onClick={handleGoogleSignUp}
                disabled={googleLoading}
                className="mt-4 w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-all shadow-sm"
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
            </>
            )}
          </div>

          {/* Footer */}
          {!success && (
          <div className="px-6 sm:px-8 py-4 bg-gray-50 border-t border-gray-100">
            <p className="text-center text-sm text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 font-semibold hover:text-primary-700 transition-colors">
                Sign in
              </Link>
            </p>
          </div>
          )}
        </div>

        {/* Benefits below card */}
        <div className="mt-8 grid grid-cols-3 gap-3">
          {benefits.map((b) => {
            const Icon = b.icon;
            return (
              <div key={b.text} className="flex flex-col items-center text-center gap-2 px-2">
                <div className="w-9 h-9 rounded-full bg-warm-50 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-warm-600" />
                </div>
                <span className="text-xs text-gray-500 leading-snug">{b.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
