// Tradie verification — frontend side.
//
// The pure logic (ABN checksum, name matching, licence parsing, pre-checks,
// register URLs) lives in supabase/functions/_shared and is re-exported here so
// the browser and the edge functions cannot disagree. That is the same route
// src/lib/__tests__/feeV21.test.ts takes to _shared/pricing.

import { supabase } from './supabase';
import { callEdgeFunction } from './edgeFn';
import type { Database } from '../types/supabase';

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];

export {
  normaliseAbn,
  isValidAbnChecksum,
  formatAbn,
  normaliseBusinessName,
  businessNameMatches,
  classifyAbnResult,
} from '../../supabase/functions/_shared/abnVerification';
export type { AbnVerificationStatus } from '../../supabase/functions/_shared/abnVerification';

export {
  STATE_CODES,
  parseAuDate,
  parseLicenceText,
  runPrechecks,
  holderNameMatches,
  licenceClassMatchesTrade,
  buildRegisterUrl,
  templateHasDeepLink,
} from '../../supabase/functions/_shared/licenceParsing';
export type { StateCode, ParsedLicence, PrecheckResult } from '../../supabase/functions/_shared/licenceParsing';

export type BusinessVerification = Row<'business_verifications'>;
export type LicenceVerification = Row<'licence_verifications'>;
export type LicenceRegister = Row<'licence_registers'>;
export type LicenceStatus = LicenceVerification['status'];

export const LICENCE_UPLOADS_BUCKET = 'licence-uploads';
export const LICENCE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
/** Signed URLs for licence photos live 10 minutes — long enough to review, short enough that a leaked link is dead by lunch. */
export const LICENCE_PHOTO_SIGNED_URL_SECONDS = 10 * 60;

export const CONSENT_PURPOSE_LICENCE_OCR = 'licence_ocr';
/** Bump when the consent copy in LicenceConsentScreen changes in substance. */
export const CONSENT_TEXT_VERSION_LICENCE_OCR = 'licence_ocr_v1';

// ── ABN ─────────────────────────────────────────────────────────────────────

export interface VerifyAbnResponse {
  ok: true;
  id: string;
  status: 'verified' | 'review' | 'failed';
  abn_status: string;
  entity_name: string | null;
  business_names: string[];
  entity_type: string | null;
  gst_registered: boolean;
  name_match: boolean;
  abr_state: string | null;
  abr_postcode: string | null;
  checked_at: string;
}

export function verifyAbn(abn: string, claimedBusinessName: string): Promise<VerifyAbnResponse> {
  return callEdgeFunction<VerifyAbnResponse>('verify-abn', { abn, claimed_business_name: claimedBusinessName });
}

export async function fetchOwnBusinessVerification(userId: string): Promise<BusinessVerification | null> {
  try {
    const { data, error } = await supabase
      .from('business_verifications')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('fetchOwnBusinessVerification failed', err);
    return null;
  }
}

// ── Consent ─────────────────────────────────────────────────────────────────

export async function recordLicenceOcrConsent(granted: boolean): Promise<void> {
  const { error } = await supabase.rpc('record_consent', {
    p_purpose: CONSENT_PURPOSE_LICENCE_OCR,
    p_consent_text_version: CONSENT_TEXT_VERSION_LICENCE_OCR,
    p_granted: granted,
  });
  if (error) throw new Error(`Couldn't record your choice: ${error.message}`);
}

export async function hasLicenceOcrConsent(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('consent_records')
      .select('granted')
      .eq('user_id', userId)
      .eq('purpose', CONSENT_PURPOSE_LICENCE_OCR)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return !!data?.granted;
  } catch (err) {
    console.error('hasLicenceOcrConsent failed', err);
    return false;
  }
}

// ── Licence upload + extraction ─────────────────────────────────────────────

export type LicenceVerificationDraft = Pick<
  LicenceVerification,
  | 'id' | 'trade_category' | 'state_code' | 'register_id' | 'storage_path'
  | 'licence_number' | 'licence_holder_name' | 'licence_class' | 'expiry_date'
  | 'ocr_confidence' | 'ocr_provider' | 'precheck_expiry_ok' | 'precheck_name_match'
  | 'precheck_class_match' | 'status' | 'created_at'
>;

export interface ExtractLicenceResponse {
  ok: true;
  verification: LicenceVerificationDraft;
  note: string | null;
  parser: string;
}

/** Upload under {user_id}/{uuid}.{ext}; the bucket policy enforces the folder. */
export async function uploadLicencePhoto(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Upload a photo (JPEG, PNG, WebP or HEIC), not a document.');
  if (file.size > LICENCE_PHOTO_MAX_BYTES) throw new Error('That photo is over 5 MB. Take it again at a lower resolution.');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(LICENCE_UPLOADS_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: '0',
  });
  if (error) throw new Error(`The photo didn't upload: ${error.message}`);
  return path;
}

export function extractLicence(input: { storage_path: string; trade_category: string; state_code: string }): Promise<ExtractLicenceResponse> {
  return callEdgeFunction<ExtractLicenceResponse>('extract-licence', input);
}

/** The "type the details myself" path: no photo, no consent, no OCR. */
export function startManualLicence(input: { trade_category: string; state_code: string }): Promise<ExtractLicenceResponse> {
  return callEdgeFunction<ExtractLicenceResponse>('extract-licence', { ...input, manual: true });
}

export interface SubmitLicenceResponse {
  ok: true;
  verification: Pick<LicenceVerification, 'id' | 'status' | 'licence_number' | 'licence_holder_name' | 'licence_class' | 'expiry_date' | 'precheck_expiry_ok' | 'precheck_name_match' | 'precheck_class_match'>;
}

export function submitLicence(input: {
  verification_id: string;
  licence_number: string;
  licence_holder_name: string;
  licence_class: string;
  expiry_date: string;
}): Promise<SubmitLicenceResponse> {
  return callEdgeFunction<SubmitLicenceResponse>('submit-licence', input);
}

export interface ReviewLicenceResponse {
  ok: true;
  verification: Pick<LicenceVerification, 'id' | 'status' | 'reviewed_at' | 'photo_deleted_at'>;
  photo_deleted: boolean;
}

export function reviewLicence(input: { verification_id: string; decision: 'verified' | 'rejected'; rejection_reason?: string }): Promise<ReviewLicenceResponse> {
  return callEdgeFunction<ReviewLicenceResponse>('review-licence', input);
}

/** Latest licence row for the signed-in tradie (any status), newest first. */
export async function fetchOwnLicenceVerifications(userId: string): Promise<LicenceVerification[]> {
  try {
    const { data, error } = await supabase
      .from('licence_verifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch (err) {
    console.error('fetchOwnLicenceVerifications failed', err);
    return [];
  }
}

export async function fetchLicenceRegister(registerId: string | null): Promise<LicenceRegister | null> {
  if (!registerId) return null;
  try {
    const { data, error } = await supabase.from('licence_registers').select('*').eq('id', registerId).maybeSingle();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('fetchLicenceRegister failed', err);
    return null;
  }
}

// ── Public badges ───────────────────────────────────────────────────────────

export interface VerificationBadges {
  abn_verified: boolean;
  gst_registered: boolean;
  licence_verified: boolean;
  licence_state: string | null;
  licence_expiry_month: string | null;
}

export async function fetchVerificationBadges(tradieId: string): Promise<VerificationBadges | null> {
  try {
    const { data, error } = await supabase.rpc('get_tradie_verification_badges', { p_tradie_id: tradieId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return null;
    return {
      abn_verified: !!row.abn_verified,
      gst_registered: !!row.gst_registered,
      licence_verified: !!row.licence_verified,
      licence_state: row.licence_state ?? null,
      licence_expiry_month: row.licence_expiry_month ?? null,
    };
  } catch (err) {
    console.error('fetchVerificationBadges failed', err);
    return null;
  }
}

/** '2027-12' -> 'Dec 2027' */
export function formatExpiryMonth(yyyyMm: string | null | undefined): string | null {
  if (!yyyyMm) return null;
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m) return null;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export const LICENCE_STATUS_LABEL: Record<LicenceStatus, string> = {
  pending: 'Not started',
  extracted: 'Details to confirm',
  awaiting_review: 'Awaiting review',
  verified: 'Verified',
  rejected: 'Not verified',
  expired: 'Expired',
};
