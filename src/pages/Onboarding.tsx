import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, Home, HardHat, ArrowRight, Loader2, MapPin, Users, Building2, Search, Check, X, ChevronRight, UserCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import SearchableSelect from '../components/SearchableSelect';
import { supabase } from '../lib/supabase';

type Step = 'role' | 'trade-type' | 'employment' | 'business-search' | 'employment-role' | 'details';

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
  const [tradeType, setTradeType] = useState<'construction' | 'hospitality' | ''>('');
  const [postcode, setPostcode] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [tradeCategory, setTradeCategory] = useState('');
  const [employmentType, setEmploymentType] = useState<'own' | 'employed' | null>(null);
  const [businessSearch, setBusinessSearch] = useState('');
  const [businessResults, setBusinessResults] = useState<BusinessResult[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessResult | null>(null);
  const [employmentRole, setEmploymentRole] = useState<EmploymentRole>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user, profile, updateProfile, updateTradieDetails } = useAuth();
  const navigate = useNavigate();

  const constructionCategories = [
    'Plumber', 'Electrician', 'Carpenter', 'Handyman', 'Cleaner',
    'Painter', 'Landscaper', 'Builder', 'HVAC Technician', 'Locksmith',
  ];

  const hospitalityCategories = [
    'Private Chef', 'Event Catering', 'Mobile Bar/Bartender',
  ];

  const tradeCategories = tradeType === 'construction'
    ? constructionCategories
    : tradeType === 'hospitality'
    ? hospitalityCategories
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
      setBusinessResults(data || []);
      setSearchLoading(false);
    }, 300);
  }, [businessSearch]);

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
      const profileUpdates: Record<string, unknown> = {
        role: 'tradie' as const,
        postcode,
        onboarding_completed: true,
        employer_id: selectedBusiness.profile_id,
        employment_type: employmentRole,
        employer_status: 'pending_approval' as const,
      };
      if (tradeCategory) {
        profileUpdates.declared_trades = [tradeCategory];
      }
      const { error: profileError } = await updateProfile(profileUpdates);
      if (profileError) throw new Error('Failed to save profile');

      const { error: tradieError } = await updateTradieDetails({
        business_name: businessName || profile.full_name,
        trade_category: tradeCategory,
        trade_type: tradeType,
      });
      if (tradieError) throw new Error('Failed to save tradie details');

      await supabase.from('business_team_members').upsert({
        business_owner_id: selectedBusiness.profile_id,
        member_profile_id: user.id,
        invite_name: profile.full_name,
        invite_email: profile.email,
        trade_specialty: tradeCategory,
        role: employmentRole,
        status: 'invited',
        joined_at: null,
      }, { onConflict: 'business_owner_id,member_profile_id' }).throwOnError();

      await supabase.from('notifications').insert({
        user_id: selectedBusiness.profile_id,
        title: 'New Team Member Request',
        message: `${profile.full_name} has requested to join your team as ${roleLabel}.`,
        type: 'team',
        channel: 'in_app',
        read: false,
        link: '/team',
        metadata: {
          requester_id: user.id,
          requester_name: profile.full_name,
          employment_type: employmentRole,
        },
      });

      navigate('/dashboard?joined=requested');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!selectedRole) return;
    setLoading(true);
    setError('');

    try {
      const profileUpdates: Record<string, unknown> = { role: selectedRole, postcode, onboarding_completed: true };
      if (selectedRole === 'tradie' && tradeCategory) {
        profileUpdates.declared_trades = [tradeCategory];
      }
      const { error: profileError } = await updateProfile(profileUpdates);
      if (profileError) throw new Error('Failed to save your profile. Please try again.');

      if (selectedRole === 'tradie') {
        const { error: tradieError } = await updateTradieDetails({
          business_name: businessName,
          trade_category: tradeCategory,
          trade_type: tradeType,
        });
        if (tradieError) throw new Error('Failed to save business details. Please try again.');
      }

      navigate('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const steps: Step[] = selectedRole === 'tradie'
    ? employmentType === 'employed'
      ? ['role', 'trade-type', 'employment', 'business-search', 'employment-role']
      : ['role', 'trade-type', 'employment', 'details']
    : ['role', 'details'];

  const currentStepIndex = steps.indexOf(step);
  const progressPct = steps.length > 1 ? Math.round((currentStepIndex / (steps.length - 1)) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
            <Wrench className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-gray-900">
            Connec<span className="text-blue-600">Tradie</span>
          </span>
        </div>

        {step !== 'role' && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>Setting up your account</span>
              <span>{progressPct}% complete</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        <div className="bg-white py-8 px-4 shadow-xl shadow-gray-200/50 rounded-2xl sm:px-10 border border-gray-100">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
              <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          )}

          {step === 'role' && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
                Welcome to Connec<span className="text-blue-600">Tradie</span>!
              </h2>
              <p className="text-gray-600 text-center mb-8">
                How will you be using Connec<span className="text-blue-600">Tradie</span>?
              </p>

              <div className="grid gap-4">
                <button
                  onClick={() => handleRoleSelect('client')}
                  className="group relative p-6 border-2 border-gray-200 rounded-2xl hover:border-primary-500 transition-all text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-primary-100 rounded-xl flex items-center justify-center group-hover:bg-primary-200 transition-colors">
                      <Home className="w-7 h-7 text-primary-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">I'm hiring</h3>
                      <p className="text-gray-600 text-sm mt-1">Find and book trusted tradies for my home or property</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-primary-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </button>

                <button
                  onClick={() => handleRoleSelect('tradie')}
                  className="group relative p-6 border-2 border-gray-200 rounded-2xl hover:border-primary-500 transition-all text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                      <HardHat className="w-7 h-7 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">I'm in the trades</h3>
                      <p className="text-gray-600 text-sm mt-1">Connect with clients, manage jobs, and grow my trade business</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-primary-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              </div>
            </>
          )}

          {step === 'trade-type' && selectedRole === 'tradie' && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">What type of trade?</h2>
              <p className="text-gray-600 text-center mb-8">Select your industry to get started</p>

              <div className="grid gap-4">
                <button
                  onClick={() => handleTradeTypeSelect('construction')}
                  className="group relative p-6 border-2 border-gray-200 rounded-2xl hover:border-primary-500 transition-all text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                      <HardHat className="w-7 h-7 text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">Construction & Trades</h3>
                      <p className="text-gray-600 text-sm mt-1">Plumbing, electrical, carpentry, building, and more</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-primary-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </button>

                <button
                  onClick={() => handleTradeTypeSelect('hospitality')}
                  className="group relative p-6 border-2 border-gray-200 rounded-2xl hover:border-primary-500 transition-all text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-emerald-100 rounded-xl flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                      <Wrench className="w-7 h-7 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">Hospitality & Events</h3>
                      <p className="text-gray-600 text-sm mt-1">Private chefs, catering, mobile bar services</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-primary-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              </div>
            </>
          )}

          {step === 'employment' && selectedRole === 'tradie' && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">How do you work?</h2>
              <p className="text-gray-600 text-center mb-8">
                This helps us set up the right experience for you
              </p>

              <div className="grid gap-4">
                <button
                  onClick={() => handleEmploymentSelect('own')}
                  className="group p-6 border-2 border-gray-200 rounded-2xl hover:border-primary-500 transition-all text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-primary-100 rounded-xl flex items-center justify-center group-hover:bg-primary-200 transition-colors flex-shrink-0">
                      <Building2 className="w-7 h-7 text-primary-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">I run my own business</h3>
                      <p className="text-gray-600 text-sm mt-1">
                        I'm a sole trader or own a company and manage my own jobs
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary-600 group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
                  </div>
                </button>

                <button
                  onClick={() => handleEmploymentSelect('employed')}
                  className="group p-6 border-2 border-gray-200 rounded-2xl hover:border-primary-500 transition-all text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors flex-shrink-0">
                      <Users className="w-7 h-7 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">I work for a business</h3>
                      <p className="text-gray-600 text-sm mt-1">
                        I'm an employee, apprentice, or subcontractor working under another business
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary-600 group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
                  </div>
                </button>
              </div>
            </>
          )}

          {step === 'business-search' && selectedRole === 'tradie' && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Find your employer</h2>
              <p className="text-gray-600 text-center mb-8">
                Search for the business you work for. They'll receive a request to add you to their team.
              </p>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Your trade / specialty</label>
                  <SearchableSelect
                    options={tradeCategories.map(cat => ({ value: cat.toLowerCase(), label: cat }))}
                    value={tradeCategory}
                    onChange={setTradeCategory}
                    placeholder="Search for your trade..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Business name</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={businessSearch}
                      onChange={e => { setBusinessSearch(e.target.value); setSelectedBusiness(null); }}
                      placeholder="Start typing the business name..."
                      className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                    />
                    {searchLoading && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                    )}
                  </div>

                  {businessResults.length > 0 && !selectedBusiness && (
                    <div className="mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {businessResults.map(biz => (
                        <button
                          key={biz.profile_id}
                          type="button"
                          onClick={() => handleBusinessSelect(biz)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary-50 transition-colors text-left border-b border-gray-100 last:border-0"
                        >
                          <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-primary-700">{biz.business_name.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{biz.business_name}</p>
                            <p className="text-xs text-gray-500">{biz.trade_category} · Owner: {biz.full_name}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {businessSearch.length >= 2 && businessResults.length === 0 && !searchLoading && !selectedBusiness && (
                    <p className="mt-2 text-sm text-gray-500 text-center py-3 bg-gray-50 rounded-xl">
                      No businesses found. Ask your employer to sign up first, or proceed independently.
                    </p>
                  )}

                  {selectedBusiness && (
                    <div className="mt-2 flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                      <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 text-sm">{selectedBusiness.business_name}</p>
                        <p className="text-xs text-gray-500">{selectedBusiness.trade_category}</p>
                      </div>
                      <button
                        onClick={() => { setSelectedBusiness(null); setBusinessSearch(''); }}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Your postcode</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={postcode}
                      onChange={e => setPostcode(e.target.value)}
                      placeholder="e.g., 2000"
                      className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (selectedBusiness) {
                      setStep('employment-role');
                    } else {
                      handleComplete();
                    }
                  }}
                  disabled={loading || !tradeCategory || !postcode || (!!businessSearch && !selectedBusiness)}
                  className="w-full py-3 px-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 min-h-[44px]"
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
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">What's your role?</h2>
              <p className="text-gray-600 text-center mb-2">
                How do you work with <strong>{selectedBusiness.business_name}</strong>?
              </p>
              <p className="text-xs text-gray-400 text-center mb-8">
                Your employer will review and approve your request
              </p>

              <div className="grid gap-4">
                <button
                  onClick={() => { setEmploymentRole('employee'); }}
                  className={`group p-6 border-2 rounded-2xl transition-all text-left ${
                    employmentRole === 'employee'
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-primary-500'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                      employmentRole === 'employee'
                        ? 'bg-primary-200'
                        : 'bg-blue-100 group-hover:bg-blue-200'
                    }`}>
                      <UserCheck className="w-7 h-7 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">Employee</h3>
                      <p className="text-gray-600 text-sm mt-1">
                        I'm a direct employee or apprentice of this business
                      </p>
                      <p className="text-xs text-blue-600 mt-2 font-medium">
                        Your employer will approve your request
                      </p>
                    </div>
                    {employmentRole === 'employee' && (
                      <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                </button>

                <button
                  onClick={() => { setEmploymentRole('subcontractor'); }}
                  className={`group p-6 border-2 rounded-2xl transition-all text-left ${
                    employmentRole === 'subcontractor'
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-primary-500'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                      employmentRole === 'subcontractor'
                        ? 'bg-primary-200'
                        : 'bg-amber-100 group-hover:bg-amber-200'
                    }`}>
                      <Wrench className="w-7 h-7 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">Subcontractor</h3>
                      <p className="text-gray-600 text-sm mt-1">
                        I do contract work for this business on a project basis
                      </p>
                      <p className="text-xs text-amber-600 mt-2 font-medium">
                        Your employer will approve your request
                      </p>
                    </div>
                    {employmentRole === 'subcontractor' && (
                      <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                </button>
              </div>

              <button
                onClick={handleJoinRequest}
                disabled={loading || !employmentRole}
                className="w-full mt-6 py-3 px-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 min-h-[44px]"
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
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Almost there!</h2>
              <p className="text-gray-600 text-center mb-8">Tell us where you're located to find tradies near you</p>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Your postcode</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={postcode}
                      onChange={e => setPostcode(e.target.value)}
                      placeholder="e.g., 2000"
                      className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <button
                  onClick={handleComplete}
                  disabled={loading || !postcode}
                  className="w-full py-3 px-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 min-h-[44px]"
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
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Set up your business</h2>
              <p className="text-gray-600 text-center mb-8">Let potential clients know what you do</p>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Business name</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    placeholder="e.g., Smith's Plumbing"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Trade category</label>
                  <SearchableSelect
                    options={tradeCategories.map(cat => ({ value: cat.toLowerCase(), label: cat }))}
                    value={tradeCategory}
                    onChange={setTradeCategory}
                    placeholder="Search for your trade..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Service area postcode</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={postcode}
                      onChange={e => setPostcode(e.target.value)}
                      placeholder="e.g., 2000"
                      className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <button
                  onClick={handleComplete}
                  disabled={loading || !businessName || !tradeCategory || !postcode}
                  className="w-full py-3 px-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 min-h-[44px]"
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

          {step !== 'role' && (
            <button
              onClick={() => {
                if (step === 'details' && selectedRole === 'tradie') setStep('employment');
                else if (step === 'details' && selectedRole === 'client') setStep('role');
                else if (step === 'employment') setStep('trade-type');
                else if (step === 'business-search') setStep('employment');
                else if (step === 'employment-role') setStep('business-search');
                else if (step === 'trade-type') setStep('role');
              }}
              className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
