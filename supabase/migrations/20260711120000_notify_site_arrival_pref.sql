-- Per-person opt-out for "tradie arrived on site" (geofence) notifications.
-- Checked by the geofence-event edge function before notifying each recipient
-- (client and the assigning contractor). Defaults on — arrival alerts are useful.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_site_arrival boolean NOT NULL DEFAULT true;
