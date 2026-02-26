export const CHANNEL_SMS = 'sms' as const;
export const CHANNEL_IN_APP = 'in_app' as const;
export const CHANNEL_EMAIL = 'email' as const;

export type NotificationChannel = typeof CHANNEL_SMS | typeof CHANNEL_IN_APP | typeof CHANNEL_EMAIL;

export const NOTIFICATION_TYPES = {
  TRADIE_ON_THE_WAY: 'TRADIE_ON_THE_WAY',
  VARIATION_REQUEST: 'VARIATION_REQUEST',
  TIME_CHANGE_REQUEST: 'TIME_CHANGE_REQUEST',
  URGENT_CLIENT_MESSAGE: 'URGENT_CLIENT_MESSAGE',
  NEW_FLASH_LEAD: 'NEW_FLASH_LEAD',
  JOB_ACCEPTED: 'JOB_ACCEPTED',
  JOB_BOOKING_CONFIRMED: 'JOB_BOOKING_CONFIRMED',
  MILESTONE_COMPLETED: 'MILESTONE_COMPLETED',
  PROJECT_STATUS_CHANGE: 'PROJECT_STATUS_CHANGE',
  REVIEW_RECEIVED: 'REVIEW_RECEIVED',
  JOB_COMPLETED: 'JOB_COMPLETED',
  INVOICE_RECEIVED: 'INVOICE_RECEIVED',
  QUOTE_RECEIVED: 'QUOTE_RECEIVED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  LICENSE_EXPIRING: 'LICENSE_EXPIRING',
  BOOKING_REMINDER: 'BOOKING_REMINDER',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export interface NotificationPayload {
  type: NotificationType;
  userId: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  link?: string;
  jobId?: string;
  isUrgent?: boolean;
  daysLeft?: number;
  recipientEmail?: string;
  recipientPhone?: string;
}

export interface ChannelResult {
  channel: NotificationChannel;
  success: boolean;
  error?: string;
  sentAt?: string;
}

export interface NotificationResult {
  notificationId: string | null;
  channels: ChannelResult[];
}

export const NOTIFICATION_TEMPLATES: Record<
  NotificationType,
  { defaultTitle: string; smsTemplate?: string; emailSubject?: string }
> = {
  [NOTIFICATION_TYPES.TRADIE_ON_THE_WAY]: {
    defaultTitle: 'Tradie On The Way',
    smsTemplate: 'ConnecTradie: Your tradie is on the way. ETA {eta}. Track in app.',
  },
  [NOTIFICATION_TYPES.VARIATION_REQUEST]: {
    defaultTitle: 'Variation Request',
    smsTemplate: 'ConnecTradie: A variation of ${amount} has been requested. Approve in app.',
  },
  [NOTIFICATION_TYPES.TIME_CHANGE_REQUEST]: {
    defaultTitle: 'Schedule Change Request',
    smsTemplate: 'ConnecTradie: Your booking has a reschedule request. Review in app.',
    emailSubject: 'Schedule Change Requested',
  },
  [NOTIFICATION_TYPES.URGENT_CLIENT_MESSAGE]: {
    defaultTitle: 'Urgent Message',
    smsTemplate: 'ConnecTradie: Urgent message from {senderName} about your job. Check app.',
  },
  [NOTIFICATION_TYPES.NEW_FLASH_LEAD]: {
    defaultTitle: 'New Urgent Lead',
    smsTemplate: 'ConnecTradie: URGENT {category} job in {suburb}. Be first to respond!',
    emailSubject: 'New {category} Lead in {suburb}',
  },
  [NOTIFICATION_TYPES.JOB_ACCEPTED]: {
    defaultTitle: 'Job Accepted',
    emailSubject: 'Your Job Has Been Accepted',
  },
  [NOTIFICATION_TYPES.JOB_BOOKING_CONFIRMED]: {
    defaultTitle: 'Booking Confirmed',
    emailSubject: 'Booking Confirmed for {scheduledDate}',
  },
  [NOTIFICATION_TYPES.MILESTONE_COMPLETED]: {
    defaultTitle: 'Milestone Completed',
  },
  [NOTIFICATION_TYPES.PROJECT_STATUS_CHANGE]: {
    defaultTitle: 'Project Update',
  },
  [NOTIFICATION_TYPES.REVIEW_RECEIVED]: {
    defaultTitle: 'New Review',
  },
  [NOTIFICATION_TYPES.JOB_COMPLETED]: {
    defaultTitle: 'Job Completed',
    emailSubject: 'Job Completed — Please Review',
  },
  [NOTIFICATION_TYPES.INVOICE_RECEIVED]: {
    defaultTitle: 'Invoice Received',
    emailSubject: 'Invoice Received — ${amount}',
  },
  [NOTIFICATION_TYPES.QUOTE_RECEIVED]: {
    defaultTitle: 'Quote Received',
    emailSubject: 'New Quote — ${amount}',
  },
  [NOTIFICATION_TYPES.PAYMENT_RECEIVED]: {
    defaultTitle: 'Payment Received',
    emailSubject: 'Payment of ${amount} Confirmed',
  },
  [NOTIFICATION_TYPES.LICENSE_EXPIRING]: {
    defaultTitle: 'License Expiring',
    smsTemplate: 'ConnecTradie: Your license expires in {daysLeft} days. Update now to stay verified.',
    emailSubject: 'Your License Expires in {daysLeft} Days',
  },
  [NOTIFICATION_TYPES.BOOKING_REMINDER]: {
    defaultTitle: 'Booking Reminder',
    emailSubject: 'Reminder: Upcoming Booking on {scheduledDate}',
  },
};
