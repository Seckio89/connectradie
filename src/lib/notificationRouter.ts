import {
  CHANNEL_SMS,
  CHANNEL_IN_APP,
  CHANNEL_EMAIL,
  NOTIFICATION_TYPES,
  type NotificationChannel,
  type NotificationType,
  type NotificationPayload,
} from './notificationTypes';

const STATIC_ROUTES: Record<string, NotificationChannel[]> = {
  [NOTIFICATION_TYPES.TRADIE_ON_THE_WAY]: [CHANNEL_SMS, CHANNEL_IN_APP],
  [NOTIFICATION_TYPES.VARIATION_REQUEST]: [CHANNEL_SMS, CHANNEL_IN_APP],
  [NOTIFICATION_TYPES.TIME_CHANGE_REQUEST]: [CHANNEL_SMS, CHANNEL_EMAIL, CHANNEL_IN_APP],
  [NOTIFICATION_TYPES.URGENT_CLIENT_MESSAGE]: [CHANNEL_SMS, CHANNEL_IN_APP],

  [NOTIFICATION_TYPES.JOB_ACCEPTED]: [CHANNEL_EMAIL, CHANNEL_IN_APP],
  [NOTIFICATION_TYPES.JOB_BOOKING_CONFIRMED]: [CHANNEL_EMAIL, CHANNEL_IN_APP],
  [NOTIFICATION_TYPES.MILESTONE_COMPLETED]: [CHANNEL_IN_APP],
  [NOTIFICATION_TYPES.PROJECT_STATUS_CHANGE]: [CHANNEL_IN_APP],
  [NOTIFICATION_TYPES.REVIEW_RECEIVED]: [CHANNEL_IN_APP],
  [NOTIFICATION_TYPES.JOB_COMPLETED]: [CHANNEL_EMAIL, CHANNEL_IN_APP],

  [NOTIFICATION_TYPES.INVOICE_RECEIVED]: [CHANNEL_EMAIL, CHANNEL_IN_APP],
  [NOTIFICATION_TYPES.QUOTE_RECEIVED]: [CHANNEL_EMAIL, CHANNEL_IN_APP],
  [NOTIFICATION_TYPES.PAYMENT_RECEIVED]: [CHANNEL_EMAIL, CHANNEL_IN_APP],

  [NOTIFICATION_TYPES.BOOKING_REMINDER]: [CHANNEL_EMAIL, CHANNEL_IN_APP],
  [NOTIFICATION_TYPES.NEW_LEAD]: [CHANNEL_IN_APP],
};

function resolveConditionalRoutes(payload: NotificationPayload): NotificationChannel[] | null {
  if (payload.type === NOTIFICATION_TYPES.NEW_FLASH_LEAD) {
    if (payload.isUrgent) {
      return [CHANNEL_SMS, CHANNEL_EMAIL, CHANNEL_IN_APP];
    }
    return [CHANNEL_IN_APP];
  }

  if (payload.type === NOTIFICATION_TYPES.LICENSE_EXPIRING) {
    const daysLeft = payload.daysLeft ?? 14;
    if (daysLeft <= 2) {
      return [CHANNEL_SMS, CHANNEL_EMAIL, CHANNEL_IN_APP];
    }
    return [CHANNEL_EMAIL, CHANNEL_IN_APP];
  }

  return null;
}

export function resolveChannels(payload: NotificationPayload): NotificationChannel[] {
  const conditional = resolveConditionalRoutes(payload);
  if (conditional) return conditional;

  return STATIC_ROUTES[payload.type] || [CHANNEL_IN_APP];
}

export function shouldSendSms(channels: NotificationChannel[]): boolean {
  return channels.includes(CHANNEL_SMS);
}

export function shouldSendEmail(channels: NotificationChannel[]): boolean {
  return channels.includes(CHANNEL_EMAIL);
}

export function shouldSendInApp(channels: NotificationChannel[]): boolean {
  return channels.includes(CHANNEL_IN_APP);
}

export function getRoutingSummary(type: NotificationType, options?: { isUrgent?: boolean; daysLeft?: number }): {
  channels: NotificationChannel[];
  reasoning: string;
} {
  const mockPayload: NotificationPayload = {
    type,
    userId: '',
    title: '',
    message: '',
    isUrgent: options?.isUrgent,
    daysLeft: options?.daysLeft,
  };

  const channels = resolveChannels(mockPayload);

  const reasonMap: Partial<Record<NotificationType, string>> = {
    [NOTIFICATION_TYPES.TRADIE_ON_THE_WAY]: 'Time-sensitive ETA alert requiring immediate attention',
    [NOTIFICATION_TYPES.VARIATION_REQUEST]: 'Money approval needed, often while on-site',
    [NOTIFICATION_TYPES.TIME_CHANGE_REQUEST]: 'Schedule disruption requiring quick response -- email for record, SMS for urgency',
    [NOTIFICATION_TYPES.URGENT_CLIENT_MESSAGE]: 'Flagged as urgent by the client',
    [NOTIFICATION_TYPES.NEW_FLASH_LEAD]: options?.isUrgent
      ? 'Flash lead with urgent flag -- SMS + email to maximise response speed'
      : 'Standard lead -- in-app only to reduce fatigue',
    [NOTIFICATION_TYPES.LICENSE_EXPIRING]: (options?.daysLeft ?? 14) <= 2
      ? 'Critical compliance deadline -- SMS escalation'
      : 'Advance warning -- email for record keeping',
    [NOTIFICATION_TYPES.INVOICE_RECEIVED]: 'Financial record -- email for paperwork, in-app for visibility',
    [NOTIFICATION_TYPES.QUOTE_RECEIVED]: 'Financial record -- email for paperwork, in-app for visibility',
    [NOTIFICATION_TYPES.PAYMENT_RECEIVED]: 'Financial record -- email for paperwork, in-app for visibility',
    [NOTIFICATION_TYPES.JOB_ACCEPTED]: 'Job milestone -- email confirmation for records, in-app for visibility',
    [NOTIFICATION_TYPES.JOB_BOOKING_CONFIRMED]: 'Booking confirmation -- email for calendar reference, in-app for visibility',
    [NOTIFICATION_TYPES.JOB_COMPLETED]: 'Job completion -- email to prompt review, in-app for visibility',
    [NOTIFICATION_TYPES.BOOKING_REMINDER]: 'Upcoming booking -- email reminder for planning, in-app for visibility',
  };

  return {
    channels,
    reasoning: reasonMap[type] || 'Standard in-app notification',
  };
}
