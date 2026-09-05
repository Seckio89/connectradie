import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, Home, HardHat, ArrowRight, Loader2, Users, Building2, Search, Check, X, ChevronRight, UserCheck, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import SearchableSelect from '../components/SearchableSelect';
import AddressAutocomplete, { type AddressDetails } from '../components/AddressAutocomplete';
import { supabase } from '../lib/supabase';
import { saveBaseCoords } from '../lib/profilePrivate';
import { CONSTRUCTION_CATEGORIES, HOSPITALITY_CATEGORIES } from '../lib/tradeCategories';
import { employmentTypeForRosterRole } from '../lib/compliance';
import { tradeRequiresLicense } from '../lib/tradeCategories';
import AbnVerifyField, { type AbnFieldOutcome } from '../components/verification/AbnVerifyField';
import LicenceVerificationStep from '../components/verification/LicenceVerificationStep';

type Step = 'role' | 'trade-type' | 'employment' | 'business-search' | 'employment-role' | 'details' | 'licence';

/** Onboarding stores the lower-cased label ('air conditioning'); the licence
 *  tables and TRADE_CATEGORIES use the slug ('air-conditioning'). */
const toTradeSlug = (value: string) => value.trim().toLowerCase().replace(/\s*&\s*/g, '-').replace(/\s+/g, '-');

type EmploymentRole = 'employee' | 'subcontractor' | null;

interface BusinessResult {
  profile_id: string;
  business_name: string;
  trade_category: string;
  full_name: string;
}

export default function Onboarding() {
  const [step, setStep] = useState<Step>('role');
  const [selectedRole, setSelectedRole] = useState<'client' | 'tradie' | null>(null);
  const [tradeType, setTradeType] = useState<'construction' | 'hospitality' | undefined>(undefined);
  const [address, setAddress] = useState('');
  const [addressDetails, setAddressDetails] = useState<AddressDetails | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [tradeCategory, setTradeCategory] = useState('');
  const [abnOutcome, setAbnOutcome] = useState<AbnFieldOutcome | null>(null);
  const [employmentType, setEmploymentType] = useState<'own' | 'employed' | null>(null);
  const [businessSearch, setBusinessSearch] = useState('');
  const [businessResults, setBusinessResults] = useState<BusinessResult[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessResult | null>(null);
  const [employmentRole, setEmploymentRole] = useState<EmploymentRole>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user, profile, signOut, updateProfile, updateTradieDetails } = useAuth();
  const navigate = useNavigate();

  const tradeCategories = tradeType === 'construction'
    ? CONSTRUCTION_CATEGORIES
    : tradeType === 'hospitality'
    ? HOSPITALITY_CATEGORIES
    : [];

  useEffect(() => {
    if (businessSearch.length < 2) {
      setBusinessResults([]);
      return;
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      const { data } = await supabase.rpc('search_businesses_by_name', { search_term: businessSearch });
      setBusinessResults(Array.isArray(data) ? data : []);
      setSearchLoading(false);
    }, 300);
  }, [businessSearch]);

  const handleAddressChange = (value: string, _coords?: { lat: number; lng: number }, details?: AddressDetails) => {
    setAddress(value);
    setAddressDetails(details || null);
  };

  // Google sign-in can attach the account to whichever Google session the browser
  // already held, so the role step names the email being used and offers a way
  // out. Without it there is no point in the flow where a wrong account is
  // visible, let alone correctable.
  const handleUseDifferentAccount = async () => {
    await signOut();
    navigate('/login');
  };

  const handleRoleSelect = (role: 'client' | 'tradie') => {
    setSelectedRole(role);
    if (role === 'client') {
      setStep('details');
    } else {
      setStep('trade-type');
    }
  };

  const handleTradeTypeSelect = (type: 'construction' | 'hospitality') => {
    setTradeType(type);
    setTradeCategory('');
    setStep('employment');
  };

  const handleEmploymentSelect = (type: 'own' | 'employed') => {
    setEmploymentType(type);
    if (type === 'own') {
      setStep('details');
    } else {
      setStep('business-search');
    }
  };

  const handleBusinessSelect = (biz: BusinessResult) => {
    setSelectedBusiness(biz);
    setBusinessSearch(biz.business_name);
    setBusinessResults([]);
  };

  const handleJoinRequest = async () => {
    if (!selectedBusiness || !user || !profile || !employmentRole) return;
    setLoading(true);
    setError('');

    const roleLabel = employmentRole === 'employee' ? 'an Employee' : 'a Subcontractor';

    try {
      // Create the join-request row FIRST — if this fails, nothing else has
      // been written and the user can simply retry (previously the profile
      // was updated first, so a failure here stranded a half-joined profile).
      await supabase.from('business_team_members').upsert({
        business_owner_id: selectedBusiness.profile_id,
        member_profile_id: user.id,
        invite_name: profile.full_name,
        invite_email: profile.email,
        trade_specialty: tradeCategory,
        role: employmentRole,
        // Derived, not defaulted: without this the column takes its
        // employee_full_time DEFAULT and someone who just declared themselves a
        // Subcontractor renders as "Employee — full time" on the workforce roster.
        employment_type: employmentTypeForRosterRole(employmentRole),
        status: 'invited',
        joined_at: null,
      }, { onConflict: 'business_owner_id,member_profile_id' }).throwOnError();

      const profileUpdates: Record<string, unknown> = {
        role: 'tradie' as const,
        postcode: addressDetails?.postcode || undefined,
        suburb: addressDetails?.suburb || undefined,
        onboarding_completed: true,
        terms_accepted_at: new Date().toISOString(),
        tos_version: 'v1-2026-07',
        employer_id: selectedBusiness.profile_id,
        employment_type: employmentRole,
        employer_status: 'pending_approval' as const,
      };
      if (tradeCategory) {
        profileUpdates.declared_trades = [tradeCategory];
      }
      const { error: profileError } = await updateProfile(profileUpdates);

      // Base coords for service-area matching. They are a home address, so they
      // live in profile_private rather than on the world-readable profiles row.
      if (!profileError && user) {
        await saveBaseCoords(user.id, addressDetails?.lat ?? null, addressDetails?.lng ?? null);
      }
      if (profileError) throw new Error('Failed to save profile');

      const { error: tradieError } = await updateTradieDetails({
        business_name: businessName || profile.full_name,
        trade_category: tradeCategory,
        trade_type: tradeType,
      });
      if (tradieError) throw new Error('Failed to save tradie details');

      await supabase.rpc('create_notification', {
        p_user_id: selectedBusiness.profile_id,
        p_title: 'New Team Member Request',
        p_message: `${profile.full_name} has requested to join your team as ${roleLabel}.`,
        p_type: 'team',
        p_channel: 'in_app',
        p_read: false,
        p_link: '/team',
        p_metadata: {
          requester_id: user.id,
          requester_name: profile.full_name,
          employment_type: employmentRole,
        },
      }).select().throwOnError();

      resetWelcomeFlags();
      navigate('/dashboard?joined=requested');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Couldn\'t send your join request — try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  // Clear localStorage flags so WelcomeGuide and OnboardingChecklist show fresh
  const resetWelcomeFlags = () => {
    localStorage.removeItem('connectradie_welcome_client');
    localStorage.removeItem('connectradie_welcome_tradie');
    localStorage.removeItem('onboarding_checklist_dismissed');
    localStorage.removeItem('onboarding_checklist_complete');
  };

  const handleComplete = async () => {
    if (!selectedRole) return;
    setLoading(true);
    setError('');

    try {
      const profileUpdates: Record<string, unknown> = { role: selectedRole, postcode: addressDetails?.postcode || undefined, suburb: addressDetails?.suburb || undefined, onboarding_completed: true, terms_accepted_at: new Date().toISOString(), tos_version: 'v1-2026-07' };
      if (selectedRole === 'tradie' && tradeCategory) {
        profileUpdates.declared_trades = [tradeCategory];
      }
      const { error: profileError } = await updateProfile(profileUpdates);
      if (profileError) throw new Error('Failed to save your profile. Please try again.');

      // Base coords for service-area matching — see the note above; these go to
      // profile_private, not profiles.
      if (user) {
        await saveBaseCoords(user.id, addressDetails?.lat ?? null, addressDetails?.lng ?? null);
      }

      if (selectedRole === 'tradie') {
        const { error: tradieError } = await updateTradieDetails({
          business_name: businessName,
          trade_category: tradeCategory,
          trade_type: tradeType,
        });
        if (tradieError) throw new Error('Failed to save business details. Please try again.');
      }

      resetWelcomeFlags();
      // Licensed trades running their OWN business get one more step — the
      // licence photo — now that the profile and business details exist for it
      // to attach to. Same predicate as the `steps` array below, so the progress
      // indicator and the redirect can never disagree. It is skippable;
      // onboarding never blocks on a licence check.
      if (selectedRole === 'tradie' && employmentType === 'own' && tradeRequiresLicense(toTradeSlug(tradeCategory))) {
        setStep('licence');
        return;
      }
      navigate(selectedRole === 'tradie' ? '/dashboard?onboarded=tradie' : '/dashboard?onboarded=client');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Couldn\'t finish setting up your account — try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  const licenceRequired = selectedRole === 'tradie' && employmentType === 'own' && tradeRequiresLicense(toTradeSlug(tradeCategory));
  const steps: Step[] = selectedRole === 'tradie'
    ? employmentType === 'employed'
      ? ['role', 'trade-type', 'employment', 'business-search', 'employment-role']
      : licenceRequired
        ? ['role', 'trade-type', 'employment', 'details', 'licence']
        : ['role', 'trade-type', 'employment', 'details']
    : ['role', 'details'];

  const currentStepIndex = steps.indexOf(step);
  const progressPct = steps.length > 1 ? Math.round((currentStepIndex / (steps.length - 1)) * 100) : 0;

  return (
    <div className="min-h-screen bg-ct-surface flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="flex items-center justify-center mb-8">
          <span className="text-2xl font-extrabold tracking-tight text-ct-paper">
            Connec<span className="text-ct-teal">Tradie</span>
          </span>
        </div>

        {step !== 'role' && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs text-ct-mute mb-2">
              <span>Step {currentStepIndex + 1} of {steps.length}</span>
              <span>{progressPct}% complete</span>
            </div>
            <div className="h-1.5 bg-ct-line rounded-full overflow-hidden">
              <div
                className="h-full bg-ct-teal rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        <div className="bg-ct-surface py-8 px-4 shadow-sm rounded-ct-lg sm:px-10 border border-ct-line-soft">
          {error && (
            <div className="mb-6 p-4 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md flex items-start gap-2">
              <X className="w-4 h-4 text-ct-rose flex-shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-ct-paper">{error}</p>
            </div>
          )}

          {step === 'role' && (
            <>
              <h2 className="text-2xl font-bold text-ct-paper text-center mb-2">
                Welcome to Connec<span className="text-ct-teal">Tradie</span>!
              </h2>
              <p className="text-ct-mute-2 text-center mb-4">
                How will you be using Connec<span className="text-ct-teal">Tradie</span>?
              </p>

              {(profile?.email || user?.email) && (
                <p className="text-sm text-ct-mute-2 text-center mb-8">
                  Signed in as {profile?.email || user?.email}.{' '}
                  <button
                    type="button"
                    onClick={handleUseDifferentAccount}
                    className="text-ct-teal hover:underline font-medium"
                  >
                    Use a different account
                  </button>
                </p>
              )}

              <div className="grid gap-4">
                <button
                  onClick={() => handleRoleSelect('client')}
                  className="group relative p-6 border-2 border-ct-line rounded-ct-lg hover:border-ct-teal transition-all text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-ct-surface-2 rounded-ct-md flex items-center justify-center group-hover:bg-ct-teal/[0.14] transition-colors">
                      <Home className="w-7 h-7 text-ct-mute-2" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-ct-paper">I'm hiring</h3>
                      <p className="text-ct-mute-2 text-sm mt-1">Find and book trusted tradies for my home or property</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-ct-mute group-hover:text-ct-mute-2 group-hover:translate-x-1 transition-all" />
                  </div>
                </button>

                <button
                  onClick={() => handleRoleSelect('tradie')}
                  className="group relative p-6 border-2 border-ct-line rounded-ct-lg hover:border-ct-teal transition-all text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-ct-amber/[0.13] rounded-ct-md flex items-center justify-center group-hover:bg-ct-teal/[0.14] transition-colors">
                      <HardHat className="w-7 h-7 text-ct-amber" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-ct-paper">I'm in the trades</h3>
                      <p className="text-ct-mute-2 text-sm mt-1">Connect with clients, manage jobs, and grow my trade business</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-ct-mute group-hover:text-ct-mute-2 group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              </div>
            </>
          )}

          {step === 'trade-type' && selectedRole === 'tradie' && (
            <>
              <h2 className="text-2xl font-bold text-ct-paper text-center mb-2">What type of trade?</h2>
              <p className="text-ct-mute-2 text-center mb-8">Select your industry to get started</p>

              <div className="grid gap-4">
                <button
                  onClick={() => handleTradeTypeSelect('construction')}
                  className="group relative p-6 border-2 border-ct-line rounded-ct-lg hover:border-ct-teal transition-all text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-ct-surface-2 rounded-ct-md flex items-center justify-center group-hover:bg-ct-teal/[0.14] transition-colors">
                      <HardHat className="w-7 h-7 text-ct-mute-2" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-ct-paper">Construction & Trades</h3>
                      <p className="text-ct-mute-2 text-sm mt-1">Plumbing, electrical, carpentry, building, and more</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-ct-mute group-hover:text-ct-mute-2 group-hover:translate-x-1 transition-all" />
                  </div>
                </button>

                <button
                  onClick={() => handleTradeTypeSelect('hospitality')}
                  className="group relative p-6 border-2 border-ct-line rounded-ct-lg hover:border-ct-teal transition-all text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-ct-surface-2 rounded-ct-md flex items-center justify-center group-hover:bg-ct-surface-2 transition-colors">
                      <Wrench className="w-7 h-7 text-ct-mute-2" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-ct-paper">Hospitality & Events</h3>
                      <p className="text-ct-mute-2 text-sm mt-1">Private chefs, catering, mobile bar services</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-ct-mute group-hover:text-ct-mute-2 group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              </div>

              <div className="mt-6 flex items-start gap-2.5 px-4 py-3 bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-md">
                <Shield className="w-4 h-4 text-ct-amber flex-shrink-0 mt-0.5" />
                <p className="text-xs text-ct-amber leading-relaxed">
                  You'll need your trade licence or certificate ready to complete verification after signup. This unlocks full platform access.
                </p>
              </div>
            </>
          )}

          {step === 'employment' && selectedRole === 'tradie' && (
            <>
              <h2 className="text-2xl font-bold text-ct-paper text-center mb-2">How do you work?</h2>
              <p className="text-ct-mute-2 text-center mb-8">
                This helps us set up the right experience for you
              </p>

              <div className="grid gap-4">
                <button
                  onClick={() => handleEmploymentSelect('own')}
                  className="group p-6 border-2 border-ct-line rounded-ct-lg hover:border-ct-teal transition-all text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-ct-surface-2 rounded-ct-md flex items-center justify-center group-hover:bg-ct-teal/[0.14] transition-colors flex-shrink-0">
                      <Building2 className="w-7 h-7 text-ct-mute-2" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-ct-paper">I run my own business</h3>
                      <p className="text-ct-mute-2 text-sm mt-1">
                        I'm a sole trader or own a company and manage my own jobs
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-ct-mute group-hover:text-ct-mute-2 group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
                  </div>
                </button>

                <button
                  onClick={() => handleEmploymentSelect('employed')}
                  className="group p-6 border-2 border-ct-line rounded-ct-lg hover:border-ct-teal transition-all text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-ct-surface-2 rounded-ct-md flex items-center justify-center group-hover:bg-ct-surface-2 transition-colors flex-shrink-0">
                      <Users className="w-7 h-7 text-ct-mute-2" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-ct-paper">I work for a business</h3>
                      <p className="text-ct-mute-2 text-sm mt-1">
                        I'm an employee, apprentice, or subcontractor working under another business
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-ct-mute group-hover:text-ct-mute-2 group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
                  </div>
                </button>
              </div>
            </>
          )}

          {step === 'business-search' && selectedRole === 'tradie' && (
            <>
              <h2 className="text-2xl font-bold text-ct-paper text-center mb-2">Find your employer</h2>
              <p className="text-ct-mute-2 text-center mb-8">
                Search for the business you work for. They'll receive a request to add you to their team.
              </p>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-ct-mute-2 mb-2">Your trade / specialty</label>
                  <SearchableSelect
                    options={tradeCategories.map(cat => ({ value: cat.toLowerCase(), label: cat }))}
                    value={tradeCategory}
                    onChange={setTradeCategory}
                    placeholder="Search for your trade..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ct-mute-2 mb-2">Business name</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ct-mute" />
                    <input
                      type="text"
                      value={businessSearch}
                      onChange={e => { setBusinessSearch(e.target.value); setSelectedBusiness(null); }}
                      placeholder="Start typing the business name..."
                      className="w-full pl-11 pr-4 py-3 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal focus:border-ct-teal transition-all"
                    />
                    {searchLoading && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ct-mute animate-spin" />
                    )}
                  </div>

                  {businessResults.length > 0 && !selectedBusiness && (
                    <div className="mt-2 bg-ct-surface border border-ct-line rounded-ct-md shadow-lg overflow-hidden">
                      {businessResults.map(biz => (
                        <button
                          key={biz.profile_id}
                          type="button"
                          onClick={() => handleBusinessSelect(biz)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-ct-surface-2 transition-colors text-left border-b border-ct-line-soft last:border-0"
                        >
                          <div className="w-9 h-9 rounded-full bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-ct-mute-2">{biz.business_name.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="font-medium text-ct-paper text-sm">{biz.business_name}</p>
                            <p className="text-xs text-ct-mute">{biz.trade_category} · Owner: {biz.full_name}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {businessSearch.length >= 2 && businessResults.length === 0 && !searchLoading && !selectedBusiness && (
                    <p className="mt-2 text-sm text-ct-mute text-center py-3 bg-ct-surface-2 rounded-ct-md">
                      No businesses found. Ask your employer to sign up first, or proceed independently.
                    </p>
                  )}

                  {selectedBusiness && (
                    <div className="mt-2 flex items-center gap-3 p-3 bg-ct-teal/[0.14] border border-ct-teal/30 rounded-ct-md">
                      <div className="w-9 h-9 rounded-full bg-ct-teal/[0.14] flex items-center justify-center flex-shrink-0">
                        <Check className="w-5 h-5 text-ct-teal" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-ct-paper text-sm">{selectedBusiness.business_name}</p>
                        <p className="text-xs text-ct-mute">{selectedBusiness.trade_category}</p>
                      </div>
                      <button
                        onClick={() => { setSelectedBusiness(null); setBusinessSearch(''); }}
                        className="p-1 text-ct-mute hover:text-ct-mute-2"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-ct-mute-2 mb-2">Your location</label>
                  <AddressAutocomplete
                    value={address}
                    onChange={handleAddressChange}
                    placeholder="Start typing your address..."
                  />
                </div>

                <button
                  onClick={() => {
                    if (selectedBusiness) {
                      setStep('employment-role');
                    } else {
                      handleComplete();
                    }
                  }}
                  disabled={loading || !tradeCategory || !addressDetails?.suburb || (!!businessSearch && !selectedBusiness)}
                  className="w-full py-3 px-4 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 min-h-[44px]"
                >
                  {loading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" />Setting up...</>
                  ) : selectedBusiness ? (
                    <>Continue<ArrowRight className="w-5 h-5" /></>
                  ) : (
                    <>Continue Independently<ArrowRight className="w-5 h-5" /></>
                  )}
                </button>
              </div>
            </>
          )}

          {step === 'employment-role' && selectedBusiness && (
            <>
              <h2 className="text-2xl font-bold text-ct-paper text-center mb-2">What's your role?</h2>
              <p className="text-ct-mute-2 text-center mb-2">
                How do you work with <strong>{selectedBusiness.business_name}</strong>?
              </p>
              <p className="text-xs text-ct-mute text-center mb-8">
                Your employer will review and approve your request
              </p>

              <div className="grid gap-4">
                <button
                  onClick={() => { setEmploymentRole('employee'); }}
                  className={`group p-6 border-2 rounded-ct-lg transition-all text-left ${
                    employmentRole === 'employee'
                      ? 'border-ct-teal bg-ct-amber/[0.13]'
                      : 'border-ct-line hover:border-ct-teal'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-ct-md flex items-center justify-center flex-shrink-0 transition-colors ${
                      employmentRole === 'employee'
                        ? 'bg-ct-teal/[0.14]'
                        : 'bg-ct-surface-2 group-hover:bg-ct-surface-2'
                    }`}>
                      <UserCheck className="w-7 h-7 text-ct-mute-2" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-ct-paper">Employee</h3>
                      <p className="text-ct-mute-2 text-sm mt-1">
                        I'm a direct employee or apprentice of this business
                      </p>
                      <p className="text-xs text-ct-mute-2 mt-2 font-medium">
                        Your employer will approve your request
                      </p>
                    </div>
                    {employmentRole === 'employee' && (
                      <div className="w-6 h-6 rounded-full bg-ct-teal flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4 text-ct-ink" />
                      </div>
                    )}
                  </div>
                </button>

                <button
                  onClick={() => { setEmploymentRole('subcontractor'); }}
                  className={`group p-6 border-2 rounded-ct-lg transition-all text-left ${
                    employmentRole === 'subcontractor'
                      ? 'border-ct-teal bg-ct-amber/[0.13]'
                      : 'border-ct-line hover:border-ct-teal'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-ct-md flex items-center justify-center flex-shrink-0 transition-colors ${
                      employmentRole === 'subcontractor'
                        ? 'bg-ct-teal/[0.14]'
                        : 'bg-ct-amber/[0.13] group-hover:bg-ct-teal/[0.14]'
                    }`}>
                      <Wrench className="w-7 h-7 text-ct-amber" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-ct-paper">Subcontractor</h3>
                      <p className="text-ct-mute-2 text-sm mt-1">
                        I do contract work for this business on a project basis
                      </p>
                      <p className="text-xs text-ct-amber mt-2 font-medium">
                        Your employer will approve your request
                      </p>
                    </div>
                    {employmentRole === 'subcontractor' && (
                      <div className="w-6 h-6 rounded-full bg-ct-teal flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4 text-ct-ink" />
                      </div>
                    )}
                  </div>
                </button>
              </div>

              <button
                onClick={handleJoinRequest}
                disabled={loading || !employmentRole}
                className="w-full mt-6 py-3 px-4 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 min-h-[44px]"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />Setting up...</>
                ) : (
                  <><ArrowRight className="w-5 h-5" />Send Request</>
                )}
              </button>
            </>
          )}

          {step === 'details' && selectedRole === 'client' && (
            <>
              <h2 className="text-2xl font-bold text-ct-paper text-center mb-2">Almost there!</h2>
              <p className="text-ct-mute-2 text-center mb-8">Tell us where you're located to find tradies near you</p>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-ct-mute-2 mb-2">Your location</label>
                  <AddressAutocomplete
                    value={address}
                    onChange={handleAddressChange}
                    placeholder="Start typing your address..."
                  />
                </div>

                <button
                  onClick={handleComplete}
                  disabled={loading || !addressDetails?.suburb}
                  className="w-full py-3 px-4 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 min-h-[44px]"
                >
                  {loading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" />Setting up...</>
                  ) : (
                    <>Get Started<ArrowRight className="w-5 h-5" /></>
                  )}
                </button>
              </div>
            </>
          )}

          {step === 'details' && selectedRole === 'tradie' && (
            <>
              <h2 className="text-2xl font-bold text-ct-paper text-center mb-2">Set up your business</h2>
              <p className="text-ct-mute-2 text-center mb-8">Let potential clients know what you do</p>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-ct-mute-2 mb-2">Business name</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    placeholder="e.g., Smith's Plumbing"
                    className="w-full px-4 py-3 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal focus:border-ct-teal transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ct-mute-2 mb-2">Trade category</label>
                  <SearchableSelect
                    options={tradeCategories.map(cat => ({ value: cat.toLowerCase(), label: cat }))}
                    value={tradeCategory}
                    onChange={setTradeCategory}
                    placeholder="Search for your trade..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ct-mute-2 mb-2">ABN <span className="text-ct-mute font-normal">(optional now, required before you quote)</span></label>
                  <AbnVerifyField
                    claimedBusinessName={businessName}
                    onVerified={setAbnOutcome}
                    size="lg"
                  />
                  {!abnOutcome && (
                    <p className="text-xs text-ct-mute mt-2">Checked live against the Australian Business Register. You can do this later from Settings → Get verified.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-ct-mute-2 mb-2">Service area</label>
                  <AddressAutocomplete
                    value={address}
                    onChange={handleAddressChange}
                    placeholder="Start typing your address..."
                  />
                </div>

                <button
                  onClick={handleComplete}
                  disabled={loading || !businessName || !tradeCategory || !addressDetails?.suburb}
                  className="w-full py-3 px-4 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 min-h-[44px]"
                >
                  {loading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" />Setting up...</>
                  ) : (
                    <>Create Business Profile<ArrowRight className="w-5 h-5" /></>
                  )}
                </button>
              </div>
            </>
          )}

          {step === 'licence' && selectedRole === 'tradie' && (
            <>
              <h2 className="text-2xl font-bold text-ct-paper text-center mb-2">Your trade licence</h2>
              <p className="text-ct-mute-2 text-center mb-8">
                {tradeCategory ? tradeCategory.charAt(0).toUpperCase() + tradeCategory.slice(1) : 'This trade'} needs a state licence. Clients see a "Licence verified" badge once an admin has checked it.
              </p>
              <LicenceVerificationStep
                tradeCategory={toTradeSlug(tradeCategory)}
                defaultState={addressDetails?.state ?? null}
                allowSkip
                onFinished={() => navigate('/dashboard?onboarded=tradie')}
              />
            </>
          )}

          {step !== 'role' && step !== 'licence' && (
            <button
              onClick={() => {
                if (step === 'details' && selectedRole === 'tradie') setStep('employment');
                else if (step === 'details' && selectedRole === 'client') setStep('role');
                else if (step === 'employment') setStep('trade-type');
                else if (step === 'business-search') setStep('employment');
                else if (step === 'employment-role') setStep('business-search');
                else if (step === 'trade-type') setStep('role');
              }}
              className="mt-4 w-full text-center text-sm text-ct-mute hover:text-ct-paper transition-colors"
            >
              Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
