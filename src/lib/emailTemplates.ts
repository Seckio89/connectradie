import { supabase } from './supabase';
import { callEdgeFunction } from './edgeFn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmailCategory =
  | 'job_updates'
  | 'quotes'
  | 'messages'
  | 'payments'
  | 'reviews'
  | 'marketing'
  | 'account'
  | 'reminders';

export interface EmailTemplate {
  key: string;
  category: EmailCategory;
  subject: (data: Record<string, string>) => string;
  body: (data: Record<string, string>) => string;
}

export interface EmailPreference {
  id: string;
  user_id: string;
  category: EmailCategory;
  enabled: boolean;
}

export interface BatchEmailRequest {
  to: string;
  template: string;
  data: Record<string, string>;
}

export interface BatchEmailResult {
  to: string;
  template: string;
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const EMAIL_CATEGORIES: EmailCategory[] = [
  'job_updates',
  'quotes',
  'messages',
  'payments',
  'reviews',
  'marketing',
  'account',
  'reminders',
];

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  new_lead: {
    key: 'new_lead',
    category: 'job_updates',
    subject: (d) => `New ${d.tradeCategory} job in ${d.postcode}`,
    body: (d) => `G'day ${d.tradieName},\n\nA new ${d.tradeCategory} job has been posted in ${d.postcode}.\n\nDescription: ${d.description}\n\nLog in to view and quote on this job.\n\nCheers,\nConnecTradie`,
  },
  quote_received: {
    key: 'quote_received',
    category: 'quotes',
    subject: () => 'You\'ve received a new quote',
    body: (d) => `Hi ${d.clientName},\n\nGreat news! ${d.tradieName} has sent you a quote for your ${d.tradeCategory} job.\n\nQuote amount: $${d.amount}\n\nLog in to review and accept the quote.\n\nCheers,\nConnecTradie`,
  },
  quote_accepted: {
    key: 'quote_accepted',
    category: 'quotes',
    subject: () => 'Your quote has been accepted!',
    body: (d) => `G'day ${d.tradieName},\n\n${d.clientName} has accepted your quote for the ${d.tradeCategory} job.\n\nPlease get in touch to arrange a start date.\n\nCheers,\nConnecTradie`,
  },
  job_funded: {
    key: 'job_funded',
    category: 'payments',
    subject: () => 'Job deposit received',
    body: (d) => `G'day ${d.tradieName},\n\nThe deposit for your ${d.tradeCategory} job has been received and is held in escrow.\n\nAmount: $${d.amount}\n\nYou can now proceed with the work.\n\nCheers,\nConnecTradie`,
  },
  job_completed: {
    key: 'job_completed',
    category: 'job_updates',
    subject: () => 'Job marked as completed',
    body: (d) => `Hi ${d.clientName},\n\nYour ${d.tradeCategory} job has been marked as completed by ${d.tradieName}.\n\nPlease log in to confirm completion and leave a review.\n\nCheers,\nConnecTradie`,
  },
  message_received: {
    key: 'message_received',
    category: 'messages',
    subject: (d) => `New message from ${d.senderName}`,
    body: (d) => `Hi ${d.recipientName},\n\nYou have a new message from ${d.senderName}.\n\nLog in to read and reply.\n\nCheers,\nConnecTradie`,
  },
  payment_received: {
    key: 'payment_received',
    category: 'payments',
    subject: () => 'Payment received',
    body: (d) => `G'day ${d.tradieName},\n\nA payment of $${d.amount} has been received for your ${d.tradeCategory} job.\n\nFunds will be transferred to your account within 2-3 business days.\n\nCheers,\nConnecTradie`,
  },
  review_reminder: {
    key: 'review_reminder',
    category: 'reminders',
    subject: () => 'How was your experience?',
    body: (d) => `Hi ${d.clientName},\n\nYour ${d.tradeCategory} job with ${d.tradieName} was recently completed.\n\nWe'd love to hear how it went! Your review helps other homeowners and supports great tradies.\n\nLog in to leave a review.\n\nCheers,\nConnecTradie`,
  },
  license_expiry: {
    key: 'license_expiry',
    category: 'reminders',
    subject: (d) => `Your license expires in ${d.daysRemaining} days`,
    body: (d) => `G'day ${d.tradieName},\n\nYour ${d.licenseState} trade license (${d.licenseNumber}) expires on ${d.expiryDate}.\n\nPlease renew your license and update your profile to maintain your verified status.\n\nCheers,\nConnecTradie`,
  },
  welcome_client: {
    key: 'welcome_client',
    category: 'account',
    subject: () => 'Welcome to ConnecTradie!',
    body: (d) => `Hi ${d.name},\n\nWelcome to ConnecTradie! You can now post jobs and connect with verified tradies across Australia.\n\nGet started by posting your first job.\n\nCheers,\nConnecTradie`,
  },
  welcome_tradie: {
    key: 'welcome_tradie',
    category: 'account',
    subject: () => 'Welcome to ConnecTradie!',
    body: (d) => `G'day ${d.name},\n\nWelcome to ConnecTradie! Complete your profile and get verified to start receiving job leads in your area.\n\nNext steps:\n1. Add your ABN and license details\n2. Upload verification documents\n3. Set your service areas and rates\n\nCheers,\nConnecTradie`,
  },
  verification_approved: {
    key: 'verification_approved',
    category: 'account',
    subject: () => 'Verification approved!',
    body: (d) => `G'day ${d.tradieName},\n\nYour identity verification has been approved. You now have a verified badge on your profile.\n\nThis helps build trust with potential clients.\n\nCheers,\nConnecTradie`,
  },
  verification_rejected: {
    key: 'verification_rejected',
    category: 'account',
    subject: () => 'Verification update required',
    body: (d) => `G'day ${d.tradieName},\n\nUnfortunately, we were unable to verify your documents.\n\nReason: ${d.reason}\n\nPlease re-upload clearer documents and try again.\n\nCheers,\nConnecTradie`,
  },
  subscription_created: {
    key: 'subscription_created',
    category: 'payments',
    subject: () => 'Welcome to ConnecTradie Pro!',
    body: (d) => `G'day ${d.tradieName},\n\nYou're now a ConnecTradie Pro member! Enjoy zero platform fees, priority search ranking, and unlimited leads.\n\nYour ${d.billingCycle} subscription is now active.\n\nCheers,\nConnecTradie`,
  },
  subscription_cancelled: {
    key: 'subscription_cancelled',
    category: 'payments',
    subject: () => 'Pro subscription cancelled',
    body: (d) => `G'day ${d.tradieName},\n\nYour ConnecTradie Pro subscription has been cancelled. You'll continue to have Pro access until ${d.endDate}.\n\nWe hope to see you back soon!\n\nCheers,\nConnecTradie`,
  },
  escrow_released: {
    key: 'escrow_released',
    category: 'payments',
    subject: () => 'Escrow funds released',
    body: (d) => `G'day ${d.tradieName},\n\nEscrow funds of $${d.amount} for your ${d.tradeCategory} job have been released.\n\nThe funds will appear in your connected account within 2-3 business days.\n\nCheers,\nConnecTradie`,
  },
  refund_processed: {
    key: 'refund_processed',
    category: 'payments',
    subject: () => 'Refund processed',
    body: (d) => `Hi ${d.clientName},\n\nA refund of $${d.amount} has been processed for your ${d.tradeCategory} job.\n\nThe refund should appear on your statement within 5-10 business days.\n\nCheers,\nConnecTradie`,
  },
  recurring_job_reminder: {
    key: 'recurring_job_reminder',
    category: 'reminders',
    subject: (d) => `Reminder: ${d.tradeCategory} service due soon`,
    body: (d) => `Hi ${d.clientName},\n\nYour recurring ${d.tradeCategory} service is due on ${d.dueDate}.\n\nWould you like to rebook with ${d.tradieName}? Log in to schedule your next appointment.\n\nCheers,\nConnecTradie`,
  },
};

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/**
 * Fetch all email preferences for a user.
 */
export async function getEmailPreferences(userId: string): Promise<EmailPreference[]> {
  const { data, error } = await supabase
    .from('email_preferences')
    .select('*')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);

  return (data as EmailPreference[]) ?? [];
}

/**
 * Update (upsert) a single email preference for a user.
 */
export async function updateEmailPreference(
  userId: string,
  category: EmailCategory,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('email_preferences')
    .upsert(
      { user_id: userId, category, enabled },
      { onConflict: 'user_id,category' },
    );

  if (error) throw new Error(error.message);
}

/**
 * Check whether we should send an email of a given category to a user.
 * Defaults to true if no preference row exists.
 */
export async function shouldSendEmail(
  userId: string,
  category: EmailCategory,
): Promise<boolean> {
  const { data } = await supabase
    .from('email_preferences')
    .select('enabled')
    .eq('user_id', userId)
    .eq('category', category)
    .maybeSingle();

  // Default to enabled if no preference exists
  return data?.enabled !== false;
}

// ---------------------------------------------------------------------------
// Trigger helpers — send via edge function
// ---------------------------------------------------------------------------

async function sendEmail(
  to: string,
  templateKey: string,
  data: Record<string, string>,
): Promise<void> {
  const template = EMAIL_TEMPLATES[templateKey];
  if (!template) throw new Error(`Unknown email template: ${templateKey}`);

  await callEdgeFunction('send-email', {
    to,
    subject: template.subject(data),
    body: template.body(data),
    templateKey,
    category: template.category,
  });
}

/**
 * Notify a tradie about a new lead in their area.
 */
export async function notifyNewLead(
  tradieId: string,
  jobDetails: { tradeCategory: string; postcode: string; description: string },
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', tradieId)
    .maybeSingle();

  if (!profile?.email) return;
  if (!(await shouldSendEmail(tradieId, 'job_updates'))) return;

  await sendEmail(profile.email, 'new_lead', {
    tradieName: profile.full_name ?? 'Tradie',
    ...jobDetails,
  });
}

/**
 * Notify a client that they have received a new quote.
 */
export async function notifyQuoteReceived(
  clientId: string,
  quoteDetails: { tradieName: string; tradeCategory: string; amount: string },
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', clientId)
    .maybeSingle();

  if (!profile?.email) return;
  if (!(await shouldSendEmail(clientId, 'quotes'))) return;

  await sendEmail(profile.email, 'quote_received', {
    clientName: profile.full_name ?? 'Homeowner',
    ...quoteDetails,
  });
}

/**
 * Notify a user that they have received a new message.
 */
export async function notifyMessageReceived(
  userId: string,
  senderName: string,
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.email) return;
  if (!(await shouldSendEmail(userId, 'messages'))) return;

  await sendEmail(profile.email, 'message_received', {
    recipientName: profile.full_name ?? 'User',
    senderName,
  });
}

/**
 * Send a review reminder to a client after job completion.
 */
export async function sendReviewReminder(
  clientId: string,
  jobDetails: { tradieName: string; tradeCategory: string },
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', clientId)
    .maybeSingle();

  if (!profile?.email) return;
  if (!(await shouldSendEmail(clientId, 'reminders'))) return;

  await sendEmail(profile.email, 'review_reminder', {
    clientName: profile.full_name ?? 'Homeowner',
    ...jobDetails,
  });
}

// ---------------------------------------------------------------------------
// Batch send
// ---------------------------------------------------------------------------

/**
 * Send multiple emails in parallel and collect results.
 */
export async function sendBatchEmails(
  emails: BatchEmailRequest[],
): Promise<BatchEmailResult[]> {
  const results = await Promise.allSettled(
    emails.map(async (email) => {
      const template = EMAIL_TEMPLATES[email.template];
      if (!template) throw new Error(`Unknown template: ${email.template}`);

      await callEdgeFunction('send-email', {
        to: email.to,
        subject: template.subject(email.data),
        body: template.body(email.data),
        templateKey: email.template,
        category: template.category,
      });

      return { to: email.to, template: email.template, success: true } as BatchEmailResult;
    }),
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      to: emails[index].to,
      template: emails[index].template,
      success: false,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });
}
