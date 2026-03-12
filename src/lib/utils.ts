export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

export const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  const formattedDate = formatDate(dateString);
  const time = date.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${formattedDate} ${time}`;
};

export const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

interface ProfileData {
  full_name?: string;
  phone?: string;
  address?: string;
  postcode?: string;
  email?: string;
}

export const calculateProfileCompletion = (profile: ProfileData | null): number => {
  if (!profile) return 0;

  const fields = [
    { key: 'email', required: true },
    { key: 'full_name', required: true },
    { key: 'phone', required: true },
    { key: 'address', required: true },
    { key: 'postcode', required: true },
  ];

  let completed = 0;
  fields.forEach(field => {
    if (profile[field.key as keyof ProfileData]) {
      completed++;
    }
  });

  return Math.round((completed / fields.length) * 100);
};

export function checkLicenseExpired(
  verificationStatus?: string,
  licenseExpiry?: string | null
): boolean {
  if (verificationStatus === 'expired') return true;
  if (licenseExpiry && new Date(licenseExpiry) < new Date()) return true;
  return false;
}

export const getProfileCompletionTasks = (profile: ProfileData | null): string[] => {
  if (!profile) return ['Add email', 'Add full name', 'Add phone', 'Add address', 'Add postcode'];

  const tasks: string[] = [];
  if (!profile.email) tasks.push('Add email');
  if (!profile.full_name) tasks.push('Add full name');
  if (!profile.phone) tasks.push('Add phone number');
  if (!profile.address) tasks.push('Add address');
  if (!profile.postcode) tasks.push('Add postcode');

  return tasks;
};

/**
 * Converts technical error messages into user-friendly language.
 * Use this for all user-facing error toasts and messages.
 */
export function friendlyError(error: string | { message?: string; code?: string } | unknown, fallback?: string): string {
  const msg = typeof error === 'string'
    ? error
    : error && typeof error === 'object' && 'message' in error
      ? (error as { message: string }).message
      : '';

  if (!msg) return fallback || 'Something went wrong. Please try again.';

  const raw = msg.toLowerCase();

  // Foreign key / dependency errors (e.g. can't delete account with linked data)
  if (raw.includes('foreign key') || raw.includes('violates foreign key')) {
    if (raw.includes('profiles') || raw.includes('delete') || raw.includes('account')) {
      return 'Your account has linked data that needs to be removed first. Please contact support if this issue persists.';
    }
    return 'This item is linked to other records and cannot be removed right now. Please contact support if you need help.';
  }

  // Unique constraint violations
  if (raw.includes('unique') || raw.includes('duplicate') || raw.includes('already exists') || raw.includes('23505')) {
    if (raw.includes('email')) return 'This email address is already in use.';
    if (raw.includes('phone')) return 'This phone number is already in use.';
    return 'This record already exists. Please check your details and try again.';
  }

  // Not null / required field violations
  if (raw.includes('not-null') || raw.includes('null value') || raw.includes('violates not-null')) {
    return 'Some required information is missing. Please fill in all required fields.';
  }

  // Permission / auth errors
  if (raw.includes('permission denied') || raw.includes('rls') || raw.includes('policy')) {
    return 'You don\'t have permission to perform this action. Please sign in again or contact support.';
  }
  if (raw.includes('jwt') || raw.includes('token') || raw.includes('expired') || raw.includes('not authenticated')) {
    return 'Your session has expired. Please sign in again.';
  }

  // Network / connection errors
  if (raw.includes('network') || raw.includes('fetch') || raw.includes('failed to fetch') || raw.includes('econnrefused')) {
    return 'Unable to connect. Please check your internet connection and try again.';
  }
  if (raw.includes('timeout') || raw.includes('timed out')) {
    return 'The request took too long. Please try again.';
  }

  // Stripe / payment errors
  if (raw.includes('insufficient') && raw.includes('balance')) {
    return 'Payment could not be processed. Please try again or use a different payment method.';
  }
  if (raw.includes('card') && (raw.includes('declined') || raw.includes('failed'))) {
    return 'Your card was declined. Please try a different payment method.';
  }
  if (raw.includes('stripe') || raw.includes('payment')) {
    return 'There was a problem processing your payment. Please try again or contact support.';
  }

  // Rate limiting
  if (raw.includes('rate limit') || raw.includes('too many requests') || raw.includes('429')) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  // Server errors
  if (raw.includes('500') || raw.includes('internal server')) {
    return 'Something went wrong on our end. Please try again shortly.';
  }

  // File / upload errors
  if (raw.includes('file') && (raw.includes('too large') || raw.includes('size'))) {
    return 'The file is too large. Please choose a smaller file.';
  }
  if (raw.includes('upload') && raw.includes('fail')) {
    return 'File upload failed. Please try again.';
  }

  // If the message is already short and readable (no SQL jargon), pass it through
  if (msg.length < 100 && !raw.includes('constraint') && !raw.includes('relation') && !raw.includes('column') && !raw.includes('table') && !raw.includes('schema')) {
    return msg;
  }

  // Fallback for any unrecognized technical error
  return fallback || 'Something went wrong. Please try again or contact support.';
}
