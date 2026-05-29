import { supabase } from './supabase';
import { getAuthHeaders } from './edgeFn';
import {
  CHANNEL_SMS,
  CHANNEL_IN_APP,
  CHANNEL_EMAIL,
  NOTIFICATION_TEMPLATES,
  type NotificationPayload,
  type NotificationResult,
  type ChannelResult,
  type NotificationChannel,
} from './notificationTypes';
import {
  resolveChannels,
  shouldSendSms,
  shouldSendEmail,
  shouldSendInApp,
} from './notificationRouter';

async function filterChannelsByUserPreferences(
  userId: string,
  channels: NotificationChannel[]
): Promise<NotificationChannel[]> {
  const { data } = await supabase
    .from('profiles')
    .select('sms_alerts_enabled, push_enabled')
    .eq('id', userId)
    .maybeSingle();

  if (!data) return channels.filter(c => c === CHANNEL_IN_APP);

  return channels.filter(c => {
    if (c === CHANNEL_SMS && !data.sms_alerts_enabled) return false;
    return true;
  });
}

async function insertInAppNotification(payload: NotificationPayload, channels: NotificationChannel[]): Promise<string | null> {
  if (!shouldSendInApp(channels)) return null;

  // Deduplicate: skip if an identical notification already exists for this user + type + job
  if (payload.jobId) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', payload.userId)
      .eq('type', payload.type.toLowerCase())
      .eq('job_id', payload.jobId)
      .maybeSingle();

    if (existing) return existing.id;
  }

  const primaryChannel = CHANNEL_IN_APP;

  // Route through the SECURITY DEFINER create_notification RPC instead of a
  // direct INSERT so the row gets created even after we revoke direct INSERT
  // privileges from the authenticated role on the notifications table. The
  // RPC validates auth + target user existence and is the only path that
  // can write notifications going forward.
  const { data, error } = await supabase.rpc('create_notification', {
    p_user_id: payload.userId,
    p_title: payload.title || NOTIFICATION_TEMPLATES[payload.type]?.defaultTitle || 'Notification',
    p_message: payload.message,
    p_type: payload.type.toLowerCase(),
    p_channel: primaryChannel,
    p_read: false,
    p_link: payload.link || null,
    p_job_id: payload.jobId || null,
    p_metadata: payload.metadata || {},
  });

  if (error) {
    console.error('Failed to insert in-app notification:', error.message);
    return null;
  }

  // RPC returns the new id directly (uuid).
  return (data as string | null) ?? null;
}

async function dispatchSms(payload: NotificationPayload): Promise<ChannelResult> {
  if (!payload.recipientPhone) {
    return { channel: CHANNEL_SMS, success: false, error: 'No phone number provided' };
  }

  const template = NOTIFICATION_TEMPLATES[payload.type]?.smsTemplate;
  const smsBody = template
    ? interpolateTemplate(template, payload.metadata || {})
    : `ConnecTradie: ${payload.message}`;

  try {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`;
    const headers = await getAuthHeaders();
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: payload.recipientPhone,
        body: smsBody,
        notificationType: payload.type,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        channel: CHANNEL_SMS,
        success: false,
        error: errData.error || `SMS dispatch failed (${response.status})`,
      };
    }

    return { channel: CHANNEL_SMS, success: true, sentAt: new Date().toISOString() };
  } catch (err) {
    return {
      channel: CHANNEL_SMS,
      success: false,
      error: err instanceof Error ? err.message : 'SMS dispatch failed',
    };
  }
}

async function dispatchEmail(payload: NotificationPayload): Promise<ChannelResult> {
  if (!payload.recipientEmail) {
    return { channel: CHANNEL_EMAIL, success: false, error: 'No email address provided' };
  }

  try {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`;
    const headers = await getAuthHeaders();
    const template = NOTIFICATION_TEMPLATES[payload.type];
    const emailSubjectTemplate = template?.emailSubject;
    const subject = emailSubjectTemplate
      ? interpolateTemplate(emailSubjectTemplate, payload.metadata || {})
      : payload.title || template?.defaultTitle;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: payload.recipientEmail,
        subject,
        body: payload.message,
        notificationType: payload.type,
        metadata: payload.metadata,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        channel: CHANNEL_EMAIL,
        success: false,
        error: errData.error || `Email dispatch failed (${response.status})`,
      };
    }

    return { channel: CHANNEL_EMAIL, success: true, sentAt: new Date().toISOString() };
  } catch (err) {
    return {
      channel: CHANNEL_EMAIL,
      success: false,
      error: err instanceof Error ? err.message : 'Email dispatch failed',
    };
  }
}

function interpolateTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = data[key];
    return value != null ? String(value) : match;
  });
}

async function updateDeliveryTimestamps(
  notificationId: string,
  channelResults: ChannelResult[]
): Promise<void> {
  const updates: Record<string, string> = {};

  for (const result of channelResults) {
    if (result.success && result.sentAt) {
      if (result.channel === CHANNEL_SMS) updates.sms_sent_at = result.sentAt;
      if (result.channel === CHANNEL_EMAIL) updates.email_sent_at = result.sentAt;
    }
  }

  if (Object.keys(updates).length === 0) return;

  await supabase
    .from('notifications')
    .update(updates)
    .eq('id', notificationId);
}

export async function sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
  const rawChannels = resolveChannels(payload);
  const channels = await filterChannelsByUserPreferences(payload.userId, rawChannels);
  const results: ChannelResult[] = [];

  const notificationId = await insertInAppNotification(payload, channels);

  if (shouldSendInApp(channels)) {
    results.push({
      channel: CHANNEL_IN_APP,
      success: notificationId !== null,
      error: notificationId ? undefined : 'Failed to insert notification row',
      sentAt: notificationId ? new Date().toISOString() : undefined,
    });
  }

  const externalPromises: Promise<ChannelResult>[] = [];

  if (shouldSendSms(channels)) {
    externalPromises.push(dispatchSms(payload));
  }

  if (shouldSendEmail(channels)) {
    externalPromises.push(dispatchEmail(payload));
  }

  if (externalPromises.length > 0) {
    const externalResults = await Promise.allSettled(externalPromises);
    const channelOrder: NotificationChannel[] = [];
    if (shouldSendSms(channels)) channelOrder.push(CHANNEL_SMS);
    if (shouldSendEmail(channels)) channelOrder.push(CHANNEL_EMAIL);

    for (let i = 0; i < externalResults.length; i++) {
      const result = externalResults[i];
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          channel: channelOrder[i] || CHANNEL_IN_APP,
          success: false,
          error: result.reason?.message || 'Unknown dispatch error',
        });
      }
    }
  }

  if (notificationId) {
    await updateDeliveryTimestamps(notificationId, results);
  }

  return { notificationId, channels: results };
}

// ---------------------------------------------------------------------------
// insertNotification — thin RPC wrapper for sites that don't go through
// sendNotification(). The shape mirrors the existing INSERT shape so call
// sites only need to change the table call to this helper. Direct INSERTs on
// the notifications table will fail after the RLS tighten migration; every
// caller MUST route through this helper or the create_notification RPC.
//
// Returns the new notification id, or null on failure (errors are logged,
// never thrown — notification inserts are non-critical to most flows).
// ---------------------------------------------------------------------------
export interface InsertNotificationInput {
  user_id: string;
  title: string;
  message: string;
  type: string;
  channel?: string;
  read?: boolean;
  link?: string | null;
  job_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function insertNotification(input: InsertNotificationInput): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_notification', {
    p_user_id: input.user_id,
    p_title: input.title,
    p_message: input.message,
    p_type: input.type,
    p_channel: input.channel ?? 'in_app',
    p_read: input.read ?? false,
    p_link: input.link ?? null,
    p_job_id: input.job_id ?? null,
    p_metadata: input.metadata ?? null,
  });
  if (error) {
    console.error('insertNotification: rpc failed:', error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

/** Bulk variant: insert multiple notifications in parallel via RPC. */
export async function insertNotificationsBatch(rows: InsertNotificationInput[]): Promise<(string | null)[]> {
  return Promise.all(rows.map(insertNotification));
}

export async function markNotificationRead(notificationId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('notifications')
    .update({ read: true, read_at: now })
    .eq('id', notificationId);

  return !error;
}

export async function markAllNotificationsRead(userId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('notifications')
    .update({ read: true, read_at: now })
    .eq('user_id', userId)
    .is('read_at', null);

  return !error;
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) return 0;
  return count || 0;
}

export async function fetchUserNotifications(
  userId: string,
  limit = 20,
  offset = 0
): Promise<{ data: unknown[]; hasMore: boolean }> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit);

  if (error) return { data: [], hasMore: false };
  return { data: data || [], hasMore: (data?.length || 0) > limit };
}
