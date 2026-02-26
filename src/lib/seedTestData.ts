import { supabase } from './supabase';

export async function seedTestData(userId: string): Promise<void> {
  try {
    const jobs = [
      {
        client_id: userId,
        tradie_id: userId,
        description: 'Complete bathroom renovation including new tiles, fixtures, vanity, and shower screen. High-quality finishes required.',
        location_address: '42 Test Street, Sydney NSW 2000',
        status: 'in_progress',
        budget_type: 'fixed_budget',
        budget_amount: 8000,
        contact_name: 'Test Client',
        contact_phone: '0400 000 000',
        scheduled_time: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        estimated_duration: '5-7 days',
        job_complexity: 'complex',
        access_instructions: 'Key under front mat',
      },
      {
        client_id: userId,
        tradie_id: userId,
        description: 'Emergency plumbing required - burst pipe in laundry causing water damage. Need immediate attention.',
        location_address: '42 Test Street, Sydney NSW 2000',
        status: 'pending',
        budget_type: 'request_quote',
        contact_name: 'Test Client',
        contact_phone: '0400 000 000',
        job_complexity: 'urgent',
        is_emergency: true,
      },
    ];

    for (const job of jobs) {
      const { error: jobError } = await supabase.from('jobs').insert(job);
      if (jobError) throw jobError;
    }

  } catch (error) {
    throw error;
  }
}
