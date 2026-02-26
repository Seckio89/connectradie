import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VerificationLevel = 'none' | 'basic' | 'standard' | 'premium';

export interface VerificationBadge {
  type: 'identity' | 'licensed' | 'insured' | 'police_check';
  label: string;
  verified: boolean;
}

export interface ABNValidation {
  valid: boolean;
  error?: string;
}

export interface LicenseExpiryCheck {
  isExpiring: boolean;
  daysUntilExpiry: number | null;
  isExpired: boolean;
}

interface ProfileForVerification {
  verification_status?: string | null;
  abn_number?: string | null;
  abn_verified?: boolean | null;
  license_number?: string | null;
  license_verified?: boolean | null;
  license_expiry?: string | null;
  license_state?: string | null;
  insurance_policy?: string | null;
  documents_url?: string | null;
}

// ---------------------------------------------------------------------------
// ABN validation
// ---------------------------------------------------------------------------

/**
 * ABN weighting factors as defined by the ATO.
 * @see https://abr.business.gov.au/Help/AbnFormat
 */
const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const;

/**
 * Validate an Australian Business Number using the official checksum
 * algorithm.
 *
 * Steps:
 * 1. Must be exactly 11 digits.
 * 2. Subtract 1 from the first digit.
 * 3. Multiply each digit by its corresponding weight.
 * 4. Sum the products; the remainder when divided by 89 must be 0.
 */
export function validateABN(abn: string): ABNValidation {
  // Strip whitespace and dashes
  const cleaned = abn.replace(/[\s-]/g, '');

  if (!/^\d{11}$/.test(cleaned)) {
    return { valid: false, error: 'ABN must be exactly 11 digits' };
  }

  const digits = cleaned.split('').map(Number);

  // Step 2: subtract 1 from first digit
  digits[0] = digits[0] - 1;

  // Step 3 & 4: weighted sum
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += digits[i] * ABN_WEIGHTS[i];
  }

  if (sum % 89 !== 0) {
    return { valid: false, error: 'Invalid ABN checksum' };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Document upload
// ---------------------------------------------------------------------------

/**
 * Upload verification documents to the `verification-documents` storage
 * bucket and update the user's profile with the document paths.
 */
export async function submitDocumentsForVerification(files: File[]): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  if (files.length === 0) throw new Error('At least one document is required');

  const uploadedPaths: string[] = [];

  for (const file of files) {
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${user.id}/${timestamp}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('verification-documents')
      .upload(path, file, { upsert: false });

    if (uploadError) throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);

    uploadedPaths.push(path);
  }

  // Update profile with document references and set status to pending
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      documents_url: uploadedPaths.join(','),
      verification_status: 'pending',
    })
    .eq('id', user.id);

  if (updateError) throw new Error(updateError.message);

  return uploadedPaths;
}

// ---------------------------------------------------------------------------
// Verification level
// ---------------------------------------------------------------------------

/**
 * Determine the verification level of a profile.
 *
 * - **none**: No verification steps completed.
 * - **basic**: ABN verified OR identity verified.
 * - **standard**: ABN verified AND license verified.
 * - **premium**: Standard + insurance uploaded + documents approved.
 */
export function getVerificationLevel(profile: ProfileForVerification): VerificationLevel {
  const abnVerified = profile.abn_verified === true;
  const licenseVerified = profile.license_verified === true;
  const hasInsurance = !!profile.insurance_policy;
  const documentsApproved = profile.verification_status === 'verified';

  if (abnVerified && licenseVerified && hasInsurance && documentsApproved) {
    return 'premium';
  }

  if (abnVerified && licenseVerified) {
    return 'standard';
  }

  if (abnVerified || documentsApproved) {
    return 'basic';
  }

  return 'none';
}

// ---------------------------------------------------------------------------
// Verification badges
// ---------------------------------------------------------------------------

/**
 * Return the set of verification badges for a profile with their current
 * verified state.
 */
export function getVerificationBadges(profile: ProfileForVerification): VerificationBadge[] {
  return [
    {
      type: 'identity',
      label: 'Identity Verified',
      verified: profile.verification_status === 'verified',
    },
    {
      type: 'licensed',
      label: 'Licensed',
      verified: profile.license_verified === true,
    },
    {
      type: 'insured',
      label: 'Insured',
      verified: !!profile.insurance_policy,
    },
    {
      type: 'police_check',
      label: 'Police Check',
      verified: false, // placeholder — requires manual admin verification
    },
  ];
}

// ---------------------------------------------------------------------------
// License expiry
// ---------------------------------------------------------------------------

/**
 * Check whether a tradie's license is expiring soon (within 30 days) or
 * has already expired.
 */
export function checkLicenseExpiry(profile: ProfileForVerification): LicenseExpiryCheck {
  if (!profile.license_expiry) {
    return { isExpiring: false, daysUntilExpiry: null, isExpired: false };
  }

  const now = new Date();
  const expiry = new Date(profile.license_expiry);
  const diffMs = expiry.getTime() - now.getTime();
  const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return {
    isExpiring: daysUntilExpiry > 0 && daysUntilExpiry <= 30,
    daysUntilExpiry,
    isExpired: daysUntilExpiry <= 0,
  };
}

/**
 * Fetch all tradie profiles whose licenses expire within the next 30 days.
 */
export async function getExpiringLicenses(): Promise<
  Array<{
    id: string;
    full_name: string;
    email: string;
    license_number: string;
    license_expiry: string;
    license_state: string;
    daysUntilExpiry: number;
  }>
> {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, license_number, license_expiry, license_state')
    .not('license_expiry', 'is', null)
    .not('license_number', 'is', null)
    .lte('license_expiry', thirtyDaysFromNow.toISOString())
    .gte('license_expiry', now.toISOString())
    .order('license_expiry', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((profile) => {
    const expiry = new Date(profile.license_expiry!);
    const diffMs = expiry.getTime() - now.getTime();
    const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return {
      id: profile.id,
      full_name: profile.full_name ?? '',
      email: profile.email ?? '',
      license_number: profile.license_number!,
      license_expiry: profile.license_expiry!,
      license_state: profile.license_state ?? '',
      daysUntilExpiry,
    };
  });
}
