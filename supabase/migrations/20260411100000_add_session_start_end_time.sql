-- Add start_time and end_time to recurring_sessions
-- so clients/tradies can set arrival and finish times per visit.

ALTER TABLE recurring_sessions ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE recurring_sessions ADD COLUMN IF NOT EXISTS end_time TIME;

-- Proposal fields for tradie-proposed time changes (client must accept)
ALTER TABLE recurring_sessions ADD COLUMN IF NOT EXISTS proposed_start_time TIME;
ALTER TABLE recurring_sessions ADD COLUMN IF NOT EXISTS proposed_end_time TIME;
ALTER TABLE recurring_sessions ADD COLUMN IF NOT EXISTS time_proposal_by TEXT CHECK (time_proposal_by IN ('client', 'tradie'));
