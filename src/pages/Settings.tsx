import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { User, Loader2, CheckCircle2, Shield, X, Zap, Crown, BadgeCheck, Wrench, Bell, Settings2, Lock, Moon, Sun, Monitor } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
import SubscriptionModal from '../components/SubscriptionModal';
import VerificationCenter from '../components/VerificationCenter';
import TradieProfessionalSettings from '../components/TradieProfessionalSettings';
import Toast from '../components/Toast';
import ProfileTab from '../components/settings/ProfileTab';
import SecurityTab from '../components/settings/SecurityTab';
import NotificationsTab from '../components/settings/NotificationsTab';
import AdminToolsTab from '../components/settings/AdminToolsTab';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import { calculateProfileCompletion, getProfileCompletionTasks } from '../lib/utils';
import { requestPushPermission, subscribeToPush, savePushPreferences, getPushPermissionStatus } from '../lib/notifications';

type TabType = 'profile' | 'professional' | 'security' | 'verification' | 'notifications' | 'admin';

export default function Settings() {
  const { user, profile, tradieDetails, refreshProfile, signOut } = useAuth();
  const { isDark, toggle: toggleDarkMode } = useDarkMode();
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
  const [, setSmsEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<string>('default');
  const [notifSaving, setNotifSaving] = useState(false);

  const [trainingModeEnabled, setTrainingModeEnabled] = useState(false);
  const [trainingModeLoading, setTrainingModeLoading] = useState(false);
  const [subscribedUsersCount, setSubscribedUsersCount] = useState(0);

  const isTradie = profile?.role === 'tradie';
  const isAdmin = profile?.role === 'admin';
  const showTradieFeatures = isTradie || isAdmin;
  const isSubscriptionAdmin = profile?.role === 'admin';
  const normalizedProfile = profile
    ? {
        ...profile,
        phone: profile.phone || undefined,
        address: profile.address ?? undefined,
        postcode: profile.postcode ?? undefined,
      }
    : null;
  const profileCompletion = calculateProfileCompletion(normalizedProfile);
  const incompleteTasks = getProfileCompletionTasks(normalizedProfile);

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
      await refreshProfile();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }

    setLoading(false);
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    // Record the self-deletion (so login check shows correct message)
    await supabase.from('account_removals').insert({
      user_id: user.id,
      email: profile?.email || user.email || '',
      full_name: profile?.full_name || '',
      reason: 'self_deleted',
      additional_message: 'Account deleted by user',
      removed_at: new Date().toISOString(),
    });

    // Delete tradie_details if applicable
    if (isTradie) {
      await supabase.from('tradie_details').delete().eq('profile_id', user.id);
    }

    // Delete the profile (cascades to related data)
    const { error } = await supabase.from('profiles').delete().eq('id', user.id);

    if (error) {
      setToastMessage('Failed to delete account: ' + error.message);
      setToastType('error');
      setShowToast(true);
      return;
    }

    // Delete the auth user via edge function (so they can re-register with the same email)
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession?.access_token) {
        await supabase.functions.invoke('delete-user', {
          headers: { Authorization: `Bearer ${currentSession.access_token}` },
        });
      }
    } catch {
      // Auth user deletion failed — profile is already gone, proceed with sign out
    }

    // Sign out and redirect to home
    await signOut();
    window.location.href = '/';
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
    } catch {
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
          <p className="text-gray-500 mt-1">Manage your account settings and profile</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex flex-col sm:flex-row items-center gap-6 p-6 md:p-8 pb-6 border-b border-gray-200">
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => profile?.avatar_url && setShowAvatarModal(true)}
                disabled={!profile?.avatar_url}
                className="relative w-28 h-28 rounded-xl flex-shrink-0 ring-4 ring-gray-200 hover:ring-primary-200 transition-all"
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
                  <BadgeCheck className="w-5 h-5 text-primary-500" />
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
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-warm-50 text-warm-700 text-sm font-medium rounded-full border border-warm-200 hover:bg-warm-100 transition-colors"
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
            <div className="bg-gradient-to-r from-warm-50 to-warm-50 border-b border-warm-200 p-6 md:p-8">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-warm-600" />
                  <h3 className="font-semibold text-warm-900">Complete Your Profile</h3>
                </div>
                <span className="text-sm font-bold text-warm-700">{profileCompletion}%</span>
              </div>
              <div className="w-full bg-warm-200 rounded-full h-2 mb-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-warm-500 to-warm-500 h-full transition-all duration-500"
                  style={{ width: `${profileCompletion}%` }}
                />
              </div>
              {incompleteTasks.length > 0 && (
                <div className="text-sm text-warm-800">
                  <p className="font-medium mb-2">Missing:</p>
                  <ul className="space-y-1">
                    {incompleteTasks.slice(0, 3).map((task, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <span className="text-warm-600">•</span> {task}
                      </li>
                    ))}
                    {incompleteTasks.length > 3 && (
                      <li className="text-warm-700 italic">+ {incompleteTasks.length - 3} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {profileCompletion === 100 && showCompleteBanner && (
            <div className="bg-gradient-to-r from-green-50 to-secondary-50 border-b border-green-200 p-6 md:p-8 flex items-center gap-3">
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
                    ? 'bg-warm-50 text-warm-700'
                    : 'text-gray-500 hover:bg-gray-50'
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
                      ? 'bg-warm-50 text-warm-700'
                      : 'text-gray-500 hover:bg-gray-50'
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
                    ? 'bg-warm-50 text-warm-700'
                    : 'text-gray-500 hover:bg-gray-50'
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
                      ? 'bg-warm-50 text-warm-700'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  Get Verified
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors min-h-[44px] ${
                  activeTab === 'notifications'
                    ? 'bg-warm-50 text-warm-700'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Bell className="w-4 h-4" />
                Notifications
              </button>
              {isSubscriptionAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveTab('admin')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors min-h-[44px] ${
                    activeTab === 'admin'
                      ? 'bg-warm-50 text-warm-700'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <Wrench className="w-4 h-4" />
                  Admin Tools
                </button>
              )}
            </div>
          </div>

          {activeTab === 'profile' && (
            <ProfileTab
              email={profile?.email || ''}
              fullName={fullName}
              setFullName={setFullName}
              phone={phone}
              setPhone={setPhone}
              address={address}
              setAddress={setAddress}
              postcode={postcode}
              setPostcode={setPostcode}
              loading={loading}
              success={success}
              error={error}
              onSubmit={handleSubmit}
            />
          )}

          {activeTab === 'professional' && showTradieFeatures && (
            <TradieProfessionalSettings />
          )}

          {activeTab === 'security' && (
            <SecurityTab isTradie={isTradie} onDeleteAccount={handleDeleteAccount} />
          )}

          {activeTab === 'notifications' && (
            <>
              <NotificationsTab
                pushEnabled={pushEnabled}
                pushPermission={pushPermission}
                notifSaving={notifSaving}
                onTogglePush={handleTogglePush}
              />
              <div className="border-t border-gray-200 p-6 md:p-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Monitor className="w-5 h-5 text-gray-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Appearance</h3>
                    <p className="text-sm text-gray-500">Choose your preferred theme</p>
                  </div>
                </div>
                <div className="flex gap-3 theme-toggle-group">
                  <button
                    onClick={() => { if (isDark) toggleDarkMode(); }}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${!isDark ? 'border-warm-500 bg-warm-50 text-warm-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <Sun className="w-4 h-4" />
                    Light
                  </button>
                  <button
                    onClick={() => { if (!isDark) toggleDarkMode(); }}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${isDark ? 'border-warm-500 bg-warm-50 text-warm-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <Moon className="w-4 h-4" />
                    Dark
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === 'admin' && isSubscriptionAdmin && (
            <AdminToolsTab
              trainingModeEnabled={trainingModeEnabled}
              trainingModeLoading={trainingModeLoading}
              subscribedUsersCount={subscribedUsersCount}
              flashBoostLoading={flashBoostLoading}
              onToggleTrainingMode={handleToggleTrainingMode}
              onResetSubscriptions={handleResetAllSubscriptions}
              onRunFlashBoost={handleRunFlashBoost}
            />
          )}

          {activeTab === 'verification' && showTradieFeatures && (
            <SectionErrorBoundary fallbackTitle="Verification center failed to load">
              <VerificationCenter />
            </SectionErrorBoundary>
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
            aria-label="Close photo preview"
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
