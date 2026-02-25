import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { User, Phone, Mail, Loader2, CheckCircle2, Lock, Key, Shield, Award, Briefcase, Plus, X, Zap, FileText, Hash, Camera, Crown, BadgeCheck, Wrench, Bell, BellRing, MessageSquare, Smartphone, Settings2, FlaskConical, ToggleLeft, ToggleRight, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
import AddressAutocomplete from '../components/AddressAutocomplete';
import SubscriptionModal from '../components/SubscriptionModal';
import VerificationCenter from '../components/VerificationCenter';
import TradieProfessionalSettings from '../components/TradieProfessionalSettings';
import Toast from '../components/Toast';
import { calculateProfileCompletion, getProfileCompletionTasks } from '../lib/utils';
import { requestPushPermission, subscribeToPush, savePushPreferences, saveSmsPreference, getPushPermissionStatus } from '../lib/notifications';
import { isPro } from '../lib/subscription';

type TabType = 'profile' | 'professional' | 'security' | 'verification' | 'notifications' | 'admin';

export default function Settings() {
  const { user, profile, tradieDetails, refreshProfile } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const state = location.state as { tab?: string } | null;
    if (state?.tab === 'verification') return 'verification';
    if (state?.tab === 'admin') return 'admin';
    return 'profile';
  });
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [postcode, setPostcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const [insuranceProvider, setInsuranceProvider] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [contractorType, setContractorType] = useState<'Solo' | 'Company' | 'Labour Hire'>('Solo');
  const [newQualification, setNewQualification] = useState('');
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [verificationError, setVerificationError] = useState('');

  const [showCompleteBanner, setShowCompleteBanner] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [flashBoostLoading, setFlashBoostLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [showToast, setShowToast] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [pushEnabled, setPushEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<string>('default');
  const [notifSaving, setNotifSaving] = useState(false);

  const [trainingModeEnabled, setTrainingModeEnabled] = useState(false);
  const [trainingModeLoading, setTrainingModeLoading] = useState(false);
  const [subscribedUsersCount, setSubscribedUsersCount] = useState(0);

  const isTradie = profile?.role === 'tradie';
  const isAdmin = profile?.role === 'admin';
  const showTradieFeatures = isTradie || isAdmin;
  const isSubscriptionAdmin = profile?.role === 'admin';
  const isProUser = isPro(tradieDetails?.subscription_tier, profile?.is_premium);
  const profileCompletion = calculateProfileCompletion(profile);
  const incompleteTasks = getProfileCompletionTasks(profile);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
      setAddress(profile.address || '');
      setPostcode(profile.postcode || '');
      setPushEnabled(profile.push_enabled || false);
      setSmsEnabled(profile.sms_alerts_enabled || false);
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`profile-settings-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        () => {
          refreshProfile();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    setPushPermission(getPushPermissionStatus());

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setPushPermission(getPushPermissionStatus());
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const handleTogglePush = async (enabled: boolean) => {
    if (!user) return;
    setNotifSaving(true);

    if (enabled && pushPermission !== 'granted') {
      const permission = await requestPushPermission();
      setPushPermission(permission);
      if (permission !== 'granted') {
        setToastMessage('Browser notification permission was denied.');
        setToastType('error');
        setShowToast(true);
        setNotifSaving(false);
        return;
      }
    }

    const subscription = enabled ? await subscribeToPush() : null;
    const saved = await savePushPreferences(user.id, enabled, subscription);

    if (saved) {
      setPushEnabled(enabled);
      setToastMessage(enabled ? 'Push alerts enabled.' : 'Push alerts disabled.');
      setToastType('success');
    } else {
      setToastMessage('Failed to save preference.');
      setToastType('error');
    }
    setShowToast(true);
    setNotifSaving(false);
  };

  const handleToggleSms = async (enabled: boolean) => {
    if (!user) return;
    if (enabled && !isProUser) {
      setShowSubscriptionModal(true);
      return;
    }
    setNotifSaving(true);

    const saved = await saveSmsPreference(user.id, enabled);
    if (saved) {
      setSmsEnabled(enabled);
      setToastMessage(enabled ? 'SMS alerts enabled.' : 'SMS alerts disabled.');
      setToastType('success');
    } else {
      setToastMessage('Failed to save preference.');
      setToastType('error');
    }
    setShowToast(true);
    setNotifSaving(false);
  };

  useEffect(() => {
    if (!user || profileCompletion < 100) {
      setShowCompleteBanner(false);
      return;
    }
    const key = `profile_complete_seen_${user.id}`;
    const alreadySeen = localStorage.getItem(key);
    if (!alreadySeen) {
      setShowCompleteBanner(true);
      localStorage.setItem(key, 'true');
    }
  }, [user, profileCompletion]);

  useEffect(() => {
    if (tradieDetails) {
      setInsuranceProvider(tradieDetails.insurance_provider || '');
      setPolicyNumber(tradieDetails.policy_number || '');
      setQualifications(tradieDetails.qualifications || []);
      setContractorType(tradieDetails.contractor_type || 'Solo');
    }
  }, [tradieDetails]);

  useEffect(() => {
    const state = location.state as { tab?: string } | null;
    if (state?.tab === 'admin') setActiveTab('admin');
  }, [location.state]);

  useEffect(() => {
    if (isSubscriptionAdmin) {
      loadTrainingMode();
      loadSubscribedUsers();
    }
  }, [isSubscriptionAdmin]);

  const loadTrainingMode = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'training_mode_enabled')
      .maybeSingle();

    setTrainingModeEnabled(data?.value === true);
  };

  const loadSubscribedUsers = async () => {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_premium', true);

    setSubscribedUsersCount(count || 0);
  };

  const handleToggleTrainingMode = async () => {
    setTrainingModeLoading(true);
    const newValue = !trainingModeEnabled;

    const { error } = await supabase
      .from('app_settings')
      .update({ value: newValue, updated_by: user?.id, updated_at: new Date().toISOString() })
      .eq('key', 'training_mode_enabled');

    if (!error) {
      setTrainingModeEnabled(newValue);
      setToastMessage(newValue ? 'Training mode enabled. All users can now subscribe in test mode.' : 'Training mode disabled.');
      setToastType('success');
      setShowToast(true);
    } else {
      setToastMessage('Failed to update training mode.');
      setToastType('error');
      setShowToast(true);
    }

    setTrainingModeLoading(false);
  };

  const handleResetAllSubscriptions = async () => {
    setTrainingModeLoading(true);

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ is_premium: false })
      .eq('is_premium', true);

    if (profileError) {
      setToastMessage('Failed to reset subscriptions.');
      setToastType('error');
      setShowToast(true);
      setTrainingModeLoading(false);
      return;
    }

    const { error: tradieError } = await supabase
      .from('tradie_details')
      .update({ subscription_tier: 'free' })
      .eq('subscription_tier', 'pro');

    if (tradieError) {
      setToastMessage('Profiles reset but tradie details failed.');
      setToastType('error');
      setShowToast(true);
      setTrainingModeLoading(false);
      return;
    }

    await refreshProfile();
    await loadSubscribedUsers();
    setToastMessage('All test subscriptions have been reset to free.');
    setToastType('success');
    setShowToast(true);
    setTrainingModeLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');
    setSuccess(false);

    if (phone && !/^(\+?61|0)[2-9]\d{8}$/.test(phone.replace(/[\s-]/g, ''))) {
      setError('Please enter a valid Australian phone number (e.g., 0412 345 678)');
      setLoading(false);
      return;
    }

    if (postcode && !/^\d{4}$/.test(postcode.trim())) {
      setError('Please enter a valid 4-digit Australian postcode');
      setLoading(false);
      return;
    }

    const updates: Record<string, string> = {
      full_name: fullName,
      phone,
      address,
      postcode,
    };

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (updateError) {
      setError('Failed to update profile. Please try again.');
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }

    setLoading(false);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordLoading(true);
    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long');
      setPasswordLoading(false);
      return;
    }

    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setPasswordError('Password must include uppercase, lowercase, and a number');
      setPasswordLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      setPasswordLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setPasswordError(error.message || 'Failed to update password');
    } else {
      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    }

    setPasswordLoading(false);
  };

  const handleAddQualification = () => {
    if (newQualification.trim() && !qualifications.includes(newQualification.trim())) {
      setQualifications([...qualifications, newQualification.trim()]);
      setNewQualification('');
    }
  };

  const handleRemoveQualification = (qual: string) => {
    setQualifications(qualifications.filter((q) => q !== qual));
  };

  const handleVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setVerificationLoading(true);
    setVerificationError('');
    setVerificationSuccess(false);

    const { error: updateError } = await supabase
      .from('tradie_details')
      .update({
        insurance_provider: insuranceProvider,
        policy_number: policyNumber,
        qualifications,
        contractor_type: contractorType,
      })
      .eq('profile_id', user.id);

    if (updateError) {
      setVerificationError('Failed to update verification details. Please try again.');
    } else {
      setVerificationSuccess(true);
      setTimeout(() => setVerificationSuccess(false), 3000);
    }

    setVerificationLoading(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB');
      return;
    }

    setAvatarUploading(true);
    setError('');
    try {
      const ext = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const avatarUrl = `${publicUrl}?t=${Date.now()}`;

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id);

      if (updateErr) throw updateErr;

      await refreshProfile();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to upload photo';
      setError(message);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleRunFlashBoost = async () => {
    setFlashBoostLoading(true);
    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      const { data: staleJobs, error: fetchError } = await supabase
        .from('jobs')
        .select('id')
        .eq('status', 'pending')
        .eq('is_flash_boost', false)
        .lte('created_at', twoHoursAgo);

      if (fetchError) throw fetchError;

      if (!staleJobs || staleJobs.length === 0) {
        setToastMessage('No stale jobs found to boost.');
        setToastType('success');
        setShowToast(true);
        setFlashBoostLoading(false);
        return;
      }

      const flashExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const jobIds = staleJobs.map((j) => j.id);

      const { error: updateError } = await supabase
        .from('jobs')
        .update({ is_flash_boost: true, flash_expiry: flashExpiry })
        .in('id', jobIds);

      if (updateError) throw updateError;

      setToastMessage(`Boosted ${staleJobs.length} stale job${staleJobs.length === 1 ? '' : 's'}!`);
      setToastType('success');
      setShowToast(true);
    } catch (err) {
      setToastMessage('Failed to run flash boost algorithm.');
      setToastType('error');
      setShowToast(true);
    } finally {
      setFlashBoostLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">Manage your account settings and profile</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex flex-col sm:flex-row items-center gap-6 p-6 md:p-8 pb-6 border-b border-gray-200">
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => profile?.avatar_url && setShowAvatarModal(true)}
                disabled={!profile?.avatar_url}
                className="relative w-28 h-28 rounded-xl flex-shrink-0 ring-4 ring-gray-100 hover:ring-primary-200 transition-all"
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name || 'Avatar'}
                    className="w-28 h-28 rounded-xl object-cover cursor-pointer"
                  />
                ) : (
                  <div className="w-28 h-28 bg-primary-100 rounded-xl flex items-center justify-center">
                    <span className="text-4xl font-bold text-primary-600">
                      {profile?.full_name?.charAt(0) || 'U'}
                    </span>
                  </div>
                )}
                {avatarUploading && (
                  <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </div>
                )}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="text-sm font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50 transition-colors"
              >
                {profile?.avatar_url ? 'Change photo' : 'Upload photo'}
              </button>
            </div>
            <div className="flex-1 text-center sm:text-left">
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <h2 className="text-xl font-semibold text-gray-900">{profile?.full_name}</h2>
                {(tradieDetails?.subscription_tier === 'pro' || profile?.is_premium) && (
                  <BadgeCheck className="w-5 h-5 text-blue-500" />
                )}
              </div>
              <p className="text-gray-500 capitalize">{profile?.role}</p>
              {(isTradie || (isAdmin && trainingModeEnabled)) && (
                <div className="mt-3">
                  {(tradieDetails?.subscription_tier === 'pro' || profile?.is_premium) ? (
                    <button
                      onClick={() => setShowSubscriptionModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 text-sm font-medium rounded-full border border-green-200 hover:bg-green-100 transition-colors"
                    >
                      <Crown className="w-3.5 h-3.5" />
                      Pro Member — Manage
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowSubscriptionModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 text-sm font-medium rounded-full border border-amber-200 hover:bg-amber-100 transition-colors"
                    >
                      <Crown className="w-3.5 h-3.5" />
                      Upgrade to Pro
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {profileCompletion < 100 && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 p-6 md:p-8">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-600" />
                  <h3 className="font-semibold text-amber-900">Complete Your Profile</h3>
                </div>
                <span className="text-sm font-bold text-amber-700">{profileCompletion}%</span>
              </div>
              <div className="w-full bg-amber-200 rounded-full h-2 mb-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-orange-500 h-full transition-all duration-500"
                  style={{ width: `${profileCompletion}%` }}
                />
              </div>
              {incompleteTasks.length > 0 && (
                <div className="text-sm text-amber-800">
                  <p className="font-medium mb-2">Missing:</p>
                  <ul className="space-y-1">
                    {incompleteTasks.slice(0, 3).map((task, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <span className="text-amber-600">•</span> {task}
                      </li>
                    ))}
                    {incompleteTasks.length > 3 && (
                      <li className="text-amber-700 italic">+ {incompleteTasks.length - 3} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {profileCompletion === 100 && showCompleteBanner && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-200 p-6 md:p-8 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-green-900">Profile Complete!</h3>
                <p className="text-sm text-green-800">Your profile is ready to go. Great job!</p>
              </div>
            </div>
          )}

          <div className="border-b border-gray-200">
            <div className="flex gap-1 p-2 px-6 md:px-8 overflow-x-auto scrollbar-hide">
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors min-h-[44px] ${
                  activeTab === 'profile'
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <User className="w-4 h-4" />
                Profile
              </button>
              {showTradieFeatures && (
                <button
                  type="button"
                  onClick={() => setActiveTab('professional')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors min-h-[44px] ${
                    activeTab === 'professional'
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Settings2 className="w-4 h-4" />
                  Professional
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('security')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors min-h-[44px] ${
                  activeTab === 'security'
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Lock className="w-4 h-4" />
                Security
              </button>
              {showTradieFeatures && (
                <button
                  type="button"
                  onClick={() => setActiveTab('verification')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors min-h-[44px] ${
                    activeTab === 'verification'
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  Get Verified
                </button>
              )}
              {showTradieFeatures && (
                <button
                  type="button"
                  onClick={() => setActiveTab('notifications')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors min-h-[44px] ${
                    activeTab === 'notifications'
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Bell className="w-4 h-4" />
                  Alerts
                </button>
              )}
              {isSubscriptionAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveTab('admin')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors min-h-[44px] ${
                    activeTab === 'admin'
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Wrench className="w-4 h-4" />
                  Admin Tools
                </button>
              )}
            </div>
          </div>

          {activeTab === 'profile' && (
            <form onSubmit={handleSubmit} className="space-y-6 p-6 md:p-8" aria-label="ConnecTradie Profile Settings">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={profile?.email || ''}
                  disabled
                  className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="full-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="phone"
                  name="tel"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter your phone number"
                  className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Address
              </label>
              <AddressAutocomplete
                value={address}
                onChange={(value) => setAddress(value)}
                placeholder="Start typing your address..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Postcode
              </label>
              <input
                id="postcode"
                name="postcode"
                type="text"
                autoComplete="postal-code"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="Enter your postcode"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>


            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {success && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <CheckCircle2 className="w-5 h-5 text-green-600 animate-bounce" />
                <p className="text-sm text-green-600 font-medium">Perfect! Your profile is up to date.</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-h-[44px]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </form>
          )}

          {activeTab === 'professional' && showTradieFeatures && (
            <TradieProfessionalSettings />
          )}

          {activeTab === 'security' && (
            <form onSubmit={handlePasswordChange} className="space-y-6 p-6 md:p-8" aria-label="Change ConnecTradie Password">
              <input type="hidden" name="form-name" value="connectradie-change-password" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h3>
                <p className="text-sm text-gray-600 mb-6">
                  Enter a new password for your account. Must be at least 8 characters with uppercase, lowercase, and a number.
                </p>
              </div>

              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="new-password"
                    name="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                    aria-label="New password for ConnecTradie account"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="confirm-password"
                    name="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                    aria-label="Confirm new password for ConnecTradie account"
                  />
                </div>
              </div>

              {passwordError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-600">{passwordError}</p>
                </div>
              )}

              {passwordSuccess && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <CheckCircle2 className="w-5 h-5 text-green-600 animate-bounce" />
                  <p className="text-sm text-green-600 font-medium">Your account is now more secure!</p>
                </div>
              )}

              <button
                type="submit"
                disabled={passwordLoading || !newPassword || !confirmPassword}
                className="w-full py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-h-[44px]"
              >
                {passwordLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Updating Password...
                  </>
                ) : (
                  <>
                    <Lock className="w-5 h-5" />
                    Update Password
                  </>
                )}
              </button>
            </form>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6 p-6 md:p-8">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Notification Preferences</h3>
                <p className="text-sm text-gray-600 mb-6">
                  Control how you receive alerts about new leads and urgent jobs.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <BellRing className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Web Push Alerts</p>
                      <p className="text-sm text-gray-600">Receive browser notifications for urgent leads</p>
                      <span className="inline-block mt-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">Free</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTogglePush(!pushEnabled)}
                    disabled={notifSaving || pushPermission === 'denied' || pushPermission === 'unsupported'}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                      pushEnabled ? 'bg-primary-600' : 'bg-gray-300'
                    } ${(notifSaving || pushPermission === 'denied' || pushPermission === 'unsupported') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                        pushEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {pushPermission === 'denied' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <Bell className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700">
                      Notifications are blocked. To enable them, click the lock icon in your browser's address bar and allow notifications for this site.
                    </p>
                  </div>
                )}

                {pushPermission === 'unsupported' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <Bell className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <p className="text-sm text-amber-700">
                      Push notifications are not supported in your current browser. Try using Chrome, Firefox, or Safari for the best experience.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 opacity-60">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                      <Smartphone className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">SMS Alerts for Urgent Jobs</p>
                      <p className="text-sm text-gray-600">Get a text when urgent leads are posted nearby</p>
                      <span className="inline-flex items-center gap-1 mt-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                        Coming Soon
                      </span>
                    </div>
                  </div>
                  <div className="relative inline-flex h-7 w-12 items-center rounded-full bg-gray-200 cursor-not-allowed">
                    <span className="inline-block h-5 w-5 transform rounded-full bg-white shadow-sm translate-x-1" />
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-6">
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">How it works</p>
                    <p className="text-sm text-blue-800 mt-1">
                      When a client posts an urgent job marked with Flash Boost, all tradies with
                      matching notification preferences in that area are alerted instantly. Web push
                      is free for all users. SMS alerts require a Pro subscription.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'admin' && isSubscriptionAdmin && (
            <div className="space-y-6 p-6 md:p-8">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Admin Tools</h3>
                <p className="text-sm text-gray-600 mb-6">
                  Administrative tools for testing and managing platform features.
                </p>
              </div>

              <div className={`rounded-xl p-6 border-2 transition-colors ${
                trainingModeEnabled
                  ? 'bg-gradient-to-br from-teal-50 to-emerald-50 border-teal-300'
                  : 'bg-gradient-to-br from-gray-50 to-slate-50 border-gray-200'
              }`}>
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    trainingModeEnabled ? 'bg-teal-100' : 'bg-gray-200'
                  }`}>
                    <FlaskConical className={`w-6 h-6 ${trainingModeEnabled ? 'text-teal-600' : 'text-gray-500'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold text-gray-900">Subscription Training Mode</h4>
                      <button
                        onClick={handleToggleTrainingMode}
                        disabled={trainingModeLoading}
                        className="flex items-center gap-2 transition-colors"
                      >
                        {trainingModeLoading ? (
                          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        ) : trainingModeEnabled ? (
                          <ToggleRight className="w-10 h-10 text-teal-600" />
                        ) : (
                          <ToggleLeft className="w-10 h-10 text-gray-400" />
                        )}
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                      When enabled, all tradies and clients will see a "Subscribe (Test Mode)" button that
                      activates Pro features instantly without requiring Stripe payment.
                    </p>

                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
                      trainingModeEnabled
                        ? 'bg-teal-100 text-teal-800 border border-teal-200'
                        : 'bg-gray-100 text-gray-600 border border-gray-200'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${trainingModeEnabled ? 'bg-teal-500 animate-pulse' : 'bg-gray-400'}`} />
                      {trainingModeEnabled ? 'Training Mode Active' : 'Training Mode Off'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Users className="w-6 h-6 text-sky-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">Subscribed Users</h4>
                    <p className="text-sm text-gray-600 mb-4">
                      Currently <span className="font-bold text-gray-900">{subscribedUsersCount}</span> user{subscribedUsersCount !== 1 ? 's' : ''} have
                      an active Pro subscription (including test mode activations).
                    </p>
                    <button
                      onClick={handleResetAllSubscriptions}
                      disabled={trainingModeLoading || subscribedUsersCount === 0}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[44px]"
                    >
                      {trainingModeLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Resetting...
                        </>
                      ) : (
                        'Reset All Test Subscriptions'
                      )}
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                      This will revert all users back to the free plan. Use after training sessions.
                    </p>
                  </div>
                </div>
              </div>

              <a
                href="/admin/verifications"
                className="block bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-6 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Shield className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">Verification Queue</h4>
                    <p className="text-sm text-gray-600">
                      Review pending tradie verifications, view uploaded documents and credentials, and approve or reject requests.
                    </p>
                  </div>
                </div>
              </a>

              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Zap className="w-6 h-6 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">Flash Boost Algorithm</h4>
                    <p className="text-sm text-gray-600 mb-4">
                      Finds all pending jobs created more than 2 hours ago that haven't been picked up yet, and marks them as Flash Deals with priority visibility for 1 hour to incentivize fast pickup.
                    </p>
                    <button
                      onClick={handleRunFlashBoost}
                      disabled={flashBoostLoading}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg min-h-[44px]"
                    >
                      {flashBoostLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          Run Flash Boost Algorithm
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'verification' && showTradieFeatures && (
            <VerificationCenter />
          )}
        </div>
      </div>

      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
      />

      {showToast && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={() => setShowToast(false)}
        />
      )}

      {showAvatarModal && profile?.avatar_url && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setShowAvatarModal(false)}
        >
          <button
            onClick={() => setShowAvatarModal(false)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-4xl max-h-[90vh] relative">
            <img
              src={profile.avatar_url}
              alt={profile.full_name || 'Profile photo'}
              className="max-w-full max-h-[90vh] object-contain rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
