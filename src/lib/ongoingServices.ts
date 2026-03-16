import { supabase } from './supabase';
import type {
  ServiceAgreement,
  ServiceAgreementFrequency,
  ServiceVisit,
  ServiceVisitType,
  ServiceInvoice,
} from '../types/database';

// ── Agreements ─────────────────────────────────────────────

export async function getActiveAgreements(
  userId: string,
  role: 'client' | 'tradie',
): Promise<(ServiceAgreement & { client?: { full_name: string }; tradie?: { full_name: string } })[]> {
  const column = role === 'client' ? 'client_id' : 'tradie_id';
  const joinSelect = role === 'client'
    ? 'tradie:profiles!service_agreements_tradie_id_fkey(full_name)'
    : 'client:profiles!service_agreements_client_id_fkey(full_name)';

  const { data, error } = await supabase
    .from('service_agreements')
    .select(`*, ${joinSelect}`)
    .eq(column, userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as (ServiceAgreement & { client?: { full_name: string }; tradie?: { full_name: string } })[];
}

export async function createAgreement(
  tradieId: string,
  clientId: string,
  details: {
    title: string;
    description?: string;
    trade_category: string;
    address: string;
    suburb?: string;
    state?: string;
    postcode?: string;
    rate_per_visit: number;
    typical_frequency?: ServiceAgreementFrequency;
    typical_day?: string;
    typical_time?: string;
    notes?: string;
    billing_cycle?: ServiceAgreement['billing_cycle'];
    original_job_id?: string;
    original_quote_id?: string;
  },
): Promise<ServiceAgreement> {
  const { data, error } = await supabase
    .from('service_agreements')
    .insert({
      client_id: clientId,
      tradie_id: tradieId,
      ...details,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ServiceAgreement;
}

export async function updateAgreement(
  id: string,
  updates: Partial<Pick<ServiceAgreement, 'title' | 'description' | 'rate_per_visit' | 'typical_frequency' | 'typical_day' | 'typical_time' | 'notes' | 'billing_cycle' | 'status' | 'ended_at'>>,
): Promise<void> {
  const { error } = await supabase
    .from('service_agreements')
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function pauseAgreement(id: string): Promise<void> {
  await updateAgreement(id, { status: 'paused' });
}

export async function endAgreement(id: string): Promise<void> {
  await updateAgreement(id, { status: 'ended', ended_at: new Date().toISOString() });
}

// ── Visits ─────────────────────────────────────────────────

export async function logVisit(
  agreementId: string,
  visit: {
    visit_date: string;
    visit_type: ServiceVisitType;
    amount: number;
    notes?: string;
  },
): Promise<ServiceVisit> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('service_visits')
    .insert({
      agreement_id: agreementId,
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: user.id,
      ...visit,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ServiceVisit;
}

export async function getVisitsForPeriod(
  agreementId: string,
  startDate: string,
  endDate: string,
): Promise<ServiceVisit[]> {
  const { data, error } = await supabase
    .from('service_visits')
    .select('*')
    .eq('agreement_id', agreementId)
    .gte('visit_date', startDate)
    .lte('visit_date', endDate)
    .order('visit_date', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ServiceVisit[];
}

export async function getUninvoicedVisits(agreementId: string): Promise<ServiceVisit[]> {
  const { data, error } = await supabase
    .from('service_visits')
    .select('*')
    .eq('agreement_id', agreementId)
    .eq('status', 'completed')
    .is('invoice_id', null)
    .order('visit_date', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ServiceVisit[];
}

export interface MonthlyTotal {
  visits: ServiceVisit[];
  visitCount: number;
  subtotal: number;
  gst: number;
  total: number;
}

export async function getMonthlyTotal(
  agreementId: string,
  year: number,
  month: number,
): Promise<MonthlyTotal> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const visits = await getVisitsForPeriod(agreementId, startDate, endDate);
  const completed = visits.filter(v => v.status === 'completed');

  const subtotal = completed.reduce((sum, v) => sum + v.amount, 0);
  const gst = Math.round(subtotal * 0.1 * 100) / 100;

  return {
    visits: completed,
    visitCount: completed.length,
    subtotal,
    gst,
    total: subtotal + gst,
  };
}

// ── Invoices ───────────────────────────────────────────────

export async function generateInvoice(
  agreementId: string,
  periodStart: string,
  periodEnd: string,
): Promise<{ invoice: ServiceInvoice; visits: ServiceVisit[] }> {
  const visits = await getUninvoicedVisits(agreementId);
  const inPeriod = visits.filter(v => v.visit_date >= periodStart && v.visit_date <= periodEnd);

  if (inPeriod.length === 0) {
    throw new Error('No uninvoiced visits in this period');
  }

  const subtotal = inPeriod.reduce((sum, v) => sum + v.amount, 0);
  const gstAmount = Math.round(subtotal * 0.1 * 100) / 100;
  const total = subtotal + gstAmount;

  // Generate invoice number
  const year = new Date().getFullYear();
  const { data: lastInvoice } = await supabase
    .from('service_invoices')
    .select('invoice_number')
    .ilike('invoice_number', `INV-${year}-%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextNum = 1;
  if (lastInvoice) {
    const match = (lastInvoice.invoice_number as string).match(/INV-\d{4}-(\d+)/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  const invoiceNumber = `INV-${year}-${String(nextNum).padStart(4, '0')}`;

  const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: invoice, error: invoiceError } = await supabase
    .from('service_invoices')
    .insert({
      agreement_id: agreementId,
      invoice_number: invoiceNumber,
      period_start: periodStart,
      period_end: periodEnd,
      subtotal,
      gst_amount: gstAmount,
      total,
      visit_count: inPeriod.length,
      due_date: dueDate,
    })
    .select()
    .single();

  if (invoiceError) throw new Error(invoiceError.message);

  // Link visits to invoice
  const visitIds = inPeriod.map(v => v.id);
  const { error: updateError } = await supabase
    .from('service_visits')
    .update({ invoice_id: (invoice as ServiceInvoice).id })
    .in('id', visitIds);

  if (updateError) throw new Error(updateError.message);

  return { invoice: invoice as ServiceInvoice, visits: inPeriod };
}

export async function sendInvoice(invoiceId: string): Promise<ServiceInvoice> {
  const { data, error } = await supabase
    .from('service_invoices')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ServiceInvoice;
}

export async function markInvoicePaid(
  invoiceId: string,
  paymentMethod: string,
  paymentReference?: string,
): Promise<ServiceInvoice> {
  const { data, error } = await supabase
    .from('service_invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: paymentMethod,
      payment_reference: paymentReference,
    })
    .eq('id', invoiceId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ServiceInvoice;
}
