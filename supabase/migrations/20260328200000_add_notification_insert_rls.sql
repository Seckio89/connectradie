-- Allow authenticated users to insert notifications (e.g., service cancellation, price updates)
CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT TO authenticated
  WITH CHECK (true);
