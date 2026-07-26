import { supabase } from './supabase';
import type { Job, Insert } from '../types/database';
import { sendNotification } from './notificationService';
import { NOTIFICATION_TYPES } from './notificationTypes';

/**
 * Narrow a list of tradie profile IDs to those whose service area covers the
 * job site. Fails OPEN: if the job has no coordinates, or a tradie has no base
 * coordinates, that tradie is kept (we never suppress a lead on missing data).
 */
async function filterTradiesByServiceArea(tradieIds: string[], job: Job): Promise<string[]> {
  if (tradieIds.length === 0) return tradieIds;
  if (job.latitude == null || job.longitude == null) return tradieIds;

  // Tradies' base coordinates are HOME ADDRESSES. They used to be selected here
  // for the whole candidate list straight from the browser, which meant any
  // signed-in user could read every tradie's home location. The distance test
  // now runs inside a SECURITY DEFINER function so the coordinates never leave
  // the database — it only filters the id list we already hold.
  const { data: allowedIds, error } = await supabase.rpc('filter_tradies_by_service_area', {
    p_tradie_ids: tradieIds,
    p_lat: job.latitude,
    p_lng: job.longitude,
  });

  if (error || !allowedIds) return tradieIds; // fail open on query error

  // Preserve the caller's ordering rather than the RPC's.
  const allowed = new Set(allowedIds as string[]);
  return tradieIds.filter((id) => allowed.has(id));
}

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
  try {
    // Ensure push_subscription is a plain object (not a class instance)
    const pushSubObj = subscription ? JSON.parse(JSON.stringify(subscription.toJSON())) : null;

    // The subscription (endpoint + p256dh/auth keys) is a device secret and now
    // lives in profile_private, which is owner-or-admin only. `push_enabled` is
    // a harmless preference and stays on profiles. profiles.has_push_subscription
    // is kept in sync by trg_sync_has_push_subscription — do not write it here.
    const { error: prefError } = await supabase
      .from('profiles')
      .update({ push_enabled: pushEnabled })
      .eq('id', userId);

    const privatePayload: Insert<'profile_private'> = {
      profile_id: userId,
      push_subscription: pushSubObj,
    };
    const { error: subError } = await supabase
      .from('profile_private')
      .upsert(privatePayload, { onConflict: 'profile_id' });

    return !prefError && !subError;
  } catch (err) {
    console.error('Failed to save push preferences:', err);
    return false;
  }
}

export async function saveSmsPreference(userId: string, enabled: boolean) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ sms_alerts_enabled: enabled })
      .eq('id', userId);

    return !error;
  } catch (err) {
    console.error('Failed to save SMS preference:', err);
    return false;
  }
}

function extractCategory(description: string): string {
  const match = description.match(/^\[([^\]]+)\]/);
  return match ? match[1] : 'General';
}

const CATEGORY_TO_PROFESSION: Record<string, string> = {
  cleaning: 'Cleaner', cleaner: 'Cleaner',
  plumbing: 'Plumber', plumber: 'Plumber',
  electrician: 'Electrician', electrical: 'Electrician',
  builder: 'Builder', building: 'Builder',
  painter: 'Painter', painting: 'Painter',
  landscaper: 'Landscaper', landscaping: 'Landscaper', gardener: 'Landscaper', gardening: 'Landscaper',
  carpenter: 'Carpenter', carpentry: 'Carpenter',
  roofer: 'Roofer', roofing: 'Roofer',
  concreter: 'Concreter', concreting: 'Concreter',
  bricklayer: 'Bricklayer', bricklaying: 'Bricklayer',
  fencer: 'Fencer', fencing: 'Fencer',
  tiler: 'Tiler', tiling: 'Tiler',
  locksmith: 'Locksmith',
  hvac: 'HVAC', 'air conditioning': 'HVAC',
  'pest control': 'Pest Control', pest: 'Pest Control',
  handyman: 'Handyman',
  glazier: 'Glazier', glazing: 'Glazier',
  plasterer: 'Plasterer', plastering: 'Plasterer',
  renderer: 'Renderer', rendering: 'Renderer',
};

function categoryToProfession(category: string): string {
  const lower = category.toLowerCase().replace(/_/g, ' ');
  if (CATEGORY_TO_PROFESSION[lower]) return CATEGORY_TO_PROFESSION[lower];
  for (const [key, value] of Object.entries(CATEGORY_TO_PROFESSION)) {
    if (lower.includes(key)) return value;
  }
  return category.replace(/\b\w/g, c => c.toUpperCase());
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

/**
 * Notify all tradies matching the job's trade category that a new lead is available.
 * Sends in-app bell notifications so tradies see it in real-time.
 */
export async function notifyTradiesForNewLead(job: Job) {
  try {
    const rawCategory = extractCategory(job.description);
    const profession = categoryToProfession(rawCategory);
    const displayCategory = profession;
    const suburb = extractSuburb(job.location_address);

    // Find tradies whose trade_category matches (try profession name and raw category)
    const { data: tradies, error } = await supabase
      .from('tradie_details')
      .select('profile_id, trade_category')
      .or(`trade_category.ilike.${profession},trade_category.ilike.${rawCategory},trade_category.ilike.%${rawCategory}%`);

    if (error || !tradies || tradies.length === 0) {
      // Fallback: notify all tradies if no category match or query fails
      const { data: allTradies } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'tradie');

      if (!allTradies || allTradies.length === 0) return { notified: 0 };

      const fallbackCandidates = allTradies.map((t) => t.id).filter((id) => id !== job.client_id);
      // Only notify tradies whose service area covers the job (fail-open).
      const fallbackIds = await filterTradiesByServiceArea(fallbackCandidates, job);
      if (fallbackIds.length === 0) return { notified: 0 };
      // Annotated so every key is column-checked — see the `Insert`/`Update`
      // note in types/database.ts.
      // The callback-return annotation is the load-bearing one — `.map()` infers
      // through a naked generic and erases object-literal freshness.
      const fallbackImpressions: Insert<'lead_impressions'>[] =
        fallbackIds.map((tradieId): Insert<'lead_impressions'> => ({ job_id: job.id, tradie_id: tradieId }));
      await supabase
        .from('lead_impressions')
        .upsert(
          fallbackImpressions,
          { onConflict: 'job_id,tradie_id', ignoreDuplicates: true },
        );

      const promises = fallbackIds.map((tradieId) =>
        sendNotification({
          type: NOTIFICATION_TYPES.NEW_LEAD,
          userId: tradieId,
          title: `New ${displayCategory} Lead`,
          message: `A new ${displayCategory} job has been posted in ${suburb}. Submit your quote now!`,
          link: '/work',
          jobId: job.id,
          metadata: { category: rawCategory, suburb, job_id: job.id },
        }).catch(() => null)
      );
      await Promise.allSettled(promises);
      return { notified: fallbackIds.length };
    }

    // Filter out the client who posted the job
    const categoryTradieIds = tradies
      .map((t) => t.profile_id)
      .filter((id) => id !== job.client_id);

    // Then narrow to tradies whose service area covers the job (fail-open).
    const tradieIds = await filterTradiesByServiceArea(categoryTradieIds, job);

    if (tradieIds.length === 0) return { notified: 0 };

    // Record impressions so the nudge cron can age them. ON CONFLICT DO NOTHING
    // because re-broadcasting must not reset the original shown_at clock.
    const impressions: Insert<'lead_impressions'>[] =
      tradieIds.map((tradieId): Insert<'lead_impressions'> => ({ job_id: job.id, tradie_id: tradieId }));
    await supabase
      .from('lead_impressions')
      .upsert(
        impressions,
        { onConflict: 'job_id,tradie_id', ignoreDuplicates: true },
      );

    const promises = tradieIds.map((tradieId) =>
      sendNotification({
        type: NOTIFICATION_TYPES.NEW_LEAD,
        userId: tradieId,
        title: `New ${displayCategory} Lead`,
        message: `A new ${displayCategory} job has been posted in ${suburb}. Submit your quote now!`,
        link: '/work',
        jobId: job.id,
        metadata: { category: rawCategory, suburb, job_id: job.id },
      }).catch(() => null)
    );
    await Promise.allSettled(promises);
    return { notified: tradieIds.length };
  } catch (err) {
    console.error('Failed to notify tradies for new lead:', err);
    return { notified: 0 };
  }
}

export async function notifyTradiesForUrgentJob(job: Job) {
  try {
    const { data: tradies } = await supabase
      .from('profiles')
      .select('id, full_name, push_enabled, sms_alerts_enabled, has_push_subscription')
      .eq('role', 'tradie');

    if (!tradies || tradies.length === 0) return { push: 0, sms: 0 };

    // Record impressions so the nudge cron can age the lead and escalate if no quote.
    const recipientIds = tradies.map((t: { id: string }) => t.id).filter((id) => id !== job.client_id);
    if (recipientIds.length > 0) {
      const urgentImpressions: Insert<'lead_impressions'>[] =
        recipientIds.map((tradieId): Insert<'lead_impressions'> => ({ job_id: job.id, tradie_id: tradieId }));
      await supabase
        .from('lead_impressions')
        .upsert(
          urgentImpressions,
          { onConflict: 'job_id,tradie_id', ignoreDuplicates: true },
        );
    }

    let pushCount = 0;
    let smsCount = 0;

    // has_push_subscription is a presence flag maintained by a trigger; the
    // subscription itself is in profile_private and must not be selected here.
    const pushEligible = tradies.filter((t) => t.push_enabled && t.has_push_subscription);
    if (pushEligible.length > 0) {
      pushCount = pushEligible.length;
    }

    const smsEligible = tradies.filter((t) => t.sms_alerts_enabled);
    if (smsEligible.length > 0) {
      const smsResult = simulateSmsAlert(
        job,
        smsEligible.map((t) => t.full_name || 'Unknown Tradie')
      );
      smsCount = smsResult.recipientCount;
    }

    return { push: pushCount, sms: smsCount };
  } catch (err) {
    console.error('Failed to notify tradies for urgent job:', err);
    return { push: 0, sms: 0 };
  }
}
