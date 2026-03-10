import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, Lock, Key, Trash2, AlertTriangle, Shield, Smartphone, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface SecurityTabProps {
  isTradie: boolean;
  onDeleteAccount: () => Promise<void>;
}

export default function SecurityTab({ isTradie, onDeleteAccount }: SecurityTabProps) {
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaQR, setMfaQR] = useState<string | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaSuccess, setMfaSuccess] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    checkMfaStatus();
  }, []);

  const checkMfaStatus = async () => {
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const totpFactors = data?.totp || [];
      setMfaEnabled(totpFactors.some(f => f.status === 'verified'));
    } catch {
      // MFA may not be enabled on this Supabase project
    }
  };

  const handleEnableMfa = async () => {
    setMfaLoading(true);
    setMfaError('');
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setMfaQR(data.totp.qr_code);
    } catch (err: unknown) {
      setMfaError(err instanceof Error ? err.message : 'Failed to set up 2FA');
    }
    setMfaLoading(false);
  };

  const handleVerifyMfa = async () => {
    setMfaLoading(true);
    setMfaError('');
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const unverified = factors?.totp?.find(f => f.status === 'unverified');
      if (!unverified) throw new Error('No pending factor found');

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: unverified.id });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: unverified.id,
        challengeId: challenge.id,
        code: mfaVerifyCode,
      });
      if (verifyError) throw verifyError;

      setMfaEnabled(true);
      setMfaQR(null);
      setMfaVerifyCode('');
      setMfaSuccess('Two-factor authentication enabled!');
      setTimeout(() => setMfaSuccess(''), 3000);
    } catch (err: unknown) {
      setMfaError(err instanceof Error ? err.message : 'Verification failed');
    }
    setMfaLoading(false);
  };

  const handleDisableMfa = async () => {
    setMfaLoading(true);
    setMfaError('');
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp?.find(f => f.status === 'verified');
      if (verified) {
        await supabase.auth.mfa.unenroll({ factorId: verified.id });
      }
      setMfaEnabled(false);
      setMfaSuccess('Two-factor authentication disabled');
      setTimeout(() => setMfaSuccess(''), 3000);
    } catch (err: unknown) {
      setMfaError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    }
    setMfaLoading(false);
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

    const { error } = await supabase.auth.updateUser({ password: newPassword });

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

  const handleExportData = async () => {
    if (!user) return;
    setExportLoading(true);
    try {
      const [profileRes, jobsClientRes, jobsTradieRes, messagesRes, reviewsReviewerRes, reviewsTradieRes, paymentsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('jobs').select('*').eq('client_id', user.id),
        supabase.from('jobs').select('*').eq('tradie_id', user.id),
        supabase.from('messages').select('*').eq('sender_id', user.id),
        supabase.from('reviews').select('*').eq('reviewer_id', user.id),
        supabase.from('reviews').select('*').eq('tradie_id', user.id),
        supabase.from('payments').select('*').eq('profile_id', user.id),
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        profile: profileRes.data || null,
        jobs_as_client: jobsClientRes.data || [],
        jobs_as_tradie: jobsTradieRes.data || [],
        messages_sent: messagesRes.data || [],
        reviews_written: reviewsReviewerRes.data || [],
        reviews_received: reviewsTradieRes.data || [],
        payments: paymentsRes.data || [],
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `my-data-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Export failed silently
    }
    setExportLoading(false);
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    await onDeleteAccount();
    setDeleteLoading(false);
  };

  return (
    <div>
      <form onSubmit={handlePasswordChange} className="space-y-6 p-6 md:p-8" aria-label="Change ConnecTradie Password">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h3>
          <p className="text-sm text-gray-600 mb-6">Enter a new password for your account. Must be at least 8 characters with uppercase, lowercase, and a number.</p>
        </div>

        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
          <div className="relative">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500" aria-label="New password for ConnecTradie account" />
          </div>
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
          <div className="relative">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500" aria-label="Confirm new password for ConnecTradie account" />
          </div>
        </div>

        {passwordError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl"><p className="text-sm text-red-600">{passwordError}</p></div>
        )}
        {passwordSuccess && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <CheckCircle2 className="w-5 h-5 text-green-600 animate-bounce" />
            <p className="text-sm text-green-600 font-medium">Your account is now more secure!</p>
          </div>
        )}

        <button type="submit" disabled={passwordLoading || !newPassword || !confirmPassword} className="w-full py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-h-[44px]">
          {passwordLoading ? (<><Loader2 className="w-5 h-5 animate-spin" />Updating Password...</>) : (<><Lock className="w-5 h-5" />Update Password</>)}
        </button>
      </form>

      {/* Two-Factor Authentication */}
      <div className="border-t border-gray-200 p-6 md:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary-50 rounded-lg">
            <Shield className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Two-Factor Authentication</h3>
            <p className="text-sm text-gray-500">Add an extra layer of security to your account</p>
          </div>
        </div>

        {mfaError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600">{mfaError}</p>
          </div>
        )}
        {mfaSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <p className="text-sm text-green-600 font-medium">{mfaSuccess}</p>
          </div>
        )}

        {mfaEnabled ? (
          <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-xl">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">2FA is enabled</p>
                <p className="text-xs text-green-600">Your account is protected with an authenticator app</p>
              </div>
            </div>
            <button
              onClick={handleDisableMfa}
              disabled={mfaLoading}
              className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {mfaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Disable'}
            </button>
          </div>
        ) : mfaQR ? (
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-center">
              <p className="text-sm text-gray-700 mb-4">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
              <img src={mfaQR} alt="2FA QR Code" className="mx-auto w-48 h-48 rounded-lg border border-gray-200" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Enter the 6-digit code from your app</label>
              <input
                type="text"
                value={mfaVerifyCode}
                onChange={(e) => setMfaVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center text-xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                maxLength={6}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setMfaQR(null); setMfaVerifyCode(''); }}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyMfa}
                disabled={mfaVerifyCode.length !== 6 || mfaLoading}
                className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {mfaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                Verify & Enable
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleEnableMfa}
            disabled={mfaLoading}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {mfaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            Enable Two-Factor Authentication
          </button>
        )}
      </div>

      {/* Export My Data */}
      <div className="border-t border-gray-200 p-6 md:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-secondary-50 rounded-lg">
            <Download className="w-5 h-5 text-secondary-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Export My Data</h3>
            <p className="text-sm text-gray-500">Download all your personal data as a JSON file</p>
          </div>
        </div>
        <button
          onClick={handleExportData}
          disabled={exportLoading}
          className="flex items-center gap-2 px-4 py-2.5 bg-secondary-600 text-white rounded-xl text-sm font-medium hover:bg-secondary-700 disabled:opacity-50 transition-colors"
        >
          {exportLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Download My Data
            </>
          )}
        </button>
      </div>

      <div className="border-t border-gray-200 p-6 md:p-8">
        <h3 className="text-lg font-semibold text-red-600 mb-2">Delete Account</h3>
        <p className="text-sm text-gray-600 mb-4">Permanently delete your account and all associated data. This action cannot be undone.</p>

        {!showDeleteConfirm ? (
          <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors">
            <Trash2 className="w-4 h-4" />Delete My Account
          </button>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">This will permanently delete:</p>
                <ul className="mt-2 text-sm text-red-700 space-y-1 list-disc list-inside">
                  <li>Your profile and personal information</li>
                  <li>All job history and messages</li>
                  <li>Reviews and ratings</li>
                  {isTradie && <li>Your tradie listing and professional details</li>}
                </ul>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-red-800 mb-1.5">Type <span className="font-bold">DELETE</span> to confirm</label>
              <input type="text" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" className="w-full px-4 py-2.5 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }} className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleDelete} disabled={deleteConfirmText !== 'DELETE' || deleteLoading} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}Delete Permanently
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
