import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, Lock, Key, Trash2, AlertTriangle, Shield, Smartphone, Download, KeyRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { friendlyError } from '../../lib/utils';
import { getPinStatus } from '../../lib/accessPin';
import AccessPinModal from '../AccessPinModal';

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
  const [accessPinSet, setAccessPinSet] = useState<boolean | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);

  useEffect(() => {
    checkMfaStatus();
    if (isTradie) refreshPinStatus();
  }, []);

  const refreshPinStatus = async () => {
    const r = await getPinStatus();
    setAccessPinSet(r.ok ? !!r.data?.hasPin : false);
  };

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
      setPasswordError(friendlyError(error, 'Unable to update your password. Please try again.'));
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
        supabase.from('reviews').select('*').eq('client_id', user.id),
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
          <h3 className="text-lg font-semibold text-ct-paper mb-4">Change Password</h3>
          <p className="text-sm text-ct-mute-2 mb-6">Enter a new password for your account. Must be at least 8 characters with uppercase, lowercase, and a number.</p>
        </div>

        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-ct-mute-2 mb-2">New Password</label>
          <div className="relative">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ct-mute" />
            <input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" className="w-full pl-12 pr-4 py-3 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal" aria-label="New password for ConnecTradie account" />
          </div>
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-ct-mute-2 mb-2">Confirm Password</label>
          <div className="relative">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ct-mute" />
            <input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="w-full pl-12 pr-4 py-3 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal" aria-label="Confirm new password for ConnecTradie account" />
          </div>
        </div>

        {passwordError && (
          <div className="p-4 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md"><p className="text-sm text-ct-rose">{passwordError}</p></div>
        )}
        {passwordSuccess && (
          <div className="p-4 bg-ct-teal/[0.14] border border-ct-teal/30 rounded-ct-md flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <CheckCircle2 className="w-5 h-5 text-ct-teal animate-bounce" />
            <p className="text-sm text-ct-teal font-medium">Your account is now more secure!</p>
          </div>
        )}

        <button type="submit" disabled={passwordLoading || !newPassword || !confirmPassword} className="w-full py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-h-[44px]">
          {passwordLoading ? (<><Loader2 className="w-5 h-5 animate-spin" />Updating Password...</>) : (<><Lock className="w-5 h-5" />Update Password</>)}
        </button>
      </form>

      {/* Two-Factor Authentication */}
      <div className="border-t border-ct-line p-6 md:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-ct-surface-2 rounded-ct-sm">
            <Shield className="w-5 h-5 text-ct-mute-2" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-ct-paper">Two-Factor Authentication</h3>
            <p className="text-sm text-ct-mute">Add an extra layer of security to your account</p>
          </div>
        </div>

        {mfaError && (
          <div className="mb-4 p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md">
            <p className="text-sm text-ct-rose">{mfaError}</p>
          </div>
        )}
        {mfaSuccess && (
          <div className="mb-4 p-3 bg-ct-teal/[0.14] border border-ct-teal/30 rounded-ct-md flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-ct-teal" />
            <p className="text-sm text-ct-teal font-medium">{mfaSuccess}</p>
          </div>
        )}

        {mfaEnabled ? (
          <div className="flex items-center justify-between p-4 bg-ct-teal/[0.14] border border-ct-teal/30 rounded-ct-md">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-ct-teal" />
              <div>
                <p className="text-sm font-medium text-ct-teal">2FA is enabled</p>
                <p className="text-xs text-ct-teal">Your account is protected with an authenticator app</p>
              </div>
            </div>
            <button
              onClick={handleDisableMfa}
              disabled={mfaLoading}
              className="px-4 py-2 text-sm font-medium text-ct-rose bg-ct-surface border border-ct-rose/[0.34] rounded-ct-sm hover:bg-ct-rose/[0.13] disabled:opacity-50 transition-colors"
            >
              {mfaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Disable'}
            </button>
          </div>
        ) : mfaQR ? (
          <div className="space-y-4">
            <div className="bg-ct-surface-2 border border-ct-line rounded-ct-md p-5 text-center">
              <p className="text-sm text-ct-mute-2 mb-4">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
              <img src={mfaQR} alt="2FA QR Code" className="mx-auto w-48 h-48 rounded-ct-sm border border-ct-line" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ct-mute-2 mb-2">Enter the 6-digit code from your app</label>
              <input
                type="text"
                value={mfaVerifyCode}
                onChange={(e) => setMfaVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full px-4 py-3 border border-ct-line rounded-ct-md text-center text-xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-ct-teal"
                maxLength={6}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setMfaQR(null); setMfaVerifyCode(''); }}
                className="flex-1 px-4 py-2.5 bg-ct-surface-2 text-ct-mute-2 rounded-ct-md text-sm font-medium hover:bg-ct-line transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyMfa}
                disabled={mfaVerifyCode.length !== 6 || mfaLoading}
                className="flex-1 px-4 py-2.5 bg-ct-teal text-ct-ink rounded-ct-md text-sm font-medium hover:brightness-110 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
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
            className="flex items-center gap-2 px-4 py-2.5 rounded-ct-md text-sm font-medium disabled:opacity-50 transition-colors hover:opacity-90"
            style={{ backgroundColor: 'var(--teal)', color: 'var(--ink)' }}
          >
            {mfaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            Enable Two-Factor Authentication
          </button>
        )}
      </div>

      {/* Access Instructions PIN (tradies only) */}
      {isTradie && (
        <div className="border-t border-ct-line p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-ct-surface-2 rounded-ct-sm">
              <KeyRound className="w-5 h-5 text-ct-mute-2" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-ct-paper">Access Instructions PIN</h3>
              <p className="text-sm text-ct-mute">A 4-digit PIN that unlocks client gate codes, key locations, and alarm details on your jobs.</p>
            </div>
          </div>

          {accessPinSet === null ? (
            <div className="flex items-center gap-2 text-sm text-ct-mute"><Loader2 className="w-4 h-4 animate-spin" /> Checking…</div>
          ) : accessPinSet ? (
            <div className="flex items-center justify-between p-4 bg-ct-surface-2 border border-ct-line rounded-ct-md">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-ct-mute-2" />
                <div>
                  <p className="text-sm font-medium text-ct-mute-2">Your access PIN is set</p>
                  <p className="text-xs text-ct-mute-2">You’ll enter it whenever you view protected access details.</p>
                </div>
              </div>
              <button
                onClick={() => setPinModalOpen(true)}
                className="px-4 py-2 text-sm font-medium text-ct-mute-2 bg-ct-surface border border-ct-line rounded-ct-sm hover:bg-ct-surface-2 transition-colors"
              >
                Change PIN
              </button>
            </div>
          ) : (
            <button
              onClick={() => setPinModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-ct-md text-sm font-medium transition-colors hover:opacity-90"
              style={{ backgroundColor: 'var(--surface-2)', color: 'var(--paper)' }}
            >
              <KeyRound className="w-4 h-4" />
              Set up Access PIN
            </button>
          )}

          <AccessPinModal
            isOpen={pinModalOpen}
            onClose={() => setPinModalOpen(false)}
            initialMode={accessPinSet ? 'change' : 'auto'}
            onChanged={refreshPinStatus}
          />
        </div>
      )}

      {/* Export My Data */}
      <div className="border-t border-ct-line p-6 md:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-ct-surface-2 rounded-ct-sm">
            <Download className="w-5 h-5 text-ct-mute-2" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-ct-paper">Export My Data</h3>
            <p className="text-sm text-ct-mute">Download all your personal data as a JSON file</p>
          </div>
        </div>
        <button
          onClick={handleExportData}
          disabled={exportLoading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-ct-md text-sm font-medium disabled:opacity-50 transition-colors hover:opacity-90"
          style={{ backgroundColor: 'var(--surface-2)', color: 'var(--paper)' }}
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

      <div className="border-t border-ct-line p-6 md:p-8">
        <h3 className="text-lg font-semibold text-ct-rose mb-2">Delete Account</h3>
        <p className="text-sm text-ct-mute-2 mb-4">Permanently delete your account and all associated data. This action cannot be undone.</p>

        {!showDeleteConfirm ? (
          <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 px-4 py-2.5 border border-ct-rose/[0.34] text-ct-rose rounded-ct-md text-sm font-medium hover:bg-ct-rose/[0.13] transition-colors">
            <Trash2 className="w-4 h-4" />Delete My Account
          </button>
        ) : (
          <div className="bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-ct-rose flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-ct-paper">This will permanently delete:</p>
                <ul className="mt-2 text-sm text-ct-rose space-y-1 list-disc list-inside">
                  <li>Your profile and personal information</li>
                  <li>All job history and messages</li>
                  <li>Reviews and ratings</li>
                  {isTradie && <li>Your tradie listing and professional details</li>}
                </ul>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-ct-paper mb-1.5">Type <span className="font-bold">DELETE</span> to confirm</label>
              <input type="text" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" className="w-full px-4 py-2.5 border border-ct-rose/40 rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-rose0 bg-ct-surface" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }} className="flex-1 px-4 py-2.5 bg-ct-surface border border-ct-line text-ct-mute-2 rounded-ct-sm text-sm font-medium hover:bg-ct-surface-2 transition-colors">Cancel</button>
              <button onClick={handleDelete} disabled={deleteConfirmText !== 'DELETE' || deleteLoading} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-ct-rose text-ct-ink rounded-ct-sm text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}Delete Permanently
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
