import { supabase } from './supabase';
import type { Job } from '../types/database';

export async function requestPushPermission(): Promise<'granted' | 'denied' | 'default'> {
  if (!('Notification' in window)) return 'denied';
  return Notification.requestPermission();
}

export function getPushPermissionStatus(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) return null;

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) return existing;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });

    return subscription;
  } catch {
    return null;
  }
}

export async function savePushPreferences(
  userId: string,
  pushEnabled: boolean,
  subscription: PushSubscription | null
) {
  const { error } = await supabase
    .from('profiles')
    .update({
      push_enabled: pushEnabled,
      push_subscription: subscription ? subscription.toJSON() : null,
    })
    .eq('id', userId);

  return !error;
}

export async function saveSmsPreference(userId: string, enabled: boolean) {
  const { error } = await supabase
    .from('profiles')
    .update({ sms_alerts_enabled: enabled })
    .eq('id', userId);

  return !error;
}

function extractCategory(description: string): string {
  const match = description.match(/^\[([^\]]+)\]/);
  return match ? match[1] : 'General';
}

function extractSuburb(address: string | null): string {
  if (!address) return 'your area';
  const parts = address.split(',').map((p) => p.trim());
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

export async function showUrgentLeadNotification(job: Job) {
  const category = extractCategory(job.description);
  const suburb = extractSuburb(job.location_address);
  const title = `⚡ URGENT JOB: ${category}`;
  const body = `New high-priority lead in ${suburb}. Claim it now!`;
  const url = `/leads`;

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION',
      title,
      body,
      url,
    });
  } else if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body,
      icon: '/icons/icon-192x192.svg',
      tag: 'urgent-lead',
      requireInteraction: true,
    });
    notification.onclick = () => {
      window.focus();
      window.location.href = url;
      notification.close();
    };
  }
}

export function simulateSmsAlert(job: Job, tradieNames: string[]) {
  const category = extractCategory(job.description);
  const suburb = extractSuburb(job.location_address);
  const link = `${window.location.origin}/leads`;
  const message = `ConnecTradie: URGENT ${category} job in ${suburb}. View now: ${link}`;

  return {
    message,
    recipientCount: tradieNames.length,
    timestamp: new Date().toISOString(),
  };
}

export async function notifyTradiesForUrgentJob(job: Job) {
  const { data: tradies } = await supabase
    .from('profiles')
    .select('id, full_name, push_enabled, sms_alerts_enabled, push_subscription')
    .eq('role', 'tradie');

  if (!tradies || tradies.length === 0) return { push: 0, sms: 0 };

  let pushCount = 0;
  let smsCount = 0;

  const pushEligible = tradies.filter((t: any) => t.push_enabled && t.push_subscription);
  if (pushEligible.length > 0) {
    pushCount = pushEligible.length;
  }

  const smsEligible = tradies.filter((t: any) => t.sms_alerts_enabled);
  if (smsEligible.length > 0) {
    const smsResult = simulateSmsAlert(
      job,
      smsEligible.map((t: any) => t.full_name || 'Unknown Tradie')
    );
    smsCount = smsResult.recipientCount;
  }

  return { push: pushCount, sms: smsCount };
}
