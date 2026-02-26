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
