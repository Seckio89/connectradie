import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Client wrapper for the access-pin edge function. The 4-digit PIN gates the
// reveal of job access instructions (gate/alarm codes, key locations), which
// are withheld server-side until a correct PIN is entered.
// ─────────────────────────────────────────────────────────────────────────────

export interface PinResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
  /** verify: attempts left before lockout. */
  attemptsLeft?: number;
  /** verify/change: locked out now. */
  locked?: boolean;
  lockedUntil?: string | null;
  /** verify/change: no PIN exists yet — caller should run the setup flow. */
  needsSetup?: boolean;
}

async function call<T = unknown>(action: string, body: Record<string, unknown> = {}): Promise<PinResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('access-pin', { body: { action, ...body } });
    if (error) {
      // Non-2xx bodies come through error.context — pull the structured fields.
      let payload: Record<string, unknown> = {};
      try { payload = (await (error as { context?: Response }).context?.json()) ?? {}; } catch { /* opaque */ }
      return {
        ok: false,
        error: (payload.error as string) || 'Something went wrong. Please try again.',
        status: (error as { context?: Response }).context?.status,
        attemptsLeft: payload.attemptsLeft as number | undefined,
        locked: payload.locked as boolean | undefined,
        lockedUntil: (payload.lockedUntil as string | null) ?? undefined,
        needsSetup: payload.needsSetup as boolean | undefined,
      };
    }
    if (data?.error) return { ok: false, error: data.error, needsSetup: data.needsSetup };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: 'Network error. Please try again.' };
  }
}

export const getPinStatus = () =>
  call<{ hasPin: boolean; locked: boolean; lockedUntil: string | null }>('status');

export const hasAccessInstructions = (jobId: string) =>
  call<{ hasInstructions: boolean; hasPin: boolean }>('has', { jobId });

export const setupPin = (pin: string) => call('setup', { pin });

export const verifyPin = (pin: string, jobId: string) =>
  call<{ accessInstructions: string | null }>('verify', { pin, jobId });

export const changePin = (currentPin: string, newPin: string) =>
  call('change', { currentPin, newPin });

export const forgotPin = () => call('forgot');

export const resetPin = (code: string, newPin: string) => call('reset', { code, newPin });
