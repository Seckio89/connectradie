-- Admin dashboard: allow admins to read jobs, payments, and stripe_subscriptions
CREATE POLICY "Admins can view all jobs" ON jobs FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can view all payments" ON payments FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can view all stripe subscriptions" ON stripe_subscriptions FOR SELECT TO authenticated USING (is_admin());

-- Admin moderation: allow admins to delete reviews
CREATE POLICY "Admins can delete reviews" ON reviews FOR DELETE TO authenticated USING (is_admin());
