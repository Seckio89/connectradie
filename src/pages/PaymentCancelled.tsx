import { useNavigate } from 'react-router-dom';
import { XCircle } from 'lucide-react';

// Landing page Stripe redirects to when the user backs out of hosted checkout
// (cancel_url = /payment-cancelled). No charge was made — reassure the user and
// route them back into the app so they're never stranded on Stripe's domain.
export default function PaymentCancelled() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
        <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <XCircle className="w-7 h-7 text-amber-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Payment cancelled</h1>
        <p className="text-sm text-gray-600 mb-5">
          No payment was taken. You can pick up where you left off whenever you're ready.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate('/payments', { replace: true })}
            className="inline-flex items-center justify-center px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Back to payments
          </button>
          <button
            onClick={() => navigate('/dashboard', { replace: true })}
            className="inline-flex items-center justify-center px-4 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium rounded-lg transition-colors"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
