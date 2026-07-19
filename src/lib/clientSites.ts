import { supabase } from './supabase';
import type { ClientSite } from '../types/database';

// ─────────────────────────────────────────────────────────────────────────────
// clientSites — multiple locations per CRM client (home / office / rental).
// RLS scopes every row to the tradie who owns the parent contact; the default
// site mirrors the contact's original address (backfilled by migration).
// ─────────────────────────────────────────────────────────────────────────────

export interface SiteInput {
  siteName: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  accessInstructions?: string | null;
  notes?: string | null;
}

export async function listClientSites(clientContactId: string): Promise<ClientSite[]> {
  const { data } = await supabase
    .from('client_sites')
    .select('*')
    .eq('client_contact_id', clientContactId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  return (data as ClientSite[] | null) ?? [];
}

export async function createClientSite(
  clientContactId: string,
  input: SiteInput,
  makeDefault = false,
): Promise<{ ok: boolean; site?: ClientSite; error?: string }> {
  const name = input.siteName.trim();
  if (!name) return { ok: false, error: 'Give the location a name (e.g. Home, Office).' };
  try {
    if (makeDefault) await clearDefault(clientContactId);
    const { data, error } = await supabase
      .from('client_sites')
      .insert({
        client_contact_id: clientContactId,
        site_name: name,
        address: input.address?.trim() || null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        contact_email: input.contactEmail?.trim() || null,
        contact_phone: input.contactPhone?.trim() || null,
        access_instructions: input.accessInstructions?.trim() || null,
        notes: input.notes?.trim() || null,
        is_default: makeDefault,
      })
      .select('*')
      .single();
    if (error || !data) return { ok: false, error: 'Could not save the location.' };
    return { ok: true, site: data as ClientSite };
  } catch {
    return { ok: false, error: 'Could not save the location.' };
  }
}

export async function updateClientSite(siteId: string, input: SiteInput): Promise<{ ok: boolean; error?: string }> {
  const name = input.siteName.trim();
  if (!name) return { ok: false, error: 'Give the location a name.' };
  const { error } = await supabase
    .from('client_sites')
    .update({
      site_name: name,
      address: input.address?.trim() || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      contact_email: input.contactEmail?.trim() || null,
      contact_phone: input.contactPhone?.trim() || null,
      access_instructions: input.accessInstructions?.trim() || null,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', siteId);
  return error ? { ok: false, error: 'Could not update the location.' } : { ok: true };
}

export async function deleteClientSite(siteId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('client_sites').delete().eq('id', siteId);
  return { ok: !error };
}

async function clearDefault(clientContactId: string): Promise<void> {
  await supabase
    .from('client_sites')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('client_contact_id', clientContactId)
    .eq('is_default', true);
}

export async function setDefaultSite(clientContactId: string, siteId: string): Promise<{ ok: boolean }> {
  try {
    await clearDefault(clientContactId);
    const { error } = await supabase
      .from('client_sites')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', siteId);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
