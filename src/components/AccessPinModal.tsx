import { useEffect, useRef, useState } from 'react';
import { Loader2, Lock, ShieldCheck, X } from 'lucide-react';
import Modal from './Modal';
import { getPinStatus, setupPin, verifyPin, changePin, forgotPin, resetPin } from '../lib/accessPin';

// ─────────────────────────────────────────────────────────────────────────────
// AccessPinModal — one self-contained modal for the whole access-PIN lifecycle:
//   • auto     → decides setup (no PIN yet) vs enter (reveal a job's codes)
//   • change   → change PIN from Settings (current + new + confirm)
// The reveal path returns the instructions via onRevealed(); setup/change/reset
// fire onChanged(). Forgot flows email a code and switch to reset in place.
// ─────────────────────────────────────────────────────────────────────────────

type Mode = 'loading' | 'setup' | 'enter' | 'change' | 'reset';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 'auto' resolves to setup/enter from the user's PIN status; 'change' for Settings. */
  initialMode?: 'auto' | 'change';
  /** Required to reveal — the job whose access instructions to return on verify. */
  jobId?: string;
  onRevealed?: (instructions: string | null) => void;
  onChanged?: () => void;
}

// N numeric boxes with auto-advance, backspace, and paste. Native numeric keypad
// on mobile via inputMode.
function PinBoxes({
  length, value, onChange, disabled, autoFocus,
}: { length: number; value: string; onChange: (v: string) => void; disabled?: boolean; autoFocus?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { if (autoFocus) refs.current[0]?.focus(); }, [autoFocus]);
  const setChar = (i: number, ch: string) => {
    const digit = ch.replace(/\D/g, '').slice(-1);
    const next = value.split('');
    next[i] = digit;
    const joined = next.join('').slice(0, length);
    onChange(joined);
    if (digit && i < length - 1) refs.current[i + 1]?.focus();
  };
  return (
    <div className="flex justify-center gap-2.5">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={value[i] ?? ''}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          onChange={(e) => setChar(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
            if (digits) { onChange(digits); refs.current[Math.min(digits.length, length - 1)]?.focus(); }
          }}
          className="w-12 h-14 text-center text-xl font-semibold text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500 disabled:bg-gray-50"
        />
      ))}
    </div>
  );
}

export default function AccessPinModal({ isOpen, onClose, initialMode = 'auto', jobId, onRevealed, onChanged }: Props) {
  const [mode, setMode] = useState<Mode>('loading');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [current, setCurrent] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const resetFields = () => { setPin(''); setConfirm(''); setCurrent(''); setCode(''); setError(''); };

  useEffect(() => {
    if (!isOpen) return;
    resetFields(); setNotice('');
    if (initialMode === 'change') { setMode('change'); return; }
    setMode('loading');
    getPinStatus().then((r) => {
      if (r.ok && r.data?.locked) { setMode('enter'); setError('Locked from too many attempts. Try again shortly.'); }
      else setMode(r.ok && r.data?.hasPin ? 'enter' : 'setup');
    });
  }, [isOpen, initialMode]);

  const submitSetup = async () => {
    if (pin.length !== 4) return setError('Enter a 4-digit PIN.');
    if (pin !== confirm) return setError('PINs don’t match.');
    setBusy(true); setError('');
    const r = await setupPin(pin);
    setBusy(false);
    if (r.ok) { onChanged?.(); onClose(); } else setError(r.error || 'Could not set your PIN.');
  };

  const submitEnter = async () => {
    if (!jobId) { onClose(); return; }
    if (pin.length !== 4) return setError('Enter your 4-digit PIN.');
    setBusy(true); setError('');
    const r = await verifyPin(pin, jobId);
    setBusy(false);
    if (r.ok) { onRevealed?.(r.data?.accessInstructions ?? null); onClose(); return; }
    setPin('');
    if (r.locked) setError(r.error || 'Locked. Try again shortly.');
    else setError(`${r.error || 'Incorrect PIN.'}${r.attemptsLeft != null ? ` ${r.attemptsLeft} attempt${r.attemptsLeft === 1 ? '' : 's'} left.` : ''}`);
  };

  const submitChange = async () => {
    if (current.length !== 4) return setError('Enter your current PIN.');
    if (pin.length !== 4) return setError('Enter a new 4-digit PIN.');
    if (pin !== confirm) return setError('New PINs don’t match.');
    setBusy(true); setError('');
    const r = await changePin(current, pin);
    setBusy(false);
    if (r.ok) { onChanged?.(); onClose(); } else setError(r.error || 'Could not change your PIN.');
  };

  const startForgot = async () => {
    setBusy(true); setError('');
    const r = await forgotPin();
    setBusy(false);
    if (r.ok) { resetFields(); setMode('reset'); setNotice('We emailed you a 6-digit reset code. Enter it below with a new PIN.'); }
    else setError(r.error || 'Could not send a reset code.');
  };

  const submitReset = async () => {
    if (code.length !== 6) return setError('Enter the 6-digit code from your email.');
    if (pin.length !== 4) return setError('Enter a new 4-digit PIN.');
    if (pin !== confirm) return setError('New PINs don’t match.');
    setBusy(true); setError('');
    const r = await resetPin(code, pin);
    setBusy(false);
    if (r.ok) {
      onChanged?.();
      // Back to enter so they can unlock with the new PIN (or just close in Settings).
      if (jobId) { resetFields(); setNotice('PIN reset. Enter your new PIN to view.'); setMode('enter'); }
      else onClose();
    } else setError(r.error || 'Could not reset your PIN.');
  };

  const heading = mode === 'setup' ? 'Set up a security PIN'
    : mode === 'change' ? 'Change your PIN'
    : mode === 'reset' ? 'Reset your PIN'
    : 'Enter your PIN';

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm">
      <div className="p-5">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-secondary-50 flex items-center justify-center">
              {mode === 'setup' ? <ShieldCheck className="w-5 h-5 text-secondary-600" /> : <Lock className="w-5 h-5 text-secondary-600" />}
            </div>
            <h2 className="text-base font-bold text-gray-900">{heading}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        {mode === 'loading' && (
          <div className="flex items-center justify-center py-8 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
        )}

        {mode === 'setup' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">This PIN keeps client access codes secure. You’ll enter it each time you view gate codes, keys, or alarm details.</p>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 text-center">Enter 4-digit PIN</label>
              <PinBoxes length={4} value={pin} onChange={(v) => { setPin(v); setError(''); }} autoFocus disabled={busy} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 text-center">Confirm 4-digit PIN</label>
              <PinBoxes length={4} value={confirm} onChange={(v) => { setConfirm(v); setError(''); }} disabled={busy} />
            </div>
          </div>
        )}

        {mode === 'enter' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Enter your 4-digit PIN to view access instructions.</p>
            <PinBoxes length={4} value={pin} onChange={(v) => { setPin(v); setError(''); }} autoFocus disabled={busy} />
            <button type="button" onClick={startForgot} disabled={busy} className="block mx-auto text-xs text-secondary-600 hover:text-secondary-700">Forgot PIN?</button>
          </div>
        )}

        {mode === 'change' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 text-center">Current PIN</label>
              <PinBoxes length={4} value={current} onChange={(v) => { setCurrent(v); setError(''); }} autoFocus disabled={busy} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 text-center">New PIN</label>
              <PinBoxes length={4} value={pin} onChange={(v) => { setPin(v); setError(''); }} disabled={busy} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 text-center">Confirm new PIN</label>
              <PinBoxes length={4} value={confirm} onChange={(v) => { setConfirm(v); setError(''); }} disabled={busy} />
            </div>
            <button type="button" onClick={startForgot} disabled={busy} className="block mx-auto text-xs text-secondary-600 hover:text-secondary-700">Forgot current PIN?</button>
          </div>
        )}

        {mode === 'reset' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 text-center">6-digit code (from email)</label>
              <PinBoxes length={6} value={code} onChange={(v) => { setCode(v); setError(''); }} autoFocus disabled={busy} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 text-center">New PIN</label>
              <PinBoxes length={4} value={pin} onChange={(v) => { setPin(v); setError(''); }} disabled={busy} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 text-center">Confirm new PIN</label>
              <PinBoxes length={4} value={confirm} onChange={(v) => { setConfirm(v); setError(''); }} disabled={busy} />
            </div>
          </div>
        )}

        {notice && <p className="mt-3 text-xs text-secondary-700 bg-secondary-50 rounded-lg px-3 py-2">{notice}</p>}
        {error && <p className="mt-3 text-xs text-red-600 text-center">{error}</p>}

        {mode !== 'loading' && (
          <button
            onClick={mode === 'setup' ? submitSetup : mode === 'enter' ? submitEnter : mode === 'change' ? submitChange : submitReset}
            disabled={busy}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary-600 text-white text-sm font-semibold rounded-xl hover:bg-secondary-700 disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {mode === 'setup' ? 'Set PIN' : mode === 'enter' ? 'Unlock' : mode === 'change' ? 'Change PIN' : 'Reset PIN'}
          </button>
        )}
      </div>
    </Modal>
  );
}
