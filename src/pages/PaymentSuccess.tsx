import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { verifyPayment } from '../lib/stripePayments';

// Landing page Stripe redirects to after a successful hosted checkout
// (success_url = /payment-success?session_id={CHECKOUT_SESSION_ID}&payment_id=...).
// The webhook is the source of truth for flipping the invoice to Paid, but it can
// lag a few seconds — so when we have a payment_id we also fire verify-payment as a
// best-effort fallback, then send the user back into the app dashboard.
export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const paymentId = params.get('payment_id');
  const [verifying, setVerifying] = useState(Boolean(paymentId));

  const goToDashboard = () => navigate('/dashboard', { replace: true });

  useEffect(() => {
    let active = true;

    // Best-effort reconcile in case the webhook hasn't landed yet. Never blocks the
    // user — any failure just falls through to the dashboard, where the webhook will
    // have updated the record by the time they look.
    const reconcile = async () => {
      if (paymentId) {
        try {
          await verifyPayment(paymentId);
        } catch {
          /* webhook will reconcile — ignore */
        }
      }
      if (active) setVerifying(false);
    };
    reconcile();

    // Auto-return to the app after a short beat so the user isn't stranded.
    const timer = setTimeout(() => {
      if (active) goToDashboard();
    }, 3000);

    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
        <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Payment successful</h1>
        <p className="text-sm text-gray-600 mb-4">
          {verifying
            ? 'Confirming your payment…'
            : 'Your payment has been processed. Taking you back to your dashboard…'}
        </p>
        <button
          onClick={goToDashboard}
          className="mt-2 inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {verifying && <Loader2 className="w-4 h-4 animate-spin" />}
          Back to dashboard
        </button>
      </div>
    </div>
  );
}
